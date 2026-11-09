// Dedicated read-only Workbench output-contract refresh regression.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
const source = await readFile(new URL('../skills/webmcpify/templates/webmcp-workbench.js', import.meta.url), 'utf8');
const server = createServer((_request, response) => response.writeHead(200, { 'content-type': 'text/html' }).end('<!doctype html><title>Read-only schema fixture</title>'));
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.addScriptTag({ content: source });
  await page.evaluate(async () => {
    const inputSchema = { type: 'object', properties: {} };
    const outputSchema = { type: 'object', properties: { value: { type: 'string' } } };
    window.schemaController = new AbortController();
    window.WebMCPifyWorkbench.start({ expectedTools: [{ id: 'read_schema', mutating: false, inputSchema, outputSchema }], open: true });
    await document.modelContext.registerTool({ name: 'read_schema', description: 'Reads a synthetic label.', inputSchema, outputSchema, execute: async () => ({ value: 'fixture' }) }, { signal: window.schemaController.signal });
  });
  const host = page.locator('#webmcpify-workbench');
  await page.waitForFunction(() => document.querySelector('#webmcpify-workbench').shadowRoot.querySelector('.tool-meta').textContent.includes('Observed + expected'));
  assert.match(await host.locator('.schema').textContent(), /outputSchema/);
  await page.evaluate(async () => {
    schemaController.abort();
    await document.modelContext.registerTool({ name: 'read_schema', description: 'Reads a synthetic label.', inputSchema: { type: 'object', properties: {} }, outputSchema: { type: 'object', properties: { value: { type: 'number' } } }, execute: async () => ({ value: 1 }) });
  });
  await page.waitForFunction(() => document.querySelector('#webmcpify-workbench').shadowRoot.querySelector('.tool-meta').textContent.includes('Contract differs'));
  assert.match(await host.locator('.schema').textContent(), /number/);
  assert.match(await host.locator('.expected').textContent(), /string/);
  console.log('Read-only simulated browser: output-only drift changes contract status and renders current/expected schemas.');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
