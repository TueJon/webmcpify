# Verify — proving every tool works in a real browser

## Environment

- **Current Chrome** (the API moved during the trial; verification probes
  `document.modelContext`, never `navigator.modelContext`). A fresh container may
  have no Chrome or virtual display: provision both explicitly and verify their
  binaries before running. Do not assume `google-chrome` or `xvfb-run` exists.
- Enable: `chrome://flags/#enable-webmcp-testing`, or launch with
  `--enable-features=WebMCP,WebMCPTesting` (covers both current and older builds).
- **Headed only for this harness** — Chrome 150 exposed no `modelContext` in the
  measured headless path. Run a real tab under a verified virtual display in CI;
  don't heal toward headless.
- Set `WEBMCP_BASE_URL` to the observed verification origin and
  `WEBMCP_PROFILE_DIR` to a dedicated writable user-data directory. Never pin a
  checkout-specific `/work/...` path or assumed localhost port in the spec. Chrome
  can ignore feature switches when another instance owns the same profile.
- App running via `app.startCommand`, against dev/test data only. If it never
  boots, capture console errors and failed requests before touching tool code;
  absolute backend URLs and exact-port CORS allow-lists are common environment
  failures.
- Each tool's manifest entry tells you where and how: `route` (navigate there),
  `auth` (sign in with the recorded test fixture; verify under EACH role for
  role-scoped tools), `examples` (what to execute), `expect` (what to assert),
  `cleanup` (how to undo a mutating tool's effect after the test).

## The enumeration/execution surface (probe, don't assume)

In the page context, probe the current production surface:

```js
const mc = document.modelContext;
if (!window.isSecureContext || !mc) throw new Error('insecure origin or unsupported test environment');
const tools = await mc.getTools();
```

Contract facts that generated assertions MUST respect:

- Enumerated `inputSchema` is a **stringified** JSON Schema — `JSON.parse` before
  comparing against the manifest entry.
- `executeTool(...)` resolves to a **string result, or `null` when the execution
  navigated** (normal for declarative forms that submit-navigate).
- Execution and declarative-validation failures **reject the promise** — they do
  not resolve to `"ERROR: ..."`. Only imperative tools following the runtime's
  convention resolve with `"ERROR: ..."` strings. Assert accordingly per tool
  `kind`.
- **Registration is asynchronous** — `registerTool()` returns a promise, so a tool
  is not enumerable the instant the page loads. Poll for it (`waitForTool` in the
  template) or await a `toolchange` event; never assert presence immediately
  after `goto`.
- **Mutating declarative forms pause mid-execution**: Chrome fills the form, then
  waits for a real submit interaction before letting `executeTool` settle —
  awaiting it alone deadlocks into a timeout. Use the concurrent pattern: start
  `executeTool` unawaited → wait for an agent-filled value to appear → click
  submit → await the result (full example in the template).
- These surfaces are for agents/harnesses only — they must never appear in shipped
  application code.

For **declarative** tools also verify the *synthesized* schema: the form-control →
schema mapping is only partially specified, so check each annotated control appears
as the expected property in the actual target Chrome build.

## Per-tool checks

1. Registered (poll — registration is async) with the expected name, the (parsed)
   schema, **and** the manifest `annotations` on the enumerated tool.
2. Valid example executes: assert the result per `expect` — `expect.result` as a
   substring of the resolved string, plus `expect.navigation` when a declarative
   submit navigates or an imperative tool defers the app's existing route action —
   **and** the `expect.ui` state as a **delta** (capture the relevant state *before* executing; mere
   visibility of something already on screen proves nothing). A tool that reports
   success without the UI changing is a **fail** (UI-settled rule). Because
   executions can navigate, restore the manifest `route` in `beforeEach`, not
   `beforeAll`.
3. Invalid example: **prove the tool is present first** (a rejection from a
   never-registered tool is not a validation rejection). Then: imperative →
   resolves `"ERROR: ..."`; declarative/schema violation → rejects. Zero-param
   read tools with `examples.invalid: null` get the dual-outcome assertion
   instead: `{"unexpected": true}` may be rejected with a validation reason OR
   resolve benignly — both pass; a missing tool/surface fails.
4. Mutating tools: run against disposable data, verify the mutation through the
   same read path the UI uses, then execute the manifest `cleanup` — a
   `mutating: "server"` tool without working cleanup blocks at the gate, and
   heal-loop retries of mutating tools must clean up between attempts.

## Harness

Instantiate `templates/webmcp.spec.ts` (bundled with this skill) — Playwright,
headed persistent Chrome, one describe-block per tool generated from the manifest,
with real assertions (never commented-out placeholders). Put the generated spec
next to the repo's existing e2e tests.

**Repos without a test setup — the standalone-harness recipe.** The spec stays in
`.webmcpify/webmcp.spec.ts` (single source of truth, committed per the gate's
`commitWebmcpifyDir` choice); the Playwright installation lives in a scratch
harness OUTSIDE the repo so the target gains no dependencies:

```sh
mkdir -p /tmp/webmcpify-harness && cd /tmp/webmcpify-harness
npm init -y && npm i -D @playwright/test typescript @types/node
cat > playwright.config.ts <<'EOF'
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: process.env.WEBMCP_SPEC_DIR,   // → <target-repo>/.webmcpify
  workers: 1,                              // one shared headed Chrome — never parallelize
});
EOF
WEBMCP_SPEC_DIR=<target-repo>/.webmcpify \
WEBMCP_BASE_URL=<recorded-app.verificationOrigin> \
WEBMCP_PROFILE_DIR=<dedicated-writable-profile-dir> \
NODE_PATH=/tmp/webmcpify-harness/node_modules npx playwright test
```

`NODE_PATH` lets the out-of-repo spec resolve `@playwright/test`; if the target's
tooling ignores `NODE_PATH`, symlink instead:
`ln -s /tmp/webmcpify-harness/node_modules <target-repo>/.webmcpify/node_modules`
(and make sure it isn't committed). Note in the report that verification ran from
a standalone harness.

For ChatGPT's separate built-in-browser experience—named **Site tools**, with
account/model availability, a narrower API subset, and page-lifetime behavior—use
`references/client.md`. Chrome harness success alone does not prove a specific
ChatGPT account can use every verified tool.

**Alternative:** Puppeteer ships a first-class experimental WebMCP API
(https://pptr.dev/guides/webmcp) — prefer it when the target repo already uses
Puppeteer. As documented on 2026-08-29, that `page.webmcp` surface requires
Chrome 151+ and `--enable-features=WebMCP`; keep this requirement separate from
the page-context Playwright harness above, which was measured against Chrome 150.

## Agent evals (recommended; mandatory for SaaS-scale toolsets)

Schema-level verification proves tools *work*, not that an LLM *picks* them or
completes a journey. Keep the layers distinct:

1. Run Google's experimental **WebMCP Evals CLI**
   (GoogleChromeLabs/webmcp-tools, package `webmcp-evals`) in `smoke` mode first.
   It replays `expectedCall` entries against the live page without a model or API
   key, so failures here are deterministic integration failures.
2. Run model-backed evals with multiple runs. Include at least one direct prompt
   and one realistic ambiguous prompt per tool, plus ordered or unordered
   multi-tool cases for each critical journey. Supply the complete route/state
   tool set so selection is tested against real overlap, not one tool in isolation.
3. Treat model failures as product evidence about names, descriptions, schemas,
   outputs, availability, or workflow boundaries. Inspect the HTML/JSON trajectory
   before changing a contract: `webmcp-evals` 0.0.4 added local Vercel-backend
   trajectories with per-step text, reasoning, calls, and results; other backends
   may omit them. Never heal from only `expected`/`actual` when a trajectory is
   available.

Use `local` for fast schema/selection iteration and `browser` for real exposed
tools. Evals remain probabilistic evidence; they do not replace the deterministic
registration, execution, UI-delta, cleanup, and safeguard checks above.

## Manual QA (tell the human in the report)

- DevTools → **Application → WebMCP pane**: live tool list, invocation log,
  "Run tool" with editable params.
- **Model Context Tool Inspector** Chrome extension (by Google's François
  Beaufort): natural-language smoke tests of tool *selection*.
- Chrome's WebMCP audits flag missing `toolname`/`toolparamdescription`/
  `label[for]`/`name` on declarative forms.
- Third-party inspectors also grade pages with a compliance **score** mixing spec
  features, conventions, and invented checks (`toolaction`, `window.ai`). Classify
  each finding per `references/discovery.md`: a confirmed **spec** violation means
  the harness is missing an assertion — add it, then heal the failure. Conventions
  and invented checks are report input only.
