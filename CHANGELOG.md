# Changelog

All notable changes to webmcpify are recorded here. WebMCP is still evolving;
this log makes API and verification changes visible without requiring readers to
reconstruct them from git history.

## [Unreleased]

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
