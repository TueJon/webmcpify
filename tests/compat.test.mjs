import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isStubTool, normalizeResult, parseInputSchema } from '../skills/webmcpify/templates/webmcp-compat.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const specSrc = readFileSync(join(root, 'skills/webmcpify/templates/webmcp.spec.ts'), 'utf8');

/**
 * Extract the REAL page.evaluate callback body from templates/webmcp.spec.ts,
 * strip TS-only syntax, and run it via new Function against a mock document.
 * This executes the shipped adapter — not a reimplementation — so breaking
 * the discriminator, branches, or normalization in the template fails here.
 */
function loadTemplateExecuteTool() {
  const blockStart = specSrc.indexOf('async function executeTool');
  const blockEnd = specSrc.indexOf('async function waitForTool');
  const block = specSrc.slice(blockStart, blockEnd);
  const sig = 'async ({ name, args }) => {';
  const sigAt = block.indexOf(sig);
  const argMarker = '{ name, args },';
  const endAt = block.lastIndexOf(argMarker);
  assert.ok(sigAt >= 0 && endAt > sigAt, 'executeTool page.evaluate callback not found in template');
  let body = block.slice(sigAt + sig.length, endAt).replace(/[\s},]*$/, '');
  body = body
    .replace(/\(t: \{ name: string \}\)/g, '(t)')
    .replace(/\(r: unknown\)/g, '(r)')
    .replace(/\(document as any\)/g, '(document)')
    .replace(/\(r as string\)/g, '(r)');
  return (name, args, modelContext) =>
    new Function('name', 'args', 'document', `return (async () => {${body}})()`)(name, args, { modelContext });
}

test('LLM envelope: string|object/undefined inputSchema → object parameters', () => {
  assert.deepEqual(parseInputSchema(JSON.stringify({ type: 'object', properties: { q: { type: 'string' } }, required: ['q'] })), { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] });
  assert.deepEqual(parseInputSchema({ type: 'object', properties: {} }), { type: 'object', properties: {} });
  assert.deepEqual(parseInputSchema(undefined), { type: 'object', properties: {} });
});

test('helpers: normalizeResult maps undefined/null/string/object; isStubTool checks the stub contract', () => {
  assert.equal(normalizeResult(undefined), null, 'undefined must become null, not leak through');
  assert.equal(normalizeResult(null), null);
  assert.equal(normalizeResult('already-string'), 'already-string');
  assert.equal(normalizeResult({ ok: true }), JSON.stringify({ ok: true }));
  assert.equal(normalizeResult(5), '5');
  assert.equal(isStubTool({ execute: async () => {} }), true, 'stub tools carry .execute');
  assert.equal(isStubTool({ inputSchema: { type: 'object' } }), false, 'native RegisteredTools never do');
  assert.equal(isStubTool({}), false);
});

test('webmcp.spec.ts page.evaluate is browser-serializable and heuristic-free', () => {
  const block = specSrc.slice(specSrc.indexOf('async function executeTool'), specSrc.indexOf('async function waitForTool'));
  assert.ok(block.includes('const normalizeResult'), 'normalize helper defined inside evaluate');
  assert.ok(!block.includes('[native code]'), 'provenance heuristic must not return (wrapped native breaks it)');
  assert.ok(!block.match(/typeof tool\?*\.?inputSchema === 'string'/), 'schema-shape discriminator must not return (omitted schemas break it)');
  assert.ok(block.includes('JSON.stringify(args)'), 'string-first: native contract');
  assert.ok(block.includes('e instanceof TypeError'), 'TypeError-class retry for spec stubs');
  assert.ok(block.includes('tool?.execute'), 'stub tools called via their own execute');
});

test('template executeTool: native (unwrapped) with present string schema → string input', async () => {
  const seen = [];
  const exec = loadTemplateExecuteTool();
  const mc = {
    getTools: async () => [{ name: 't', inputSchema: JSON.stringify({ type: 'object' }) }],
    executeTool: async (tool, input) => {
      seen.push(typeof input);
      assert.equal(typeof input, 'string', 'native path must pass a JSON string');
      return JSON.stringify({ ok: true, sku: 'abc' });
    },
  };
  const out = await exec('t', { q: 'hi' }, mc);
  assert.equal(out, JSON.stringify({ ok: true, sku: 'abc' }));
  assert.deepEqual(seen, ['string'], 'no wasted retry when the string succeeds');
});

test('template executeTool: WRAPPED native with present string schema → string input (reviewer repro)', async () => {
  const exec = loadTemplateExecuteTool();
  const nativeImpl = async (tool, input) => {
    assert.equal(typeof input, 'string', 'wrapped native still needs the JSON string');
    if (typeof input !== 'string') throw new TypeError('native expects JSON string');
    return JSON.stringify({ ok: true });
  };
  const mc = {
    getTools: async () => [{ name: 't', inputSchema: JSON.stringify({ type: 'object' }) }],
    // instrumentation wrapper — stringifies as JS source, forwards to native
    executeTool: async (...a) => nativeImpl(...a),
  };
  assert.equal(await exec('t', { q: 'hi' }, mc), JSON.stringify({ ok: true }));
});

test('template executeTool: WRAPPED native with OMITTED inputSchema → string input', async () => {
  const exec = loadTemplateExecuteTool();
  const nativeImpl = async (tool, input) => {
    assert.equal(typeof input, 'string', 'native zero-param tool still needs JSON-string args');
    assert.equal(input, '{}');
    return JSON.stringify({ ok: true });
  };
  const mc = {
    getTools: async () => [{ name: 't' }], // no inputSchema — Chrome 150 native zero-param tool
    executeTool: async (...a) => nativeImpl(...a),
  };
  assert.equal(await exec('t', {}, mc), JSON.stringify({ ok: true }));
});

test('template executeTool: spec stub with OMITTED inputSchema → rejects string, retries object', async () => {
  const calls = [];
  const exec = loadTemplateExecuteTool();
  const mc = {
    getTools: async () => [{ name: 't' }], // no inputSchema — spec-shaped stub zero-param tool
    executeTool: async (tool, input) => {
      calls.push(typeof input);
      if (typeof input === 'string') throw new TypeError('inputObject must be an object');
      return { ok: true };
    },
  };
  assert.equal(await exec('t', {}, mc), JSON.stringify({ ok: true }), 'object result normalized to JSON string');
  assert.deepEqual(calls, ['string', 'object'], 'string tried first, TypeError retry with object');
});

test('template executeTool: spec stub with object schema → rejects string, retries object', async () => {
  const exec = loadTemplateExecuteTool();
  const mc = {
    getTools: async () => [{ name: 't', inputSchema: { type: 'object' } }],
    executeTool: async (tool, input) => {
      if (typeof input === 'string') throw new TypeError('inputObject must be an object');
      return { ok: true };
    },
  };
  assert.equal(await exec('t', { q: 'hi' }, mc), JSON.stringify({ ok: true }), 'object result normalized to JSON string');
});

test('template executeTool: stub tool carrying .execute (no mc.executeTool) — object input, incl. undefined result', async () => {
  const exec = loadTemplateExecuteTool();
  const mc = {
    getTools: async () => [{ name: 't', inputSchema: { type: 'object' }, execute: async (a) => {
      assert.deepEqual(a, { q: 'hi' }, 'stub tool.execute receives the object');
      return { ok: true, echo: a.q };
    } }],
  };
  assert.equal(await exec('t', { q: 'hi' }, mc), JSON.stringify({ ok: true, echo: 'hi' }), 'stub branch reached and normalized');

  const mcUndefined = {
    getTools: async () => [{ name: 't', inputSchema: { type: 'object' }, execute: async () => undefined }],
  };
  assert.equal(await exec('t', {}, mcUndefined), null, 'undefined stub result must normalize to null');
});

test('template executeTool: native handler TypeError surfaces (no silent mask)', async () => {
  const exec = loadTemplateExecuteTool();
  const mc = {
    getTools: async () => [{ name: 't', inputSchema: JSON.stringify({ type: 'object' }) }],
    executeTool: async (tool, input) => {
      assert.equal(typeof input, 'string');
      throw new TypeError('handler bug: not a transport error');
    },
  };
  // both attempts fail with the handler's own TypeError — the error is not swallowed
  await assert.rejects(() => exec('t', {}, mc), /handler bug/);
});

test('template executeTool: unregistered tool rejects with a clear error', async () => {
  const exec = loadTemplateExecuteTool();
  const mc = { getTools: async () => [], executeTool: async () => 'unused' };
  await assert.rejects(() => exec('missing', {}, mc), /is not registered/);
});
