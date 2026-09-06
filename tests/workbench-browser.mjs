import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, firefox, webkit } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = await readFile(join(root, 'skills/webmcpify/templates/webmcp-workbench.js'), 'utf8');
const output = '/tmp/webmcpify-workbench-browser';
await mkdir(output, { recursive: true });

function contrastRatio(foreground, background) {
  const channels = (color) => color.match(/[\d.]+/g).slice(0, 3).map((value) => {
    const channel = Number(value) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const luminance = (color) => { const [r, g, b] = channels(color); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Workbench fixture</title>
<style>body{margin:0;padding:40px;background:#f0edf7;color:#26232d;font:16px system-ui}article{max-width:760px;margin:auto;padding:48px;background:white;border:1px solid #ded8e8;border-radius:18px}</style></head>
<body><article><h1>Ticket desk</h1><p id="host-result">Host application stays interactive.</p><button id="host-button">Host action</button>
<form toolname="filter_tickets" tooldescription="Filters the ticket list." toolautosubmit><label>Status <select name="status" toolparamdescription="Ticket status"><option>open</option><option>closed</option></select></label><button>Filter</button></form></article>
<script>
document.querySelector('form').addEventListener('submit', event => { event.preventDefault(); document.querySelector('#host-result').textContent='Filtered '+new FormData(event.currentTarget).get('status'); });
document.modelContext.registerTool({
  name:'search_tickets', description:'Searches tickets by query.',
  inputSchema:{type:'object',properties:{query:{type:'string',default:'billing'},limit:{type:'integer',default:5}},required:['query']},
  annotations:{readOnlyHint:true,untrustedContentHint:false},
  async execute(input){ document.querySelector('#host-result').textContent='Found tickets for '+input.query; return {ok:true,count:3,query:input.query}; }
});
document.modelContext.registerTool({
  name:'close_ticket', description:'Closes one ticket.',
  inputSchema:{type:'object',properties:{id:{type:'string',default:'T-42'}},required:['id']},
  annotations:{readOnlyHint:false,untrustedContentHint:false}, async execute(input){ return {ok:true,closed:input.id}; }
});
</script></body></html>`;

const server = createServer((request, response) => {
  if (request.url === '/strict-csp') {
    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'content-security-policy': "default-src 'none'; style-src 'none'; require-trusted-types-for 'script'",
    });
    response.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Strict CSP</title></head><body><p>Host</p></body></html>');
    return;
  }
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  response.end(html);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}`;
const engines = { chromium, firefox, webkit };
const requested = process.argv.slice(2).filter((name) => engines[name]);
const names = requested.length ? requested : ['chromium'];

try {
  for (const name of names) {
    const browser = await engines[name].launch({ headless: true });
    try {
      for (const fixture of [
        { id: 'desktop-light', viewport: { width: 1280, height: 800 }, colorScheme: 'light', reducedMotion: 'no-preference' },
        { id: 'phone-dark', viewport: { width: 360, height: 800 }, colorScheme: 'dark', reducedMotion: 'reduce' },
        { id: 'tablet-light', viewport: { width: 768, height: 1024 }, colorScheme: 'light', reducedMotion: 'reduce' },
      ]) {
        const context = await browser.newContext(fixture);
        const expectedTools = [
          { id: 'search_tickets', mutating: false, description: 'Searches tickets by query.', inputSchema: { type: 'object', properties: { query: { type: 'string', default: 'billing' }, limit: { type: 'integer', default: 5 } }, required: ['query'] }, annotations: { readOnlyHint: true, untrustedContentHint: false }, examples: { valid: { query: 'billing', limit: 5 }, invalid: { query: '' } } },
          { id: 'close_ticket', mutating: 'server', description: 'Closes one ticket.', inputSchema: { type: 'object', properties: { id: { type: 'string', default: 'T-42' } }, required: ['id'] }, annotations: { readOnlyHint: false, untrustedContentHint: false } },
          { id: 'filter_tickets', mutating: false, description: 'Filters the ticket list.', inputSchema: { type: 'object', properties: { status: { type: 'string', enum: ['open', 'closed'], description: 'Ticket status' } } }, annotations: { readOnlyHint: true } },
          { id: 'missing_expected_tool', mutating: false, inputSchema: { type: 'object', properties: {} } },
        ];
        await context.addInitScript({ content: `globalThis.__WEBMCPIFY_WORKBENCH__ = ${JSON.stringify({ expectedTools, open: true })};\n${source}` });
        const page = await context.newPage();
        await page.goto(url);
        const host = page.locator('#webmcpify-workbench');
        assert.equal(await host.getAttribute('data-evidence'), 'simulated');
        assert.equal(await host.getAttribute('data-secure-context'), 'true');
        const panel = host.locator('.panel');
        await panel.waitFor();
        assert.equal(await host.locator('.evidence').textContent(), 'Simulated');
        assert.equal(await host.locator('.tool-row').count(), 4);
        if (fixture.viewport.width <= 640) await host.locator('.tool-select').selectOption('search_tickets');
        else await host.locator('.tool-row', { hasText: 'search_tickets' }).click();
        assert.equal(await host.locator('input[name="query"]').inputValue(), 'billing');
        await host.locator('.invalid-example').click();
        assert.equal(await host.locator('input[name="query"]').inputValue(), '');
        await host.locator('.valid-example').click();
        assert.equal(await host.locator('input[name="query"]').inputValue(), 'billing');
        await host.locator('input[name="query"]').fill('refund');
        await host.locator('.run').click();
        await page.waitForFunction(() => document.querySelector('#host-result').textContent.includes('refund'));
        assert.match(await host.locator('.result').textContent(), /"count": 3/);
        assert.equal(await host.locator('.history-list li').count(), 1);
        assert.match(await host.locator('.history-list').textContent(), /search_ticketsSucceeded/);
        assert.match(await host.locator('.tool-meta').textContent(), /Observed \+ expected/);
        const panelOverflow = await panel.evaluate((element) => ({ width: element.clientWidth, scrollWidth: element.scrollWidth }));
        assert.ok(panelOverflow.scrollWidth <= panelOverflow.width, 'panel must not overflow horizontally');
        const runColors = await host.locator('.run').evaluate((element) => {
          const style = getComputedStyle(element);
          return { foreground: style.color, background: style.backgroundColor };
        });
        assert.ok(contrastRatio(runColors.foreground, runColors.background) >= 4.5, 'Run button must meet WCAG AA contrast');
        if (fixture.viewport.width <= 640) {
          assert.equal(await host.locator('.launcher').isVisible(), false, 'launcher must not cover the mobile action bar');
          assert.ok((await host.locator('.run').boundingBox()).height >= 44);
        }
        if (fixture.id === 'desktop-light') {
          await host.locator('.search').fill('no-such-tool');
          assert.equal(await host.locator('.empty').textContent(), 'No tools match this search.');
          await host.locator('.search').fill('');
          await host.locator('.tool-row', { hasText: 'close_ticket' }).click();
          await host.locator('.run').click();
          assert.equal(await host.locator('.confirm').getAttribute('open'), '');
          await host.locator('.confirm-run').click();
          await page.waitForFunction(() => document.querySelector('#webmcpify-workbench').shadowRoot.querySelector('.result').textContent.includes('closed'));
          await host.locator('.tool-row', { hasText: 'missing_expected_tool' }).click();
          assert.equal(await host.locator('.run').isDisabled(), true);
          await host.locator('.tool-row', { hasText: 'filter_tickets' }).click();
          await host.locator('select[name="status"]').selectOption('closed');
          await host.locator('.run').click();
          await page.waitForFunction(() => document.querySelector('#host-result').textContent === 'Filtered closed');
          assert.match(await host.locator('.result').textContent(), /"simulated": true/);
          await host.locator('.tool-row', { hasText: 'search_tickets' }).click();
          await host.locator('.run').click();
          await page.waitForTimeout(1100);
          assert.match(await host.locator('.result').textContent(), /"count": 3/, 'polling must not erase a result');
        }
        await page.screenshot({ path: join(output, `${name}-${fixture.id}.png`) });
        await page.keyboard.press('Escape');
        assert.equal(await panel.isHidden(), true);
        assert.equal(await host.evaluate((element) => element.shadowRoot.activeElement?.classList.contains('launcher')), true);
        if (fixture.id === 'desktop-light') {
          await page.evaluate(() => globalThis.WebMCPifyWorkbench.stop());
          assert.equal(await page.locator('#webmcpify-workbench').count(), 0);
          assert.equal(await page.evaluate(() => document.modelContext), undefined);
          assert.equal(await page.evaluate(() => globalThis.WebMCPifyWorkbench.start().evidence), 'simulated');
          assert.equal(await page.locator('#webmcpify-workbench').count(), 1);
        }
        await context.close();
      }
      console.log(`${name}: desktop, phone dark/reduced-motion, tablet passed`);

      if (name === 'chromium') {
        const context = await browser.newContext({ viewport: { width: 1100, height: 760 } });
        const nativePrelude = `
          const tools = new Map();
          Object.defineProperty(document, 'modelContext', { value: {
            async registerTool(tool) { tools.set(tool.name, tool); },
            async getTools() { return Array.from(tools.values(), tool => ({ ...tool, execute: undefined })); },
            async executeTool(tool, input) {
              if (typeof input !== 'string') throw new TypeError('native input must be a string');
              return JSON.stringify(await tools.get(tool.name).execute(JSON.parse(input)));
            }
          }});
          globalThis.__WEBMCPIFY_WORKBENCH__ = ${JSON.stringify({ expectedTools: [{ id: 'search_tickets', mutating: false }], open: true })};
        `;
        await context.addInitScript({ content: `${nativePrelude}\n${source}` });
        const page = await context.newPage();
        await page.goto(url);
        const host = page.locator('#webmcpify-workbench');
        assert.equal(await host.getAttribute('data-evidence'), 'native');
        assert.equal(await host.locator('.evidence').textContent(), 'Native');
        await host.locator('input[name="query"]').fill('native');
        await host.locator('.run').click();
        await page.waitForFunction(() => document.querySelector('#host-result').textContent.includes('native'));
        assert.match(await host.locator('.result').textContent(), /"count": 3/);
        await context.close();
        console.log('chromium: native transport path passed');

        const cspContext = await browser.newContext({ viewport: { width: 900, height: 700 } });
        await cspContext.addInitScript({ content: `globalThis.__WEBMCPIFY_WORKBENCH__ = { open: true };\n${source}` });
        const cspPage = await cspContext.newPage();
        await cspPage.goto(`${url}/strict-csp`);
        const cspHost = cspPage.locator('#webmcpify-workbench');
        await cspHost.locator('.panel').waitFor();
        assert.equal(await cspHost.locator('.launcher').evaluate((element) => getComputedStyle(element).position), 'fixed');
        assert.equal(await cspHost.getAttribute('data-evidence'), 'simulated');
        await cspContext.close();
        console.log('chromium: strict CSP and Trusted Types passed');
      }
    } finally { await browser.close(); }
  }
} finally {
  await new Promise((resolve) => server.close(resolve));
}
