/**
 * TS/JS runtime parity — the two template variants must behave byte-identically.
 *
 * Transpiles templates/webmcpify.ts with esbuild (types stripped, logic intact)
 * and runs every scenario against BOTH modules, asserting deep-equal outcomes
 * plus absolute expected values. Node >= 20, `node --test`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { transformSync } from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const templates = join(root, 'skills', 'webmcpify', 'templates');

const { code } = transformSync(readFileSync(join(templates, 'webmcpify.ts'), 'utf8'), {
  loader: 'ts',
  target: 'es2020',
  format: 'esm',
});
const tmp = mkdtempSync(join(tmpdir(), 'webmcpify-parity-'));
writeFileSync(join(tmp, 'webmcpify.from-ts.mjs'), code);

const tsMod = await import(pathToFileURL(join(tmp, 'webmcpify.from-ts.mjs')).href);
const jsMod = await import(pathToFileURL(join(templates, 'webmcpify.js')).href);
const variants = [
  ['ts', tsMod],
  ['js', jsMod],
];

const MALFORMED_OK =
  'ERROR: The interface sent a completion without a boolean `ok` — the outcome is unknown. Check the current page state before retrying.';
const FAILED = 'ERROR: The action failed.';
const TIMEOUT =
  'ERROR: The interface did not confirm this action in time. The request was signalled to cancel but may still be processing — check the current page state before retrying.';
const BUSY =
  'ERROR: A previous invocation of this tool is still in progress. Wait for it to finish, then check the current page state before retrying.';

/** Fresh window shim per scenario; both variants read `window` at call time. */
function freshWindow() {
  const win = new EventTarget();
  win.dispatchEvent = EventTarget.prototype.dispatchEvent.bind(win);
  globalThis.window = win;
  return win;
}

function setModelContext(mc) {
  globalThis.document = mc === undefined ? {} : { modelContext: mc };
}

const validTool = (name) => ({
  name,
  description: 'A test tool used by the parity battery.',
  execute: async () => 'ok',
});

/** Run dispatchAndWait and answer the dispatched event with `completionDetail`. */
function dispatchScenario(mod, completionDetail) {
  const win = freshWindow();
  const seen = {};
  win.addEventListener('parity:evt', (e) => {
    seen.hasRequestId = typeof e.detail.requestId === 'string' && e.detail.requestId.length > 0;
    seen.passthrough = e.detail.foo;
    queueMicrotask(() => {
      const name = `tool-completion-${e.detail.requestId}`;
      win.dispatchEvent(
        completionDetail === undefined
          ? new CustomEvent(name) // no detail at all
          : new CustomEvent(name, { detail: completionDetail }),
      );
    });
  });
  return mod.dispatchAndWait('parity:evt', { foo: 'bar' }).then((result) => ({ ...seen, result }));
}

test('export surface parity', () => {
  const expected = [
    'createToolScope',
    'dispatchAndWait',
    'getModelContext',
    'isWebMCPAvailable',
    'singleFlight',
  ];
  assert.deepEqual(Object.keys(tsMod).sort(), expected);
  assert.deepEqual(Object.keys(jsMod).sort(), expected);
});

test('dispatchAndWait: ok:true with EMPTY message resolves the empty string (?? vs || drift)', async () => {
  const results = [];
  for (const [, mod] of variants) results.push(await dispatchScenario(mod, { ok: true, message: '' }));
  assert.deepEqual(results[0], results[1]);
  assert.deepEqual(results[0], { hasRequestId: true, passthrough: 'bar', result: '' });
});

test('dispatchAndWait: ok:true without message resolves the default success string', async () => {
  const results = [];
  for (const [, mod] of variants) results.push(await dispatchScenario(mod, { ok: true }));
  assert.deepEqual(results[0], results[1]);
  assert.equal(results[0].result, 'Action completed successfully.');
});

test('dispatchAndWait: completion without detail fails closed', async () => {
  const results = [];
  for (const [, mod] of variants) results.push(await dispatchScenario(mod, undefined));
  assert.deepEqual(results[0], results[1]);
  assert.equal(results[0].result, MALFORMED_OK);
});

test('dispatchAndWait: non-boolean ok ("yes") fails closed', async () => {
  const results = [];
  for (const [, mod] of variants) results.push(await dispatchScenario(mod, { ok: 'yes' }));
  assert.deepEqual(results[0], results[1]);
  assert.equal(results[0].result, MALFORMED_OK);
});

test('dispatchAndWait: ok:false without error resolves the default failure string', async () => {
  const results = [];
  for (const [, mod] of variants) results.push(await dispatchScenario(mod, { ok: false }));
  assert.deepEqual(results[0], results[1]);
  assert.equal(results[0].result, FAILED);
});

test('dispatchAndWait: ok:false with error interpolates it', async () => {
  const results = [];
  for (const [, mod] of variants) results.push(await dispatchScenario(mod, { ok: false, error: 'boom' }));
  assert.deepEqual(results[0], results[1]);
  assert.equal(results[0].result, 'ERROR: boom');
});

test('dispatchAndWait: timeout resolves the timeout string and aborts detail.signal', async () => {
  const results = [];
  for (const [, mod] of variants) {
    const win = freshWindow();
    const seen = {};
    win.addEventListener('parity:evt', (e) => {
      seen.hasRequestId = typeof e.detail.requestId === 'string';
      seen.signalIsAbortSignal = e.detail.signal instanceof AbortSignal;
      seen.abortedBefore = e.detail.signal.aborted;
      e.detail.signal.addEventListener('abort', () => {
        seen.abortedAfter = true;
      });
      // never answer → timeout path
    });
    const result = await mod.dispatchAndWait('parity:evt', {}, 20);
    results.push({ ...seen, result });
  }
  assert.deepEqual(results[0], results[1]);
  assert.deepEqual(results[0], {
    hasRequestId: true,
    signalIsAbortSignal: true,
    abortedBefore: false,
    abortedAfter: true,
    result: TIMEOUT,
  });
});

test('createToolScope: happy path — ready resolves true; duplicate key resolves false', async () => {
  const results = [];
  for (const [tag, mod] of variants) {
    freshWindow();
    setModelContext({ registerTool: async () => {} });
    const handle = mod.createToolScope(`happy-${tag}`, [validTool('tool_a')]);
    const ready = await handle.ready;
    const dupe = await mod.createToolScope(`happy-${tag}`, [validTool('tool_a')]).ready;
    handle();
    results.push({ ready, dupe, callable: typeof handle === 'function' });
  }
  assert.deepEqual(results[0], results[1]);
  assert.deepEqual(results[0], { ready: true, dupe: false, callable: true });
});

test('createToolScope: no WebMCP — no-op handle, ready false', async () => {
  const results = [];
  for (const [, mod] of variants) {
    setModelContext(undefined);
    const handle = mod.createToolScope('no-mc', []);
    results.push({ ready: await handle.ready, callable: typeof handle === 'function' });
    handle();
  }
  assert.deepEqual(results[0], results[1]);
  assert.deepEqual(results[0], { ready: false, callable: true });
});

test('createToolScope: sync-throwing registerTool — one onError, ready false, key reusable', async () => {
  const results = [];
  for (const [tag, mod] of variants) {
    freshWindow();
    const key = `sync-throw-${tag}`;
    setModelContext({
      registerTool() {
        throw new Error('legacy sync throw');
      },
    });
    const errors = [];
    const handle = mod.createToolScope(key, [validTool('tool_a')], {
      onError: (e) => errors.push(e instanceof Error ? e.message : String(e)),
    });
    const ready = await handle.ready;
    // The key must not be stranded — a retry with a working mc succeeds.
    setModelContext({ registerTool: async () => {} });
    const retry = mod.createToolScope(key, [validTool('tool_a')]);
    const retryReady = await retry.ready;
    retry();
    results.push({ ready, errors, retryReady });
  }
  assert.deepEqual(results[0], results[1]);
  assert.deepEqual(results[0], { ready: false, errors: ['legacy sync throw'], retryReady: true });
});

test('createToolScope: async rejection (mixed batch) — rollback, one onError, key reusable', async () => {
  const results = [];
  for (const [tag, mod] of variants) {
    freshWindow();
    const key = `async-reject-${tag}`;
    setModelContext({
      registerTool: async (tool) => {
        if (tool.name === 'bad_tool') throw new Error('registration rejected');
      },
    });
    const errors = [];
    const handle = mod.createToolScope(key, [validTool('good_tool'), validTool('bad_tool')], {
      onError: (e) => errors.push(e instanceof Error ? e.message : String(e)),
    });
    const ready = await handle.ready;
    setModelContext({ registerTool: async () => {} });
    const retry = mod.createToolScope(key, [validTool('good_tool')]);
    const retryReady = await retry.ready;
    retry();
    results.push({ ready, errors, retryReady });
  }
  assert.deepEqual(results[0], results[1]);
  assert.deepEqual(results[0], {
    ready: false,
    errors: ['registration rejected'],
    retryReady: true,
  });
});

test('createToolScope: dispose before settle then AbortError — silent (no onError), ready false', async () => {
  const results = [];
  for (const [tag, mod] of variants) {
    freshWindow();
    const key = `strict-mode-${tag}`;
    let reject;
    const gate = new Promise((_res, rej) => {
      reject = rej;
    });
    setModelContext({ registerTool: () => gate });
    const errors = [];
    const handle = mod.createToolScope(key, [validTool('tool_a')], {
      onError: (e) => errors.push(e),
    });
    handle(); // dispose while registration is pending (React StrictMode unmount)
    reject(new DOMException('The operation was aborted.', 'AbortError'));
    const ready = await handle.ready;
    results.push({ ready, errorCount: errors.length });
  }
  assert.deepEqual(results[0], results[1]);
  assert.deepEqual(results[0], { ready: false, errorCount: 0 });
});

test('singleFlight: overlapping calls get the busy string; the wrapper recovers', async () => {
  const results = [];
  for (const [, mod] of variants) {
    let release;
    const wrapped = mod.singleFlight(
      () =>
        new Promise((res) => {
          release = res;
        }),
    );
    const first = wrapped();
    const busy = await wrapped(); // resolves immediately while first is in flight
    release('first done');
    const firstResult = await first;
    const second = wrapped();
    release('second done');
    const secondResult = await second;
    results.push({ busy, firstResult, secondResult });
  }
  assert.deepEqual(results[0], results[1]);
  assert.deepEqual(results[0], {
    busy: BUSY,
    firstResult: 'first done',
    secondResult: 'second done',
  });
});

test('singleFlight: custom busy message is used', async () => {
  const results = [];
  for (const [, mod] of variants) {
    let release;
    const wrapped = mod.singleFlight(
      () =>
        new Promise((res) => {
          release = res;
        }),
      'ERROR: custom busy',
    );
    const first = wrapped();
    const busy = await wrapped();
    release('done');
    await first;
    results.push(busy);
  }
  assert.deepEqual(results[0], results[1]);
  assert.equal(results[0], 'ERROR: custom busy');
});
