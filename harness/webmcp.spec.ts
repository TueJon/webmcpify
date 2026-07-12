/**
 * webmcpify verification harness — Playwright template.
 * Instantiate per project: fill BASE_URL and generate one describe-block per
 * manifest tool (the webmcpify skill does this from .webmcpify/manifest.json).
 *
 * Requirements: real Chrome, HEADED (WebMCP needs a visible tab — headless will
 * never work; use xvfb-run in CI), Chrome ≥150.
 *
 * `navigator.modelContextTesting` is Chrome test scaffolding behind the flag —
 * it may never be used in shipped application code.
 */
import { chromium, expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';

const BASE_URL = process.env.WEBMCP_BASE_URL ?? 'http://localhost:5173';

let context: BrowserContext;
let page: Page;

test.beforeAll(async () => {
  context = await chromium.launchPersistentContext('', {
    channel: 'chrome',
    headless: false,
    args: ['--enable-features=WebMCP,DevToolsWebMCPSupport'],
  });
  page = await context.newPage();
  await page.goto(BASE_URL);
});

test.afterAll(async () => {
  await context.close();
});

async function listTools(p: Page): Promise<Array<{ name: string; inputSchema?: object }>> {
  return p.evaluate(async () => {
    // @ts-expect-error test-only Chrome scaffolding
    return navigator.modelContextTesting.listTools();
  });
}

async function executeTool(p: Page, name: string, args: object): Promise<string> {
  return p.evaluate(
    async ({ name, args }) => {
      // @ts-expect-error test-only Chrome scaffolding
      return navigator.modelContextTesting.executeTool(name, JSON.stringify(args));
    },
    { name, args },
  );
}

test('WebMCP is available in the test environment', async () => {
  const available = await page.evaluate(
    () => !!(document as any).modelContext || !!(navigator as any).modelContext,
  );
  expect(available, 'Enable chrome://flags/#enable-webmcp-testing and use Chrome ≥150').toBe(true);
});

// ── Generated per manifest tool ──────────────────────────────────────────────
// Example for a read-only tool `search_tickets`:

test.describe('search_tickets', () => {
  test('is registered with the expected schema', async () => {
    const tools = await listTools(page);
    const tool = tools.find((t) => t.name === 'search_tickets');
    expect(tool).toBeDefined();
    // Assert schema properties match the manifest entry:
    // expect(tool!.inputSchema).toMatchObject({ required: ['query'] });
  });

  test('executes and updates the UI', async () => {
    const out = await executeTool(page, 'search_tickets', { query: 'test' });
    expect(out).not.toMatch(/^ERROR:/);
    // Assert on the UI, not just the return value (UI-settled rule):
    // await expect(page.getByRole('list', { name: 'Results' })).toBeVisible();
  });

  test('rejects invalid input with a self-correction message', async () => {
    const out = await executeTool(page, 'search_tickets', {});
    expect(out).toMatch(/^ERROR:/);
  });
});
