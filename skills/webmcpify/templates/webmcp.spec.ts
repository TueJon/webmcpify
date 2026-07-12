/**
 * webmcpify verification template — vendored from https://github.com/TueJon/webmcpify
 * MIT License · Copyright (c) 2026 Jonas Tüchler · keep this header when copying.
 *
 * The webmcpify skill instantiates one describe-block per manifest tool, filling
 * route/auth/examples/expect from .webmcpify/manifest.json. The example block below
 * shows the complete pattern with REAL assertions — generated blocks must assert,
 * never comment out.
 *
 * Requirements: real Chrome, HEADED (WebMCP needs a visible tab — headless will
 * never work; use xvfb-run in CI). Enumeration/execution uses the production
 * document.modelContext.getTools()/executeTool() surface (Chrome 2026-07+), with a
 * probe fallback to the removed navigator.modelContextTesting for older builds.
 * Alternative harness: Puppeteer's first-class WebMCP API (pptr.dev/guides/webmcp).
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
    args: ['--enable-features=WebMCP,WebMCPTesting'],
  });
  page = await context.newPage();
});

test.afterAll(async () => {
  await context.close();
});

/** Enumerate registered tools; inputSchema comes back as a STRING (JSON Schema). */
async function listTools(p: Page): Promise<Array<{ name: string; inputSchema?: string }>> {
  return p.evaluate(async () => {
    const mc = (document as any).modelContext ?? (navigator as any).modelContext;
    if (mc?.getTools) return mc.getTools();
    const legacy = (navigator as any).modelContextTesting; // removed 2026-07; older builds only
    if (legacy?.listTools) return legacy.listTools();
    throw new Error('No WebMCP enumeration surface — wrong Chrome build or flags');
  });
}

/**
 * Execute a tool. Contract (Chrome): resolves to a string result, or null when the
 * execution navigated; execution/validation failures REJECT — assert with
 * expect(...).rejects where a failure is the expected outcome.
 */
async function executeTool(p: Page, name: string, args: object): Promise<string | null> {
  return p.evaluate(
    async ({ name, args }) => {
      const mc = (document as any).modelContext ?? (navigator as any).modelContext;
      if (mc?.getTools && mc?.executeTool) {
        const tools = await mc.getTools();
        const tool = tools.find((t: { name: string }) => t.name === name);
        if (!tool) throw new Error(`tool ${name} is not registered`);
        return mc.executeTool(tool, JSON.stringify(args));
      }
      const legacy = (navigator as any).modelContextTesting;
      if (legacy?.executeTool) return legacy.executeTool(name, JSON.stringify(args));
      throw new Error('No WebMCP execution surface — wrong Chrome build or flags');
    },
    { name, args },
  );
}

test('WebMCP is available in the test environment', async () => {
  await page.goto(BASE_URL);
  const available = await page.evaluate(
    () => !!(document as any).modelContext || !!(navigator as any).modelContext,
  );
  expect(available, 'Enable chrome://flags/#enable-webmcp-testing and use current Chrome').toBe(
    true,
  );
});

// ── Generated per manifest tool ──────────────────────────────────────────────
// Complete example for a read-only tool. Fill route/examples/expect from the
// manifest entry; for `auth != none`, sign in with the recorded test fixture in
// beforeAll before asserting.

test.describe('search_tickets', () => {
  test.beforeAll(async () => {
    await page.goto(`${BASE_URL}/projects/demo/tickets`); // manifest: route
  });

  test('is registered with the expected schema', async () => {
    const tools = await listTools(page);
    const tool = tools.find((t) => t.name === 'search_tickets');
    expect(tool).toBeDefined();
    const schema = JSON.parse(tool!.inputSchema ?? '{}'); // stringified → parse first
    expect(schema.required).toContain('query'); // manifest: inputSchema
  });

  test('executes the valid example and updates the UI', async () => {
    const out = await executeTool(page, 'search_tickets', { query: 'test' }); // manifest: examples.valid
    expect(out).not.toBeNull();
    expect(out).not.toMatch(/^ERROR:/);
    await expect(page.getByRole('list', { name: 'Tickets' })).toBeVisible(); // manifest: expect.ui
  });

  test('rejects the invalid example with a self-correcting message', async () => {
    // Imperative tools following the "ERROR: ..." convention resolve; declarative
    // tools and schema violations REJECT — cover whichever the manifest kind implies.
    const out = await executeTool(page, 'search_tickets', {}); // manifest: examples.invalid
    expect(out).toMatch(/^ERROR:/);
  });
});
