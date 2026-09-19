import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { outputs } from '../assets/readme/build.mjs';

test('README artwork matches its generator (run node assets/readme/build.mjs)', () => {
  for (const [name, render] of Object.entries(outputs)) {
    const committed = readFileSync(new URL(`../assets/readme/${name}`, import.meta.url), 'utf8');
    assert.equal(committed, render(), `${name} is stale`);
  }
});

test('README references only existing artwork and both theme variants', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  assert.match(readme, /<h1[^>]*>[^<]*WebMCP agent skill[^<]*<\/h1>/,
    'README must retain a semantic h1 containing the discoverability phrase');
  for (const base of ['banner', 'pipeline']) {
    assert.match(readme, new RegExp(`assets/readme/${base}-dark\\.svg`));
    assert.match(readme, new RegExp(`assets/readme/${base}-light\\.svg`));
  }
  readFileSync(new URL('../assets/readme/demo-poster.webp', import.meta.url));
});
