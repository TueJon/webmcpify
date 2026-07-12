# Verify — proving every tool works in a real browser

## Environment

- **Current Chrome** (the API moved during the trial — the old
  `navigator.modelContextTesting` surface was removed 2026-07 in favor of
  production `document.modelContext.getTools()/executeTool()`).
- Enable: `chrome://flags/#enable-webmcp-testing`, or launch with
  `--enable-features=WebMCP,WebMCPTesting` (covers both current and older builds).
- **Headed only** — WebMCP requires a visible tab by design. In CI, run under
  `xvfb-run`. Headless will never work; don't heal toward it.
- App running locally via `app.startCommand`, against dev/test data only.
- Each tool's manifest entry tells you where and how: `route` (navigate there),
  `auth` (sign in with the recorded test fixture; verify under EACH role for
  role-scoped tools), `examples` (what to execute), `expect` (what to assert),
  `cleanup` (how to undo a mutating tool's effect after the test).

## The enumeration/execution surface (probe, don't assume)

In the page context, prefer the production surface and fall back for older builds:

```js
const mc = document.modelContext ?? navigator.modelContext;
const tools = mc?.getTools
  ? await mc.getTools()
  : await navigator.modelContextTesting?.listTools();   // removed 2026-07; legacy only
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
- These surfaces are for agents/harnesses only — they must never appear in shipped
  application code.

For **declarative** tools also verify the *synthesized* schema: the form-control →
schema mapping is only partially specified, so check each annotated control appears
as the expected property in the actual target Chrome build.

## Per-tool checks

1. Registered with the expected name and (parsed) schema.
2. Valid example executes: assert the result string (or `null` + expected
   navigation) **and** the `expect.ui` state — a tool that reports success without
   the UI changing is a **fail** (UI-settled rule).
3. Invalid example: imperative → resolves `"ERROR: ..."`; declarative/schema
   violation → rejects.
4. Mutating tools: run against disposable data, verify the mutation through the
   same read path the UI uses, then execute the manifest `cleanup` — a mutating
   tool without working cleanup blocks at the gate, and heal-loop retries of
   mutating tools must clean up between attempts.

## Harness

Instantiate `templates/webmcp.spec.ts` (bundled with this skill) — Playwright,
headed persistent Chrome, one describe-block per tool generated from the manifest,
with real assertions (never commented-out placeholders). Put the generated spec
next to the repo's existing e2e tests, or under `.webmcpify/` if the repo has no
test setup (note that in the report).

**Alternative:** Puppeteer ships a first-class experimental WebMCP API
(https://pptr.dev/guides/webmcp) — prefer it when the target repo already uses
Puppeteer.

## Tool-selection evals (recommended; mandatory for SaaS-scale toolsets)

Schema-level verification proves tools *work*, not that an LLM *picks* them.
For apps exposing more than a handful of tools, run Google's **WebMCP Evals CLI**
(GoogleChromeLabs/webmcp-tools, `evals-cli`): write one eval case per tool from the
manifest examples ("user says X → expect tool Y with args Z") and run them —
this catches ambiguous names/descriptions and overlapping tools that Playwright
cannot.

## Manual QA (tell the human in the report)

- DevTools → **Application → WebMCP pane**: live tool list, invocation log,
  "Run tool" with editable params.
- **Model Context Tool Inspector** Chrome extension (by Google's François
  Beaufort): natural-language smoke tests of tool *selection*.
- Chrome's WebMCP audits flag missing `toolname`/`toolparamdescription`/
  `label[for]`/`name` on declarative forms.
