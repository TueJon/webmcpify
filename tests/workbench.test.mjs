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
  const sandbox = { globalThis: { ...globals }, Event };
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
  assert.deepEqual(await context.executeTool(tool, { q: 'bug' }), { count: 3 });
  controller.abort();
  assert.equal((await context.getTools()).length, 0);
  assert.deepEqual(events, ['toolchange', 'toolchange']);
});

test('simulated context rejects duplicate and malformed registrations', async () => {
  const api = loadApi();
  const context = api.createSimulationContext({ dispatchEvent() {} });
  await assert.rejects(() => context.registerTool({ name: 'broken' }), /execute function/);
  await context.registerTool({ name: 'one', execute() {} });
  await assert.rejects(() => context.registerTool({ name: 'one', execute() {} }), /already registered/);
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
