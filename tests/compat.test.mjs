import { test } from 'node:test';
import assert from 'node:assert/strict';

const toParams = (raw) => typeof raw === 'string' ? JSON.parse(raw) : raw ?? { type: 'object', properties: {} };
const normalize = (r) => r == null || typeof r === 'string' ? r : JSON.stringify(r);

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
    const isNative = typeof tool.inputSchema === 'string';
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
});
