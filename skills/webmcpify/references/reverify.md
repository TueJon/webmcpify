# Re-verification after an app or environment change

Read this on resume, an explicit `verify`, or a release check of an existing
integration. A successful run proves the recorded app and environment, not every
future release. This is evidence maintenance; it does not authorize deployment,
new tools, production effects, or renewed execution of an uncertain mutation.

## Record the inputs to a successful check

After each tool passes native verification, store `verifiedAgainst` on its
manifest entry (an optional Manifest v4 field; absent means unknown):

```json
{
  "at": "2026-09-14T12:00:00Z",
  "contractRevision": 1,
  "appRevision": "git-sha-or-build-id",
  "files": {"src/webmcp/tools.ts": "sha256:..."},
  "environment": {
    "origin": "https://app.example.test",
    "browser": "Chrome 150.0.7871.186",
    "harness": "playwright-page-context",
    "inputMode": "json-string",
    "roles": ["member"],
    "fixtureRevision": "seed-v2"
  },
  "evidence": "local-redacted-report-path"
}
```

`files` covers the tool implementation, shared runtime, generated harness and
compat helper, plus handlers/routes/stores and dependency lockfiles relevant to
its behavior. Hash current working-file contents, including approved uncommitted
edits: HEAD alone misses a changed working tree. Store hashes and fixture ids,
never credentials or fixture data. Record actual flags and native/simulated mode
in the linked report; only native evidence can produce this record. Use null for
an unavailable app/build revision; without a usable file map treat reuse as
unproven. A backend build/config change relevant to the UI path also invalidates
the evidence even when frontend files did not change.

## Resume with bounded invalidation

1. `status` reads and reports counts plus evidence age/unknowns; it never starts a
   browser, changes statuses or executes tools. `inventory` remains inventory-only.
2. In `full` or `verify`, compare recorded contracts, relevant files and the test
   environment. Unchanged inputs retain their evidence. An explicit `verify`
   still runs the selected integrated/verified tools as requested.
3. Changed implementation or environment: reset affected `verified` tools to
   `integrated`, preserve their previous evidence in the report, clear the stale
   `verifiedAgainst`, log the reason and return a completed pipeline to `verify`.
   Shared runtime/harness changes affect all dependent tools. If dependencies or
   provenance are unknown, re-verify all integrated/verified tools in the approved
   scope. Do not rescan unaffected inventory or overwrite baseline-dirty files.
4. Changed contract, role/origin authorization, or mutation scope: return affected
   tools to the human gate. Existing approval remains valid only for the same
   approved contract and test effects. Never silently approve a new origin.
5. Interrupted mutation with uncertain outcome: inspect through the UI's read
   path and reconcile disposable data/cleanup before another execution. If the
   outcome cannot be established, record a blocker; do not replay it on resume.
6. Keep rejected/skipped tools and their reasons. Reconsider them only when a
   recorded blocking condition changes or the user changes scope; return changed
   contracts to the gate. Never count skipped tools as verified coverage.

Run the usual deterministic assertions and cleanup. Re-run selection/journey
evals when names, descriptions, available tool sets or critical workflows change;
record model/backend/version and repeated-run outcomes separately from native
contract evidence. Runtime verification alone does not prove model selection or
that another client supports the same surface.

Source boundaries checked 2026-09-14: [Chrome WebMCP](https://developer.chrome.com/docs/ai/webmcp)
is experimental; [Chrome execution](https://developer.chrome.com/docs/ai/webmcp/imperative-api)
and [Puppeteer](https://pptr.dev/guides/webmcp) have different version requirements.
The invalidation procedure above is webmcpify policy, not a WebMCP spec feature.
