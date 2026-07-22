import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, rename, unlink } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const mode = process.argv.includes('--record') ? 'record' : 'verify';
const root = dirname(fileURLToPath(import.meta.url));
const repo = join(root, '..', '..');
const artifacts = join(repo, 'proof', 'artifacts');
const sourceVideo = join(artifacts, 'webmcpify-proof-source.webm');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, mode === 'record' ? ms : 20));

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://127.0.0.1');
    const requested = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/+/, '');
    const path = requested.startsWith('skills/')
      ? join(repo, requested)
      : join(root, requested);
    const allowed = path.startsWith(root) || path.startsWith(join(repo, 'skills'));
    if (!allowed || requested.includes('..')) throw new Error('not found');
    const body = await readFile(path);
    response.writeHead(200, { 'Content-Type': types[extname(path)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(body);
  } catch {
    response.writeHead(404).end('not found');
  }
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
const baseUrl = `http://127.0.0.1:${address.port}`;
let browser;

try {
  await mkdir(artifacts, { recursive: true });
  browser = await chromium.launch({
    headless: false,
    executablePath: '/usr/bin/google-chrome',
    args: ['--enable-features=WebMCP,WebMCPTesting', '--disable-background-networking'],
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    ...(mode === 'record' ? { recordVideo: { dir: artifacts, size: { width: 1280, height: 720 } } } : {}),
  });
  const page = await context.newPage();
  const video = page.video();
  await page.goto(baseUrl, { waitUntil: 'networkidle' });

  const chromeVersion = (await browser.version()).replace(/^Chrome\//, '');
  await page.evaluate((version) => window.proof.chrome(version), chromeVersion);
  const nativeSurface = await page.evaluate(() => ({
    context: typeof document.modelContext,
    enumerate: typeof document.modelContext?.getTools,
    execute: typeof document.modelContext?.executeTool,
  }));
  assert.deepEqual(nativeSurface, { context: 'object', enumerate: 'function', execute: 'function' });
  assert.equal((await page.evaluate(() => document.modelContext.getTools())).length, 0);

  await page.evaluate(() => {
    window.proof.phase('inventory', 'Inventory the existing app');
    window.proof.manifest();
    window.proof.line('$ webmcpify inventory proof/demo');
  });
  await delay(2500);
  for (const line of [
    'DETECT  static ES modules · loopback · no auth',
    'AREA    release-notes → existing applyFilter(category)',
    'CANDIDATE set_release_filter · client-only mutation',
    'SECURITY no server call · no personal data · no destructive action',
  ]) {
    await page.evaluate((text) => window.proof.line(text), line);
    await delay(2300);
  }

  await page.evaluate(() => {
    window.proof.phase('gate', 'Stop for manifest approval');
    window.proof.line('GATE    discovered → approval required');
    window.proof.gate();
  });
  await delay(6500);
  await page.click('#approve');
  await page.evaluate(() => window.proof.line('APPROVED set_release_filter · no-commit fixture policy'));
  await delay(3000);

  await page.evaluate(() => {
    window.proof.phase('integrate', 'Integrate one bounded tool');
    window.proof.line('SETUP   vendored zero-dependency runtime');
    window.dispatchEvent(new CustomEvent('webmcpify:integrate'));
  });
  await delay(2600);
  for (const line of [
    'WIRE    execute() → existing applyFilter(category)',
    'DIFF    one module script + one tool module',
    'BUILD   JavaScript syntax check passed',
  ]) {
    await page.evaluate((text) => window.proof.line(text), line);
    await delay(2400);
  }

  await page.waitForFunction(async () => (await document.modelContext.getTools()).some((tool) => tool.name === 'set_release_filter'));
  await page.evaluate(() => window.proof.phase('verify', 'Verify through native Chrome'));
  const tool = await page.evaluate(async () => (await document.modelContext.getTools()).find((item) => item.name === 'set_release_filter'));
  assert(tool);
  assert.equal(tool.annotations.readOnlyHint, false);
  assert.deepEqual(JSON.parse(tool.inputSchema), {
    type: 'object',
    properties: { category: { type: 'string', enum: ['all', 'feature', 'fix'] } },
    required: ['category'],
    additionalProperties: false,
  });
  await page.evaluate(() => { window.proof.check('tool enumerated'); window.proof.line('GETTOOLS set_release_filter found'); });
  await delay(2800);
  await page.evaluate(() => { window.proof.check('schema + annotations match'); window.proof.line('SCHEMA  parsed stringified JSON Schema · exact match'); });
  await delay(2800);

  const before = await page.locator('article:visible').count();
  const result = await page.evaluate(async () => {
    const registered = (await document.modelContext.getTools()).find((item) => item.name === 'set_release_filter');
    return document.modelContext.executeTool(registered, JSON.stringify({ category: 'fix' }));
  });
  const after = await page.locator('article:visible').count();
  assert.equal(before, 4);
  assert.equal(after, 2);
  assert.match(result, /2 release notes visible/);
  await page.evaluate(() => { window.proof.check('valid call changed visible UI: 4 → 2'); window.proof.line('EXECUTE category=fix → 2 release notes visible'); });
  await delay(3300);

  const invalidResult = await page.evaluate(async () => {
    const registered = (await document.modelContext.getTools()).find((item) => item.name === 'set_release_filter');
    return document.modelContext.executeTool(registered, JSON.stringify({ category: 'private' }));
  });
  assert.match(invalidResult, /^ERROR:/);
  assert.equal(await page.locator('article:visible').count(), 2);
  await page.evaluate(() => { window.proof.check('invalid enum returned bounded error; UI unchanged'); window.proof.line('INVALID category=private → ERROR (no UI side effect)'); });
  await delay(3000);
  await page.evaluate(async () => {
    const registered = (await document.modelContext.getTools()).find((item) => item.name === 'set_release_filter');
    return document.modelContext.executeTool(registered, JSON.stringify({ category: 'all' }));
  });
  assert.equal(await page.locator('article:visible').count(), 4);
  await page.evaluate(() => { window.proof.check('cleanup restored all notes'); window.proof.line('CLEANUP category=all → fixture restored'); });
  await delay(3000);

  await page.evaluate(() => {
    window.proof.phase('audit', 'Audit and package the evidence');
    window.proof.line('AUDIT   every diff hunk maps to the approved tool/setup');
  });
  await delay(2500);
  for (const text of [
    'Sanitized manifest: discovered → approved → verified',
    'No server mutations or production side effects',
    'Source recording + 480p derivative + SHA-256 sums',
  ]) {
    await page.evaluate((value) => window.proof.check(value), text);
    await delay(2400);
  }
  await page.evaluate(() => window.proof.line('DONE    native Chrome verification green · 0 heal attempts'));
  await delay(7000);

  await context.close();
  if (mode === 'record') {
    const generated = await video.path();
    await unlink(sourceVideo).catch((error) => { if (error.code !== 'ENOENT') throw error; });
    await rename(generated, sourceVideo);
    console.log(`recorded ${sourceVideo}`);
  }
  console.log(`proof verified in Chrome ${chromeVersion}: native getTools/executeTool, schema, annotations, UI delta, bounded invalid input, cleanup`);
} finally {
  await browser?.close().catch(() => {});
  await new Promise((resolve) => server.close(resolve));
}
