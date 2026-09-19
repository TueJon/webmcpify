import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, chmod, link, mkdir, mkdtemp, readFile, rename, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import { transformSync } from 'esbuild';
import {
  fingerprintArguments,
  openMutationJournal,
} from '../skills/webmcpify/templates/mutation-journal.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const helperUrl = pathToFileURL(join(root, 'skills/webmcpify/templates/mutation-journal.js')).href;
const hasCommand = (command) => spawnSync(
  '/bin/sh',
  ['-c', 'command -v "$1" >/dev/null 2>&1', 'sh', command],
  { stdio: 'ignore' },
).status === 0;
const commandPath = (command) => spawnSync(
  '/bin/sh',
  ['-c', 'command -v "$1"', 'sh', command],
  { encoding: 'utf8' },
).stdout.trim();
const advisoryLockAvailable = process.platform !== 'win32'
  && (hasCommand('flock') || hasCommand('lockf'));
const requiresAdvisoryLock = !advisoryLockAvailable
  && 'requires flock(1) or macOS/FreeBSD lockf(1); mutation verification fails closed without either';

function manifest(tools = [{
  id: 'send_contact_message',
  status: 'integrated',
  contractRevision: 1,
  mutationExecutions: [],
  verifiedAgainst: null,
}]) {
  return { version: 4, tools };
}

async function fixture(value = manifest()) {
  const directory = await mkdtemp(join(tmpdir(), 'webmcpify-mutation-journal-'));
  const manifestPath = join(directory, 'manifest.json');
  await writeFile(manifestPath, `${JSON.stringify(value, null, 2)}\n`);
  return { directory, manifestPath, lockPath: join(directory, 'manifest.lock') };
}

function mutation(overrides = {}) {
  return {
    tool: 'send_contact_message',
    contractRevision: 1,
    origin: 'https://app.example.test',
    role: 'member',
    fixtureRevision: 'seed-v2',
    arguments: { message: 'hello', email: 'qa@example.test' },
    evidence: '.webmcpify/evidence/contact-message.json',
    ...overrides,
  };
}

function journalEntry(overrides = {}) {
  return {
    executionId: 'execution-parent',
    tool: 'send_contact_message',
    contractRevision: 1,
    origin: 'https://app.example.test',
    role: 'member',
    fixtureRevision: 'seed-v2',
    argumentsFingerprint: fingerprintArguments({ email: 'qa@example.test' }),
    startedAt: '2026-09-19T12:00:00.000Z',
    state: 'started',
    evidence: '.webmcpify/evidence/contact-message.json',
    ...overrides,
  };
}

async function delay(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForFile(path, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await access(path);
      return;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await delay(20);
    }
  }
  throw new Error(`timed out waiting for ${path}`);
}

async function waitForExit(child) {
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  if (child.exitCode !== null || child.signalCode !== null) {
    return { code: child.exitCode, signal: child.signalCode, stderr };
  }
  const result = await new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal })));
  return { ...result, stderr };
}

async function waitForOwnerMetadata(lockPath, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const metadata = JSON.parse(await readFile(lockPath, 'utf8'));
      if (Number.isInteger(metadata.pid) && typeof metadata.lockBackend === 'string') return metadata;
    } catch (error) {
      if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
    }
    await delay(1);
  }
  throw new Error(`timed out waiting for owner metadata in ${lockPath}`);
}

test('argument fingerprints use recursively sorted canonical JSON', () => {
  assert.equal(
    fingerprintArguments({ z: 1, a: { y: 2, x: [3, { b: 2, a: 1 }] } }),
    fingerprintArguments({ a: { x: [3, { a: 1, b: 2 }], y: 2 }, z: 1 }),
  );
  assert.equal(
    fingerprintArguments({ 'ä': 1, z: 2, A: 3 }),
    fingerprintArguments({ A: 3, z: 2, 'ä': 1 }),
    'fingerprints must not depend on the host locale',
  );
  assert.equal(
    fingerprintArguments({ 2: 'two', 10: 'ten' }),
    `sha256:${createHash('sha256').update('{"10":"ten","2":"two"}').digest('hex')}`,
    'integer-like keys must remain lexicographically sorted in the serialized bytes',
  );
});

test('the TypeScript and JavaScript helper twins stay byte-equivalent', async () => {
  const templates = join(root, 'skills/webmcpify/templates');
  const generated = transformSync(await readFile(join(templates, 'mutation-journal.ts'), 'utf8'), {
    loader: 'ts',
    target: 'es2022',
    format: 'esm',
    legalComments: 'inline',
  }).code;
  assert.equal(await readFile(join(templates, 'mutation-journal.js'), 'utf8'), generated);
});

test('runner B cannot scan while runner A journals, cleans up, settles, and releases', {
  skip: requiresAdvisoryLock,
  timeout: 10_000,
}, async () => {
  const paths = await fixture();
  let runnerA;
  let runnerB;
  try {
    runnerA = await openMutationJournal({ manifestPath: paths.manifestPath });
    const stableLockInode = (await stat(paths.lockPath)).ino;
    const parent = await runnerA.beforeDispatch(mutation());
    const preDispatchStored = JSON.parse(await readFile(paths.manifestPath, 'utf8'));
    assert.deepEqual(preDispatchStored.tools[0].mutationExecutions[0], parent);

    let runnerBAcquired = false;
    const runnerBPromise = openMutationJournal({ manifestPath: paths.manifestPath })
      .then((journal) => {
        runnerBAcquired = true;
        return journal;
      });
    await delay(300);
    assert.equal(runnerBAcquired, false, 'runner B must remain blocked before its initial manifest scan');

    const cleanup = await runnerA.beforeDispatch(mutation({
      tool: 'delete_contact_message_fixture',
      manifestTool: 'send_contact_message',
      arguments: { fixture: 'qa@example.test' },
      evidence: '.webmcpify/evidence/contact-cleanup.json',
      parentExecutionId: parent.executionId,
    }));
    await assert.rejects(
      runnerA.settle(parent.executionId, {
        outcome: 'must not settle before cleanup',
        evidence: '.webmcpify/evidence/contact-message-premature.json',
      }),
      /has unresolved cleanup/,
    );
    await runnerA.settle(cleanup.executionId, {
      outcome: 'fixture removed',
      evidence: '.webmcpify/evidence/contact-cleanup-settled.json',
    });
    await runnerA.settle(parent.executionId, {
      outcome: 'message created, verified, and cleaned up',
      evidence: '.webmcpify/evidence/contact-message-settled.json',
    });
    await runnerA.close();
    runnerA = undefined;

    runnerB = await runnerBPromise;
    assert.equal(runnerBAcquired, true);
    assert.deepEqual(runnerB.unresolved, []);
    const stored = JSON.parse(await readFile(paths.manifestPath, 'utf8'));
    assert.deepEqual(stored.tools[0].mutationExecutions.map((entry) => entry.state), [
      'reconciled',
      'reconciled',
    ]);
    assert.equal((await stat(paths.lockPath)).ino, stableLockInode, 'sidecar inode must never change');
  } finally {
    await runnerA?.close();
    await runnerB?.close();
    await rm(paths.directory, { recursive: true, force: true });
  }
});

test('a bounded waiter times out without acquiring or leaking the lock later', {
  skip: requiresAdvisoryLock,
  timeout: 10_000,
}, async () => {
  const paths = await fixture();
  let holder;
  let successor;
  try {
    holder = await openMutationJournal({ manifestPath: paths.manifestPath });
    await assert.rejects(
      openMutationJournal({ manifestPath: paths.manifestPath, timeoutMs: 100 }),
      /timed out after 100ms/,
    );
    await holder.close();
    holder = undefined;

    successor = await openMutationJournal({ manifestPath: paths.manifestPath, timeoutMs: 1_000 });
    assert.deepEqual(successor.unresolved, []);
  } finally {
    await holder?.close();
    await successor?.close();
    await rm(paths.directory, { recursive: true, force: true });
  }
});

test('lockf descriptor fallback keeps the sidecar inode and excludes a second runner', {
  skip: process.platform === 'win32' || (!hasCommand('lockf') && !hasCommand('flock'))
    ? 'requires native lockf(1), or flock(1) for the Linux lockf compatibility shim'
    : false,
  timeout: 10_000,
}, async () => {
  const paths = await fixture();
  const bin = join(paths.directory, 'bin');
  await mkdir(bin);
  const nativeLockf = commandPath('lockf');
  if (nativeLockf) {
    await symlink(nativeLockf, join(bin, 'lockf'));
  } else {
    const nativeFlock = commandPath('flock');
    const shim = `#!${process.execPath}\n`
      + `import { spawnSync } from 'node:child_process';\n`
      + `const args = process.argv.slice(2);\n`
      + `const nonblock = args.includes('-t');\n`
      + `if (args.at(-1) !== '3') process.exit(64);\n`
      + `const result = spawnSync(${JSON.stringify(nativeFlock)}, ['--exclusive', ...(nonblock ? ['--nonblock'] : []), '3'], { stdio: ['inherit', 'inherit', 'inherit', 3] });\n`
      + `if (result.error) throw result.error;\n`
      + `process.exit(nonblock && result.status === 1 ? 75 : result.status ?? 1);\n`;
    await writeFile(join(bin, 'lockf'), shim, { mode: 0o700 });
  }

  const originalPath = process.env.PATH;
  let runnerA;
  let runnerB;
  try {
    process.env.PATH = bin;
    runnerA = await openMutationJournal({ manifestPath: paths.manifestPath });
    const stableLockInode = (await stat(paths.lockPath)).ino;
    const runnerBPromise = openMutationJournal({ manifestPath: paths.manifestPath });
    await delay(150);
    await runnerA.close();
    runnerA = undefined;
    runnerB = await runnerBPromise;
    assert.equal((await stat(paths.lockPath)).ino, stableLockInode);
  } finally {
    process.env.PATH = originalPath;
    await runnerA?.close();
    await runnerB?.close();
    await rm(paths.directory, { recursive: true, force: true });
  }
});

test('mutation verification fails closed when no advisory-lock command exists', async () => {
  const paths = await fixture();
  const emptyBin = join(paths.directory, 'empty-bin');
  await mkdir(emptyBin);
  const originalPath = process.env.PATH;
  try {
    process.env.PATH = emptyBin;
    await assert.rejects(
      openMutationJournal({ manifestPath: paths.manifestPath }),
      /no supported advisory-lock command \(flock, lockf\)/,
    );
  } finally {
    process.env.PATH = originalPath;
    await rm(paths.directory, { recursive: true, force: true });
  }
});

test('pre-dispatch persistence failure prevents dispatch and leaves no started entry', {
  skip: requiresAdvisoryLock,
}, async () => {
  const paths = await fixture();
  const journal = await openMutationJournal({ manifestPath: paths.manifestPath });
  let dispatched = false;
  try {
    await chmod(paths.directory, 0o500);
    await assert.rejects(async () => {
      await journal.beforeDispatch(mutation());
      dispatched = true;
    });
    assert.equal(dispatched, false);
    await chmod(paths.directory, 0o700);
    const stored = JSON.parse(await readFile(paths.manifestPath, 'utf8'));
    assert.deepEqual(stored.tools[0].mutationExecutions, []);
  } finally {
    await chmod(paths.directory, 0o700);
    await journal.close();
    await rm(paths.directory, { recursive: true, force: true });
  }
});

test('process crash releases the OS lock but leaves the durable started entry', {
  skip: requiresAdvisoryLock,
  timeout: 10_000,
}, async () => {
  const paths = await fixture();
  const marker = join(paths.directory, 'started');
  const childSource = `
    import { writeFile } from 'node:fs/promises';
    import { openMutationJournal } from ${JSON.stringify(helperUrl)};
    const journal = await openMutationJournal({ manifestPath: process.env.MANIFEST });
    await journal.beforeDispatch(${JSON.stringify(mutation())});
    await writeFile(process.env.MARKER, 'started');
    process.kill(process.pid, 'SIGKILL');
  `;
  const child = spawn(process.execPath, ['--input-type=module', '--eval', childSource], {
    env: { ...process.env, MANIFEST: paths.manifestPath, MARKER: marker },
    stdio: ['ignore', 'ignore', 'pipe'],
  });

  let recovery;
  try {
    await waitForFile(marker);
    const result = await waitForExit(child);
    assert.equal(result.signal, 'SIGKILL', result.stderr);
    recovery = await openMutationJournal({ manifestPath: paths.manifestPath, timeoutMs: 3_000 });
    assert.equal(recovery.unresolved.length, 1);
    assert.equal(recovery.unresolved[0].state, 'started');
    assert.equal(recovery.unresolved[0].tool, 'send_contact_message');
  } finally {
    await recovery?.close();
    await rm(paths.directory, { recursive: true, force: true });
  }
});

test('opening a legacy manifest initializes journals and invalidates historical verification', {
  skip: requiresAdvisoryLock,
}, async () => {
  const paths = await fixture(manifest([{
    id: 'send_contact_message',
    status: 'verified',
    contractRevision: 1,
    verifiedAgainst: { at: '2026-09-14T12:00:00Z' },
  }, {
    id: 'search_tickets',
    status: 'integrated',
    contractRevision: 1,
  }]));
  const journal = await openMutationJournal({ manifestPath: paths.manifestPath });
  try {
    const stored = JSON.parse(await readFile(paths.manifestPath, 'utf8'));
    assert.equal(typeof stored.mutationLockIdentity, 'string');
    assert.equal(stored.tools[0].status, 'integrated');
    assert.equal(stored.tools[0].verifiedAgainst, null);
    assert.deepEqual(stored.tools[0].mutationExecutions, []);
    assert.equal(stored.tools[1].status, 'integrated');
    assert.equal(stored.tools[1].verifiedAgainst, null);
    assert.deepEqual(stored.tools[1].mutationExecutions, []);
  } finally {
    await journal.close();
    await rm(paths.directory, { recursive: true, force: true });
  }
});

test('present malformed journals fail closed without rewriting the manifest', {
  skip: requiresAdvisoryLock,
}, async (t) => {
  const cases = [
    ['non-array', { executionId: 'uncertain', state: 'started' }],
    ['malformed entry', [{ executionId: 'uncertain', state: 'started' }]],
    ['unknown state', [journalEntry({ state: 'unknown' })]],
    ['duplicate execution IDs', [journalEntry(), journalEntry()]],
    ['missing parent', [journalEntry({ executionId: 'cleanup', parentExecutionId: 'missing' })]],
    ['cleanup parent owned by another tool', [journalEntry({ executionId: 'cleanup', parentExecutionId: 'other-parent' })]],
  ];
  for (const [name, mutationExecutions] of cases) {
    await t.test(name, async () => {
      const tools = [{
        id: 'send_contact_message',
        status: 'integrated',
        contractRevision: 1,
        mutationExecutions,
        verifiedAgainst: null,
      }];
      if (name === 'cleanup parent owned by another tool') {
        tools.push({
          id: 'other_tool',
          status: 'integrated',
          contractRevision: 1,
          mutationExecutions: [journalEntry({ executionId: 'other-parent', tool: 'other_tool' })],
          verifiedAgainst: null,
        });
      }
      const paths = await fixture(manifest(tools));
      const before = await readFile(paths.manifestPath, 'utf8');
      try {
        await assert.rejects(openMutationJournal({ manifestPath: paths.manifestPath }));
        assert.equal(await readFile(paths.manifestPath, 'utf8'), before);
      } finally {
        await rm(paths.directory, { recursive: true, force: true });
      }
    });
  }
});

test('the runner descriptor retains ownership through startup, dispatch, settlement and release', {
  skip: requiresAdvisoryLock,
  timeout: 10_000,
}, async () => {
  const paths = await fixture();
  const journal = await openMutationJournal({ manifestPath: paths.manifestPath });
  let successor;
  try {
    const metadata = JSON.parse(await readFile(paths.lockPath, 'utf8'));
    assert.equal(metadata.pid, process.pid);
    assert.equal(typeof metadata.lockBackend, 'string');
    assert.equal(Object.hasOwn(metadata, 'lockHolderPid'), false, 'no killable holder owns the lock');

    await assert.rejects(
      openMutationJournal({ manifestPath: paths.manifestPath, timeoutMs: 50 }),
      /timed out after 50ms/,
      'startup must remain excluded after the acquisition subprocess exits',
    );
    const execution = await journal.beforeDispatch(mutation());
    await assert.rejects(
      openMutationJournal({ manifestPath: paths.manifestPath, timeoutMs: 50 }),
      /timed out after 50ms/,
      'dispatch must remain excluded',
    );
    await journal.settle(execution.executionId, { outcome: 'verified', evidence: 'verified.json' });
    await assert.rejects(
      openMutationJournal({ manifestPath: paths.manifestPath, timeoutMs: 50 }),
      /timed out after 50ms/,
      'settlement must remain excluded',
    );
    await journal.close();
    successor = await openMutationJournal({ manifestPath: paths.manifestPath, timeoutMs: 1_000 });
    assert.deepEqual(successor.unresolved, []);
  } finally {
    await journal.close().catch(() => undefined);
    await successor?.close();
    await rm(paths.directory, { recursive: true, force: true });
  }
});

test('runner death during startup releases ownership without a partial manifest rewrite', {
  skip: requiresAdvisoryLock,
  timeout: 15_000,
}, async () => {
  const tools = Array.from({ length: 150_000 }, (_, index) => ({
    id: `tool_${index}`,
    status: 'verified',
    contractRevision: 1,
    verifiedAgainst: { at: '2026-09-14T12:00:00Z' },
  }));
  const paths = await fixture(manifest(tools));
  const before = await readFile(paths.manifestPath, 'utf8');
  const childSource = `
    import { openMutationJournal } from ${JSON.stringify(helperUrl)};
    try {
      const journal = await openMutationJournal({ manifestPath: process.env.MANIFEST });
      await journal.close();
      process.exit(2);
    } catch (error) {
      console.error(error.message);
      process.exit(3);
    }
  `;
  const child = spawn(process.execPath, ['--input-type=module', '--eval', childSource], {
    env: { ...process.env, MANIFEST: paths.manifestPath },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let recovery;
  try {
    const metadata = await waitForOwnerMetadata(paths.lockPath);
    process.kill(metadata.pid, 'SIGKILL');
    const result = await waitForExit(child);
    assert.equal(result.signal, 'SIGKILL', result.stderr);
    const current = await readFile(paths.manifestPath, 'utf8');
    assert.ok(current === before || JSON.parse(current).tools.every((tool) => Array.isArray(tool.mutationExecutions)));
    recovery = await openMutationJournal({ manifestPath: paths.manifestPath, timeoutMs: 3_000 });
    assert.deepEqual(recovery.unresolved, []);
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await recovery?.close();
    await rm(paths.directory, { recursive: true, force: true });
  }
});

test('symlink and multiply-linked sidecars are rejected without touching their targets', {
  skip: process.platform === 'win32',
}, async (t) => {
  await t.test('symlink', async () => {
    const paths = await fixture();
    const victim = join(paths.directory, 'victim');
    await writeFile(victim, 'do not touch');
    await symlink(victim, paths.lockPath);
    try {
      await assert.rejects(openMutationJournal({ manifestPath: paths.manifestPath }), /ELOOP|symbolic link/);
      assert.equal(await readFile(victim, 'utf8'), 'do not touch');
    } finally {
      await rm(paths.directory, { recursive: true, force: true });
    }
  });
  await t.test('hard link', async () => {
    const paths = await fixture();
    const victim = join(paths.directory, 'victim');
    await writeFile(victim, 'do not touch');
    await link(victim, paths.lockPath);
    try {
      await assert.rejects(openMutationJournal({ manifestPath: paths.manifestPath }), /exactly one link/);
      assert.equal(await readFile(victim, 'utf8'), 'do not touch');
    } finally {
      await rm(paths.directory, { recursive: true, force: true });
    }
  });
});

test('a sidecar swap during acquisition cannot establish a second lock identity', {
  skip: process.platform === 'win32' || !hasCommand('flock') ? 'requires flock(1)' : false,
  timeout: 10_000,
}, async () => {
  const paths = await fixture();
  const before = await readFile(paths.manifestPath, 'utf8');
  const nativeFlock = commandPath('flock');
  const bin = join(paths.directory, 'bin');
  await mkdir(bin);
  const shim = '#!/bin/sh\n'
    + '/bin/mv "$WEBMCPIFY_TEST_LOCK_PATH" "$WEBMCPIFY_TEST_LOCK_PATH.displaced"\n'
    + ': > "$WEBMCPIFY_TEST_LOCK_PATH"\n'
    + 'exec "$WEBMCPIFY_NATIVE_FLOCK" "$@"\n';
  await writeFile(join(bin, 'flock'), shim, { mode: 0o700 });
  const originalPath = process.env.PATH;
  const originalLockPath = process.env.WEBMCPIFY_TEST_LOCK_PATH;
  const originalFlock = process.env.WEBMCPIFY_NATIVE_FLOCK;
  try {
    process.env.PATH = bin;
    process.env.WEBMCPIFY_TEST_LOCK_PATH = paths.lockPath;
    process.env.WEBMCPIFY_NATIVE_FLOCK = nativeFlock;
    await assert.rejects(openMutationJournal({ manifestPath: paths.manifestPath }), /identity changed/);
    assert.equal(await readFile(paths.manifestPath, 'utf8'), before);
  } finally {
    process.env.PATH = originalPath;
    if (originalLockPath === undefined) delete process.env.WEBMCPIFY_TEST_LOCK_PATH;
    else process.env.WEBMCPIFY_TEST_LOCK_PATH = originalLockPath;
    if (originalFlock === undefined) delete process.env.WEBMCPIFY_NATIVE_FLOCK;
    else process.env.WEBMCPIFY_NATIVE_FLOCK = originalFlock;
    await rm(paths.directory, { recursive: true, force: true });
  }
});

test('a live sidecar replacement cannot admit a second operational journal', {
  skip: requiresAdvisoryLock,
  timeout: 10_000,
}, async () => {
  const paths = await fixture();
  const runnerA = await openMutationJournal({ manifestPath: paths.manifestPath });
  try {
    await rename(paths.lockPath, `${paths.lockPath}.displaced`);
    await writeFile(paths.lockPath, '');
    await assert.rejects(
      openMutationJournal({ manifestPath: paths.manifestPath, timeoutMs: 1_000 }),
      /lost its stable identity/,
    );
    await assert.rejects(runnerA.beforeDispatch(mutation()), /lock identity changed/);
    const stored = JSON.parse(await readFile(paths.manifestPath, 'utf8'));
    assert.deepEqual(stored.tools[0].mutationExecutions, []);
  } finally {
    await runnerA.close().catch(() => undefined);
    await rm(paths.directory, { recursive: true, force: true });
  }
});

test('the portable helper retains both supported advisory-lock backends', async () => {
  const source = await readFile(join(root, 'skills/webmcpify/templates/mutation-journal.js'), 'utf8');
  assert.match(source, /command: "flock"/);
  assert.match(source, /command: "lockf"/);
  assert.match(source, /\["-s", "3"\]/);
});

test('the Playwright template journals every mutating example and cleanup action', async () => {
  const source = await readFile(join(root, 'skills/webmcpify/templates/webmcp.spec.ts'), 'utf8');
  assert.equal(source.match(/mutationJournal!\.beforeDispatch\(/g)?.length, 3);
  assert.equal(source.match(/mutationJournal!\.settle\(/g)?.length, 3);
  assert.match(source, /parentExecutionId: execution\.executionId/);
  assert.match(source, /independent read path proves the mutation before cleanup/);
  assert.match(source, /independent read path proves absence of an effect/);
});
