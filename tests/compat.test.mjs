import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isNativeExecuteTool, normalizeResult, parseInputSchema } from '../skills/webmcpify/templates/webmcp-compat.js';

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
    .replace(/\(tool: any\)/g, '(tool)')
    .replace(/\(mc: any\)/g, '(mc)')
    .replace(/\(r: unknown\)/g, '(r)')
    .replace(/\(t: \{ name: string \}\)/g, '(t)')
    .replace(/\(document as any\)/g, '(document)')
    .replace(/\(r as string\)/g, '(r)');
  return (name, args, modelContext) =>
    new Function('name', 'args', 'document', `return (async () => {${body}})()`)(name, args, { modelContext });
}

/** Bound functions stringify as [native code] — a truthful native-transport mock. */
const nativeExec = (impl) => (async (tool, input) => impl(tool, input)).bind(null);

test('LLM envelope: string|object/undefined inputSchema → object parameters', () => {
  assert.deepEqual(parseInputSchema(JSON.stringify({ type: 'object', properties: { q: { type: 'string' } }, required: ['q'] })), { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] });
  assert.deepEqual(parseInputSchema({ type: 'object', properties: {} }), { type: 'object', properties: {} });
  assert.deepEqual(parseInputSchema(undefined), { type: 'object', properties: {} });
});

test('helpers: normalizeResult maps undefined/null/string/object; isNativeExecuteTool probes capability', () => {
  assert.equal(normalizeResult(undefined), null, 'undefined must become null, not leak through');
  assert.equal(normalizeResult(null), null);
  assert.equal(normalizeResult('already-string'), 'already-string');
  assert.equal(normalizeResult({ ok: true }), JSON.stringify({ ok: true }));
  assert.equal(normalizeResult(5), '5');
  // capability probe — NOT schema shape (schema shape fails for omitted schemas)
  assert.equal(isNativeExecuteTool({ executeTool: nativeExec(() => {}) }), true, 'bound (native-like) executeTool → native');
  assert.equal(isNativeExecuteTool({ executeTool: async () => {} }), false, 'plain JS stub → not native');
  assert.equal(isNativeExecuteTool({}), false);
  assert.equal(isNativeExecuteTool({ executeTool: 'not-a-fn' }), false);
});

test('webmcp.spec.ts page.evaluate is browser-serializable', () => {
  const block = specSrc.slice(specSrc.indexOf('async function executeTool'), specSrc.indexOf('async function waitForTool'));
  assert.ok(block.includes('const isNativeExecuteTool'), 'capability probe defined inside evaluate');
  assert.ok(block.includes('const normalizeResult'), 'normalize helper defined inside evaluate');
  assert.match(block, /const isNative = isNativeExecuteTool\(mc\)/, 'discriminator uses the capability probe');
  assert.ok(!block.includes('isNativeInputSchema'), 'schema-shape discriminator must not return (breaks omitted schemas)');
  assert.ok(block.includes('JSON.stringify(args)'), 'stringify used for native input');
});

test('template executeTool: native with PRESENT string schema → string input, string result', async () => {
  const seen = [];
  const exec = loadTemplateExecuteTool();
  const mc = {
    getTools: async () => [{ name: 't', inputSchema: JSON.stringify({ type: 'object' }) }],
    executeTool: nativeExec((tool, input) => {
      seen.push(typeof input);
      assert.equal(typeof input, 'string', 'native path must pass a JSON string');
      return JSON.stringify({ ok: true, sku: 'abc' });
    }),
  };
  const out = await exec('t', { q: 'hi' }, mc);
  assert.equal(out, JSON.stringify({ ok: true, sku: 'abc' }));
  assert.deepEqual(seen, ['string']);
});

test('template executeTool: native with OMITTED inputSchema (zero-param) → string input', async () => {
  const exec = loadTemplateExecuteTool();
  const mc = {
    getTools: async () => [{ name: 't' }], // no inputSchema at all — Chrome 150 native zero-param tool
    executeTool: nativeExec((tool, input) => {
      assert.equal(typeof input, 'string', 'native zero-param tool still needs JSON-string args');
      assert.equal(input, '{}');
      return JSON.stringify({ ok: true });
    }),
  };
  assert.equal(await exec('t', {}, mc), JSON.stringify({ ok: true }));
});

test('template executeTool: spec stub with OMITTED inputSchema → object input', async () => {
  const exec = loadTemplateExecuteTool();
  const mc = {
    getTools: async () => [{ name: 't' }], // no inputSchema — spec-shaped stub zero-param tool
    executeTool: async (tool, input) => {
      assert.equal(typeof input, 'object', 'spec stub receives the object even without a schema');
      if (typeof input === 'string') throw new TypeError('inputObject must be an object');
      return { ok: true };
    },
  };
  assert.equal(await exec('t', {}, mc), JSON.stringify({ ok: true }));
});

test('template executeTool: spec stub with object schema rejects strings with TypeError → object input via adapter', async () => {
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

test('template executeTool: stub fallback (no executeTool) via tool.execute, incl. undefined result', async () => {
  const exec = loadTemplateExecuteTool();
  const mc = {
    getTools: async () => [{ name: 't', inputSchema: { type: 'object' }, execute: async (a) => ({ ok: true, echo: a.q }) }],
  };
  assert.equal(await exec('t', { q: 'hi' }, mc), JSON.stringify({ ok: true, echo: 'hi' }), 'stub branch reached and normalized');

  const mcUndefined = {
    getTools: async () => [{ name: 't', inputSchema: { type: 'object' }, execute: async () => undefined }],
  };
  assert.equal(await exec('t', {}, mcUndefined), null, 'undefined stub result must normalize to null');
});

test('template executeTool: unregistered tool rejects with a clear error', async () => {
  const exec = loadTemplateExecuteTool();
  const mc = { getTools: async () => [], executeTool: nativeExec(() => 'unused') };
  await assert.rejects(() => exec('missing', {}, mc), /is not registered/);
});
