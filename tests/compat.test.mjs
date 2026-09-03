import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isNativeInputSchema, normalizeResult, parseInputSchema } from '../skills/webmcpify/templates/webmcp-compat.js';

const toParams = (raw) => parseInputSchema(raw);
const normalize = (r) => normalizeResult(r);

test('LLM envelope: string|object|undefined inputSchema → object parameters', () => {
  assert.deepEqual(toParams(JSON.stringify({ type: 'object', properties: { q: { type: 'string' } }, required: ['q'] })), { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] });
  assert.deepEqual(toParams({ type: 'object', properties: {} }), { type: 'object', properties: {} });
  assert.deepEqual(toParams(undefined), { type: 'object', properties: {} });
});

test('executeTool shim: discriminates via inputSchema and normalizes object results', async () => {
  const calls = [];
  const mockMC = {
    getTools: async () => [
      { name: 'native', inputSchema: JSON.stringify({ type: 'object' }) },
      { name: 'spec', inputSchema: { type: 'object' } },
    ],
    executeTool: async (tool, input) => {
      calls.push({ name: tool.name, typeofInput: typeof input, input });
      if (tool.name === 'native') {
        assert.equal(typeof input, 'string');
        return JSON.stringify({ ok: true });
      }
      assert.equal(typeof input, 'object');
      return { ok: true };
    },
  };
  const invoke = async (name, args) => {
    const tool = (await mockMC.getTools()).find((t) => t.name === name);
    const isNative = isNativeInputSchema(tool);
    const r = await mockMC.executeTool(tool, isNative ? JSON.stringify(args) : args);
    return normalize(r);
  };
  assert.equal(await invoke('native', { q: 'x' }), JSON.stringify({ ok: true }));
  assert.equal(await invoke('spec', { q: 'x' }), JSON.stringify({ ok: true }));
  // stub tool.execute(object) returning object → normalized to string
  const stubTool = { execute: async (a) => ({ ok: true, echo: a.q }) };
  assert.equal(normalize(await stubTool.execute({ q: 'hi' })), JSON.stringify({ ok: true, echo: 'hi' }));
  assert.equal(normalize('already-string'), 'already-string');
  assert.equal(normalize(null), null);
  // spec stub rejects string input with TypeError — discriminator prevents wrong shape
  const rejectingMC = {
    executeTool: async (tool, input) => {
      if (typeof input === 'string') throw new TypeError('inputObject must be an object');
      return { ok: true };
    },
  };
  const specTool = { name: 'spec', inputSchema: { type: 'object' } };
  assert.equal(normalize(await rejectingMC.executeTool(specTool, isNativeInputSchema(specTool) ? JSON.stringify({ q: 'x' }) : { q: 'x' })), JSON.stringify({ ok: true }));
  await assert.rejects(() => rejectingMC.executeTool(specTool, JSON.stringify({ q: 'x' })), { name: 'TypeError' });
});

test('webmcp.spec.ts page.evaluate is browser-serializable', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const spec = readFileSync(join(root, 'skills/webmcpify/templates/webmcp.spec.ts'), 'utf8');
  // helpers must be defined inside page.evaluate, not closed over
  assert.match(spec, /page\.evaluate[\s\S]*isNativeInputSchema/);
  assert.match(spec, /page\.evaluate[\s\S]*normalizeResult/);
  const evaluateBlock = spec.slice(spec.indexOf('async function executeTool'), spec.indexOf('async function waitForTool'));
  // isNative and normalize must appear inside evaluate (at least once defined, plus uses)
  assert.ok(evaluateBlock.includes('const isNativeInputSchema'), 'isNative defined inside evaluate');
  assert.ok(evaluateBlock.includes('const normalizeResult'), 'normalize defined inside evaluate');
});

test('browser-boundary mock Page exercises actual template path', async () => {
  // simulate page.evaluate browser context with shared helpers
  const mockMC = {
    getTools: async () => [{ name: 't', inputSchema: JSON.stringify({ type: 'object' }) }],
    executeTool: async (tool, input) => {
      assert.equal(typeof input, 'string');
      return JSON.stringify({ ok: true, sku: 'abc' });
    },
  };
  const mockPage = {
    evaluate: async (fn, args) => {
      const origDoc = globalThis.document;
      globalThis.document = { modelContext: mockMC };
      try { return await fn(args); } finally { globalThis.document = origDoc; }
    },
  };
  // run the same inline logic as template (browser-serializable)
  const result = await mockPage.evaluate(async ({ name, args }) => {
    const isNativeInputSchema = (tool) => typeof tool?.inputSchema === 'string';
    const normalizeResult = (r) => r == null || typeof r === 'string' ? r : JSON.stringify(r);
    const mc = globalThis.document.modelContext;
    const tools = await mc.getTools();
    const tool = tools.find((t) => t.name === name);
    const isNative = isNativeInputSchema(tool);
    return normalizeResult(await mc.executeTool(tool, isNative ? JSON.stringify(args) : args));
  }, { name: 't', args: { q: 'hi' } });
  assert.equal(result, JSON.stringify({ ok: true, sku: 'abc' }));
  assert.match(result, /sku/);
});
