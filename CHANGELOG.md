# Changelog

All notable changes to webmcpify are recorded here. WebMCP is still evolving;
this log makes API and verification changes visible without requiring readers to
reconstruct them from git history.

## [Unreleased]

## [0.6.1] — 2026-09-19

- Pinned the verification harness install to the versions the skill is tested with
  (`@playwright/test` matching the Workbench's Playwright) and run its local binary
  instead of `npx`, preventing version drift in the direct harness dependencies and
  package downloads when the harness runs.

## [0.6.0] — 2026-09-19

- Tightened eval execution with reviewed versions, bounded runs and approved data;
  added independent mutation-effect checks and React/Svelte lifecycle acceptance.

- Added input-aware re-verification on resume: retain valid evidence, invalidate
  affected tools after app/runtime/browser changes, and reconcile uncertain
  interrupted mutations before retrying. A stable sidecar OS lock now serializes
  scan-through-settlement across atomic manifest replacement. Status remains read-only.

- Removed automatic unpinned guidance-package execution. Current official guides
  are read without executing a package; optional CLI use requires an exact reviewed
  version and user authorization. Scoped verification to dedicated target-app test
  contexts, with local redacted evidence and explicit untrusted-content boundaries.

## [0.5.1] — 2026-09-14

- Updated verification for the CG draft and Chrome's 2026-09-11 execution
  contract: `executeTool` now receives a JavaScript object, while Chrome 150's
  deprecated JSON-string input remains supported through a temporary,
  side-effect-free capability probe. Real application tools are invoked exactly
  once, so a post-mutation handler failure cannot trigger a compatibility retry.
- Kept current and older browser evidence comparable: the harness and visual
  Workbench accept object or stringified enumerated schemas, and the native proof
  records whether the browser exposes `consequentialHint` instead of pinning the
  Chrome 150 omission.

## [0.5.0] — 2026-09-09

- Added an agent-launched, dependency-free visual WebMCP Workbench with the
  WebMCPify palette, responsive desktop/phone layouts, manifest comparison,
  schema-driven arguments, structured results, mutation confirmation, and
  explicit `Native` versus `Simulated` evidence. The portable simulation is
  development-only and never counts as native verification.
- Added the CG draft's `consequentialHint` across ambient types, inventory,
  integration, security, manifest examples, and verification so significant
  real-world or non-reversible effects are signaled without weakening the
  application's actual safety boundaries. Verification records the dated Chrome
  150 omission instead of falsely claiming native enumeration support.
- Added native/stub I/O compat: the harness uses an explicit adapter mode —
  stub `tool.execute(object)` or spec-shaped `mc.executeTool(object)` when
  `mc.__webmcpStubObjectMode` is set, native `mc.executeTool(JSON string)` otherwise
  (preserved when wrapped, zero-param tools included) with no retry so handler
  `TypeError` never double-executes; stub object results normalize to JSON strings
  (undefined→null). Ships a shared `templates/webmcp-compat.js` vendored with the
  harness; ambient types widen `executeTool` input/result to the dual contract;
  deterministic tests execute the actual template adapter, wrapped native and
  spec-shaped stub included.
- Added an explicit `curated | parity` coverage choice, policy-backed inventory
  verdicts, and a required route→tool coverage map (an element census for parity).
- Made secure context, verification origin, backend origins and CORS assumptions
  DETECT gates instead of late verification surprises.
- Guarded imperative tools against bare `null`/`undefined` results and documented
  deferred route changes after a structured result.
- Classified failures before retry counting, reset counters after contract changes,
  and made skips state the impossibility class and evidence.
- Hardened headed-Chrome verification around environment-provided origins and
  dedicated profiles, and added dated ChatGPT Site tools guidance.
- Split deterministic WebMCP smoke verification from probabilistic tool-selection
  and journey evals, added trajectory-led failure diagnosis for `webmcp-evals`
  0.0.4, and dated Puppeteer's Chrome 151+ harness requirement.
- Documented ChatGPT Site tools' current top-level imperative-only compatibility
  boundary separately from the broader WebMCP APIs verified in Chrome.

## [0.4.0] — 2026-08-17

- Migrated persistent runs to Manifest v3 with explicit auth fixtures, client vs.
  server mutation classes, tool annotations, and path-based setup records.
- Added approval-gated off-page discovery through `/.well-known/webmcp`, with a
  generated manifest template and drift requirements.
- Updated the runtime and verification contract for the current
  `document.modelContext` surface, including native enumeration and execution.
- Added a deterministic proof app, an uncut 63-second Chrome recording, before and
  after manifests, the complete integration patch, and reproducible verification.
- Expanded directory metadata so marketplaces describe the project as a WebMCP
  agent skill rather than an MCP server.

[0.4.0]: https://github.com/TueJon/webmcpify/releases/tag/v0.4.0
[0.5.0]: https://github.com/TueJon/webmcpify/compare/v0.4.0...v0.5.0
[0.5.1]: https://github.com/TueJon/webmcpify/compare/v0.5.0...v0.5.1
[0.6.0]: https://github.com/TueJon/webmcpify/compare/v0.5.1...v0.6.0
[0.6.1]: https://github.com/TueJon/webmcpify/compare/v0.6.0...v0.6.1
[Unreleased]: https://github.com/TueJon/webmcpify/compare/v0.6.1...HEAD
