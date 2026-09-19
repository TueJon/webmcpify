import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('verification harness installs exact versions and never downloads at run time', () => {
  const verify = read('skills/webmcpify/references/verify.md');
  const installs = verify.split('\n').filter((line) => /\bnpm (i|install)\b/.test(line));
  assert.ok(installs.length > 0, 'verify.md documents the harness install');
  for (const line of installs) {
    const packages = line.split(/\s+/).filter((word) => /^@?[a-z0-9./-]+(@[^\s]+)?$/i.test(word)
      && /^(@playwright|typescript|@types)/.test(word));
    assert.ok(packages.length > 0, `no harness packages found in: ${line}`);
    for (const pkg of packages) assert.match(pkg, /@\d+\.\d+\.\d+$/, `${pkg} is not pinned exactly`);
  }
  assert.doesNotMatch(verify, /\bnpx (-y )?playwright\b/, 'run the installed binary, not npx');

  const workbench = read('skills/webmcpify/scripts/workbench.mjs');
  const pinned = workbench.match(/const playwrightVersion = '([^']+)'/)[1];
  assert.match(verify, new RegExp(`@playwright/test@${pinned.replace(/\./g, '\\.')}\\b`),
    'harness @playwright/test must match the Workbench Playwright version');
});
