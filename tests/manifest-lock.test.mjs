import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import {
  access,
  mkdtemp,
  open,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const flockAvailable = process.platform === 'linux'
  && spawnSync('flock', ['--version'], { stdio: 'ignore' }).status === 0;

const worker = String.raw`
  const { open, readFile, rename, writeFile } = await import('node:fs/promises');
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const { MODE, MANIFEST, LOCK, HELD, RELEASE, SETTLED, ACQUIRED } = process.env;

  async function durableManifest(value) {
    const temporary = MANIFEST + '.' + process.pid + '.tmp';
    await writeFile(temporary, JSON.stringify(value));
    const temporaryHandle = await open(temporary, 'r');
    await temporaryHandle.sync();
    await temporaryHandle.close();
    await rename(temporary, MANIFEST);
    const directoryHandle = await open((await import('node:path')).dirname(MANIFEST), 'r');
    await directoryHandle.sync();
    await directoryHandle.close();
  }

  await writeFile(LOCK, JSON.stringify({ owner: MODE, pid: process.pid }));
  const lockHandle = await open(LOCK, 'r');
  await lockHandle.sync();
  await lockHandle.close();

  if (MODE === 'a') {
    const manifest = JSON.parse(await readFile(MANIFEST, 'utf8'));
    manifest.state = 'started';
    await durableManifest(manifest);
    await writeFile(HELD, 'locked-after-atomic-replace');
    while (true) {
      try {
        await readFile(RELEASE);
        break;
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        await sleep(20);
      }
    }
    manifest.state = 'reconciled';
    await durableManifest(manifest);
    await writeFile(SETTLED, 'settled-before-unlock');
    await writeFile(LOCK, JSON.stringify({ owner: MODE, released: true }));
  } else {
    const manifest = JSON.parse(await readFile(MANIFEST, 'utf8'));
    await writeFile(ACQUIRED, JSON.stringify({ state: manifest.state }));
  }
`;

function runLocked(mode, paths) {
  return spawn('flock', [
    '--exclusive',
    paths.lock,
    process.execPath,
    '--input-type=module',
    '--eval',
    worker,
  ], {
    env: {
      ...process.env,
      MODE: mode,
      MANIFEST: paths.manifest,
      LOCK: paths.lock,
      HELD: paths.held,
      RELEASE: paths.release,
      SETTLED: paths.settled,
      ACQUIRED: paths.acquired,
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
}

async function waitForFile(path, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await access(path);
      return;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
  throw new Error(`timed out waiting for ${path}`);
}

async function waitForExit(child) {
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const code = await new Promise((resolve) => child.once('exit', resolve));
  assert.equal(code, 0, stderr);
}

test('runner B stays blocked while runner A atomically replaces manifest until A settles and releases ownership', {
  skip: !flockAvailable && 'requires Linux util-linux flock',
  timeout: 10_000,
}, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'webmcpify-manifest-lock-'));
  const paths = Object.fromEntries(
    ['manifest', 'lock', 'held', 'release', 'settled', 'acquired']
      .map((name) => [name, join(directory, name === 'manifest' ? 'manifest.json' : `manifest.${name}`)]),
  );

  try {
    await writeFile(paths.manifest, JSON.stringify({ state: 'ready' }));
    await writeFile(paths.lock, JSON.stringify({ owner: 'dead-runner', pid: -1 }));
    const stableLockInode = (await stat(paths.lock)).ino;

    const runnerA = runLocked('a', paths);
    await waitForFile(paths.held);
    assert.equal(JSON.parse(await readFile(paths.manifest, 'utf8')).state, 'started');
    assert.equal(JSON.parse(await readFile(paths.lock, 'utf8')).owner, 'a');

    const runnerB = runLocked('b', paths);
    await new Promise((resolve) => setTimeout(resolve, 300));
    await assert.rejects(access(paths.acquired), { code: 'ENOENT' });
    assert.equal(runnerB.exitCode, null, 'runner B must still be waiting on the sidecar lock');

    await writeFile(paths.release, 'release');
    await Promise.all([waitForExit(runnerA), waitForExit(runnerB)]);

    assert.equal(JSON.parse(await readFile(paths.acquired, 'utf8')).state, 'reconciled');
    assert.equal(JSON.parse(await readFile(paths.manifest, 'utf8')).state, 'reconciled');
    assert.equal((await stat(paths.lock)).ino, stableLockInode, 'sidecar inode must never change');
    await access(paths.settled);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
