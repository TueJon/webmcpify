import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(join(root, 'skills/webmcpify/templates/webmcp-workbench.js'), 'utf8');
const runnerSource = readFileSync(join(root, 'skills/webmcpify/scripts/workbench.mjs'), 'utf8');

function loadApi(globals = {}) {
  const sandbox = { globalThis: { ...globals }, Event, AbortController, DOMException };
  sandbox.globalThis.globalThis = sandbox.globalThis;
  vm.runInNewContext(source, sandbox, { filename: 'webmcp-workbench.js' });
  return sandbox.globalThis.WebMCPifyWorkbench;
}

test('workbench is a classic dependency-free script with no browser side effect by default', () => {
  const api = loadApi();
  assert.equal(typeof api.start, 'function');
  assert.equal(typeof api.stop, 'function');
  assert.ok(!source.includes('fetch('));
  assert.ok(!source.includes('localStorage'));
});

test('launcher can provision Playwright outside a target project', () => {
  assert.ok(!runnerSource.includes("from 'playwright'"));
  assert.match(runnerSource, /tmpdir\(\)/);
  assert.match(runnerSource, /PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD/);
  assert.match(runnerSource, /JSON\.stringify\(\{ manifest, open: true \}\)/);
});

test('manifest input exposes only tools that passed the approval gate', () => {
  const api = loadApi();
  const manifest = { tools: [
    { id: 'new', status: 'discovered' },
    { id: 'denied', status: 'rejected' },
    { id: 'approved', status: 'approved' },
    { id: 'wired', status: 'integrated' },
    { id: 'working', status: 'verified' },
    { id: 'healing', status: 'failed' },
    { id: 'impossible', status: 'skipped' },
  ] };
  assert.deepEqual(Array.from(api.normalizeExpected(manifest), (tool) => tool.id), [
    'approved', 'wired', 'working', 'healing',
  ]);
  assert.deepEqual(Array.from(api.normalizeExpected(manifest.tools), (tool) => tool.id), [
    'new', 'denied', 'approved', 'wired', 'working', 'healing', 'impossible',
  ], 'an explicit expectedTools array remains a caller-owned approved subset');
});

test('workbench parses native string schemas and formats structured results', () => {
  const api = loadApi();
  assert.equal(JSON.stringify(api.parseSchema('{"type":"object","properties":{"q":{"type":"string"}}}')), JSON.stringify({
    type: 'object', properties: { q: { type: 'string' } },
  }));
  assert.equal(api.formatResult({ ok: true }), '{\n  "ok": true\n}');
  assert.equal(api.formatResult('plain text'), 'plain text');
});

test('simulated context registers, enumerates, executes and aborts tools', async () => {
  const api = loadApi();
  const events = [];
  const doc = { dispatchEvent: (event) => events.push(event.type) };
  const context = api.createSimulationContext(doc);
  const controller = new AbortController();
  await context.registerTool({
    name: 'search_tickets',
    inputSchema: { type: 'object' },
    execute: async ({ q }) => ({ count: q.length }),
  }, { signal: controller.signal });
  const [tool] = await context.getTools();
  assert.equal(tool.name, 'search_tickets');
  assert.equal(tool.execute, undefined, 'public simulated shape mirrors native RegisteredTool');
  assert.equal(await context.executeTool(tool, { q: 'bug' }), '{"count":3}');
  controller.abort();
  assert.equal((await context.getTools()).length, 0);
  assert.deepEqual(events, ['toolchange', 'toolchange']);
});

test('execute input probe distinguishes current object and legacy JSON-string browsers', async () => {
  const api = loadApi({ crypto: { randomUUID: () => 'probe-id' } });
  const makeContext = (mode) => {
    let registered;
    return {
      async registerTool(tool, options) {
        registered = tool;
        options.signal.addEventListener('abort', () => { registered = undefined; }, { once: true });
      },
      async getTools() { return registered ? [{ name: registered.name }] : []; },
      async executeTool(tool, input) {
        if (mode === 'json-string' && typeof input !== 'string') {
          throw new DOMException('Failed to parse input arguments', 'UnknownError');
        }
        return registered.execute(typeof input === 'string' ? JSON.parse(input) : input);
      },
    };
  };
  for (const mode of ['object', 'json-string']) {
    const installed = { context: makeContext(mode), evidence: 'native', inputMode: null };
    assert.equal(await api.detectExecuteInputMode(installed), mode);
    assert.equal(await api.detectExecuteInputMode(installed), mode, 'the side-effect-free probe is cached');
  }
});

test('simulated context rejects duplicate and malformed registrations', async () => {
  const api = loadApi();
  const context = api.createSimulationContext({ dispatchEvent() {} });
  await assert.rejects(() => context.registerTool({ name: 'broken' }), /execute function/);
  await context.registerTool({ name: 'one', execute() {} });
  await assert.rejects(() => context.registerTool({ name: 'one', execute() {} }), /already registered/);
});

test('simulation snapshots input/output schemas at registration and each enumeration', async () => {
  const context = loadApi().createSimulationContext({ dispatchEvent() {} });
  const inputSchema = { type: 'object', properties: { q: { type: 'string' } } };
  const outputSchema = { type: 'object', properties: { value: { type: 'string' } } };
  await context.registerTool({ name: 'read_schema', description: 'Reads fixture data.', inputSchema, outputSchema, execute: async () => ({ value: 'ok' }) });
  inputSchema.properties.q.type = 'number';
  outputSchema.properties.value.type = 'number';
  const [first] = await context.getTools();
  assert.equal(first.inputSchema.properties.q.type, 'string');
  assert.equal(first.outputSchema.properties.value.type, 'string');
  first.inputSchema.properties.q.type = 'boolean';
  first.outputSchema.properties.value.type = 'boolean';
  const [second] = await context.getTools();
  assert.equal(second.inputSchema.properties.q.type, 'string');
  assert.equal(second.outputSchema.properties.value.type, 'string');
  assert.equal(await context.executeTool(second, {}), '{"value":"ok"}');
});

test('schema serialization fails before registration and leaves the name reusable', async () => {
  for (const field of ['inputSchema', 'outputSchema']) {
    for (const makeInvalid of [
      () => { const schema = {}; schema.self = schema; return schema; },
      () => ({ value: 1n }),
      () => ({ toJSON() { return undefined; } }),
      () => 'not an object',
      () => null,
    ]) {
      const events = [];
      const context = loadApi().createSimulationContext({ dispatchEvent(event) { events.push(event.type); } });
      await assert.rejects(context.registerTool({ name: 'read_schema', [field]: makeInvalid(), execute: async () => ({ ok: true }) }), { name: 'TypeError' });
      assert.equal((await context.getTools()).length, 0);
      assert.equal(events.length, 0);
      await context.registerTool({ name: 'read_schema', execute: async () => ({ ok: true }) });
      assert.equal((await context.getTools()).length, 1);
    }
  }
});

test('schema snapshots use JSON serialization, permit omission and preserve metadata', async () => {
  const context = loadApi().createSimulationContext({ dispatchEvent() {} });
  await context.registerTool({ name: 'read_custom', outputSchema: { toJSON() { return { type: 'string' }; } }, execute: async () => 'value' });
  await context.registerTool({ name: 'read_omitted', inputSchema: undefined, outputSchema: undefined, execute: async () => 'value' });
  const [custom, omitted] = await context.getTools();
  assert.equal(JSON.stringify(custom.outputSchema), '{"type":"string"}');
  assert.equal(omitted.inputSchema, undefined);
  assert.equal(omitted.outputSchema, undefined);
});

test('stopping before DOM readiness removes the pending simulation context', async () => {
  const listeners = new Map();
  const document = {
    documentElement: null,
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
    dispatchEvent() {},
  };
  const api = loadApi({ document, navigator: {} });
  const pending = api.start();
  assert.equal(pending.evidence, 'simulated');
  assert.equal(document.modelContext !== undefined, true);
  api.stop();
  assert.equal(await pending.ready, null);
  assert.equal(document.modelContext, undefined);
  assert.equal(listeners.has('DOMContentLoaded'), false);
});


test('simulation separates registration lifetime from active invocation cancellation', async () => {
  const context = loadApi().createSimulationContext({ dispatchEvent() {} });
  const registration = new AbortController();
  const caller = new AbortController();
  let signal, finish, started;
  const began = new Promise(resolve => { started = resolve; });
  await context.registerTool({ name: 'delayed', execute(input, options) {
    assert.equal(JSON.stringify(input), '{}');
    signal = options.signal;
    started();
    return new Promise(resolve => { finish = resolve; });
  } }, { signal: registration.signal });
  const [tool] = await context.getTools();
  const pending = context.executeTool(tool, undefined, { signal: caller.signal });
  await began;
  registration.abort();
  assert.equal((await context.getTools()).length, 0);
  assert.equal(signal.aborted, false);
  const rejected = assert.rejects(pending, error => error === caller.signal.reason);
  caller.abort();
  await rejected;
  assert.equal(signal.aborted, true);
  finish({ ok: true }); // late completion cannot turn cancellation into success
});

test('simulation preabort skips execute; default input and serialized strings match current contract', async () => {
  const context = loadApi().createSimulationContext({ dispatchEvent() {} });
  let calls = 0;
  await context.registerTool({ name: 'one', async execute(input, options) {
    calls++;
    assert.equal(JSON.stringify(input), '{}');
    assert.ok(options.signal instanceof AbortSignal);
    return 'done';
  } });
  const [tool] = await context.getTools();
  const caller = new AbortController(); caller.abort();
  await assert.rejects(context.executeTool(tool, {}, { signal: caller.signal }), error => error === caller.signal.reason);
  assert.equal(calls, 0);
  assert.equal(await context.executeTool(tool), '"done"');
});
