# Verify — proving every tool works in a real browser

## Environment

- **Chrome ≥150** (use the newest available; the API surface moved during the trial).
- Enable: `chrome://flags/#enable-webmcp-testing`, or launch with
  `--enable-features=WebMCP,DevToolsWebMCPSupport`.
- **Headed only** — WebMCP requires a visible tab by design. In CI, run under
  `xvfb-run`. Headless will never work; don't heal toward it.
- App running locally via `app.startCommand` from the manifest, dev/test data only.

## Enumeration check (per tool)

In the page context (test scaffolding — Chrome exposes `navigator.modelContextTesting`
behind the flag; it is NOT a product API and must never appear in shipped code):

```js
const tools = await navigator.modelContextTesting.listTools();
// assert: tool present, name exact, inputSchema matches the manifest entry
```

For **declarative** tools also verify the *synthesized* schema — the form-control →
schema mapping is only partially specified, so check that each annotated control
appears as the expected property with the expected type/required flag in the actual
target Chrome build.

## Execution check (per tool)

```js
const out = await navigator.modelContextTesting.executeTool(
  'search_tickets', JSON.stringify({ query: 'test' }));
```

Assert **both**:
1. The returned string (success message, or a correct `"ERROR: ..."` for invalid input —
   test at least one invalid-input case per tool).
2. The resulting UI state (the search results actually rendered, the item actually
   appears in the list). A tool that returns success without the UI changing is a
   **fail** — it violates the UI-settled rule.

Mutating tools: execute only against disposable dev/test data, and verify the
mutation through the same read path the UI uses.

## Playwright template (when the project has/allows it)

Instantiate `harness/webmcp.spec.ts` from this skill's repo: it launches persistent
headed Chrome with the flags, navigates to `app.baseUrl`, and runs
enumeration + execution asserts generated from the manifest. Keep generated specs in
the target repo under `webmcp.spec.ts` next to existing e2e tests (or `.webmcpify/`
if the repo has no test setup — note that in the report).

## Manual QA (tell the human in the report)

- DevTools → **Application → WebMCP pane**: live tool list, invocation log, "Run tool"
  with editable params.
- **Model Context Tool Inspector** Chrome extension (by Google's François Beaufort):
  natural-language smoke tests of tool *selection* — good for validating descriptions.
- Chrome's WebMCP audits flag missing `toolname`/`toolparamdescription`/`label[for]`/
  `name` on declarative forms.
