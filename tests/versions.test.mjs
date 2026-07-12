/**
 * Distribution-manifest version equality — all six manifests must parse and
 * carry the same version as package.json.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));

const versions = [
  ['package.json', read('package.json').version],
  ['.claude-plugin/plugin.json', read('.claude-plugin/plugin.json').version],
  ['.claude-plugin/marketplace.json', read('.claude-plugin/marketplace.json').plugins?.[0]?.version],
  ['.cursor-plugin/plugin.json', read('.cursor-plugin/plugin.json').version],
  ['gemini-extension.json', read('gemini-extension.json').version],
  ['skill.json', read('skill.json').version],
];

test('every distribution manifest defines a version', () => {
  for (const [file, version] of versions) {
    assert.equal(typeof version, 'string', `${file} must define a version string`);
    assert.notEqual(version, '', `${file} version must not be empty`);
  }
});

test('all distribution manifests carry the same version as package.json', () => {
  const [, reference] = versions[0];
  for (const [file, version] of versions) {
    assert.equal(version, reference, `${file} version must equal package.json's ${reference}`);
  }
});
