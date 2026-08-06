# webmcpify — for agents reading this repo

This repository IS an agent skill. If a user asked you to "webmcpify" a project or
make it agent-ready with WebMCP, do not explore this repo further — read and follow
[`skills/webmcpify/SKILL.md`](skills/webmcpify/SKILL.md) inside the **target**
project's working directory.

Quick facts:

- The pipeline: DETECT → INVENTORY (loop) → human manifest approval → INTEGRATE
  (loop) → VERIFY (loop) → HEAL (loop) → AUDIT + report. Invocation modes
  (`inventory` / `integrate` / `verify` / `status` / `full`) run subsets — see
  SKILL.md §Invocation modes.
- All state persists in `.webmcpify/manifest.json` (Manifest v2) in the target
  repo — resume from it if it exists. Terminal tool statuses: `verified`,
  `skipped`, `rejected`.
- `skills/webmcpify/templates/` contains everything you vendor into target
  projects (runtime TS + JS, ambient types, Playwright spec) — the skill directory
  is self-contained; nothing outside it is needed at run time.
- Hard rules live in SKILL.md "Ground rules" — zero unrelated changes (baseline-
  aware), read-only tools first, server as the only trust boundary, spec-shaped
  API usage, commits opt-in.

When editing this repo itself: keep SKILL.md token-efficient (details belong in
`references/`), keep the runtime dependency-free and the TS/JS variants in sync,
keep every distribution manifest (`.claude-plugin/`, `.cursor-plugin/`,
`gemini-extension.json`, `package.json`) at the same version, and re-check API
claims against https://webmachinelearning.github.io/webmcp/ and
https://developer.chrome.com/docs/ai/webmcp — the surface is in flux.

Two discoverability constraints, both load-bearing:

- **Keep the phrase "WebMCP agent skill" in the SKILL.md `description`, the
  `package.json`/`skill.json` descriptions and the README `<h1>`.** `webmcpify` is a
  coined single token that matches neither `webmcp` nor `agent skill` in search, and
  these strings are exactly what marketplaces and search engines display. Dropping the
  phrase is why one directory invented "Antigravity agent skill" and another filed the
  skill as an "MCP Server".
- **The SKILL.md frontmatter is plain YAML**: no `: ` inside an unquoted scalar (use an
  em dash or "that"), or every consumer's parser breaks. The `description` already
  contains double quotes, so it cannot simply be wrapped in quotes either.
