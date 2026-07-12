# webmcpify — for agents reading this repo

This repository IS an agent skill. If a user asked you to "webmcpify" a project or
make it agent-ready with WebMCP, do not explore this repo further — read and follow
[`skills/webmcpify/SKILL.md`](skills/webmcpify/SKILL.md) inside the **target**
project's working directory.

Quick facts:

- The pipeline: DETECT → INVENTORY (loop) → human manifest approval → INTEGRATE
  (loop) → VERIFY (loop) → HEAL (loop) → diff audit + report.
- All state persists in `.webmcpify/manifest.json` in the target repo — resume from
  it if it exists.
- `runtime/webmcpify.ts` + `runtime/webmcp.d.ts` are templates you vendor into
  target projects (never add as a dependency).
- `harness/webmcp.spec.ts` is the Playwright verification template.
- Hard rules live in the SKILL.md "Ground rules" section — zero unrelated changes,
  read-only tools first, server as the only trust boundary, spec-pure API usage.

When editing this repo itself: keep SKILL.md token-efficient (details belong in
`references/`), keep the runtime dependency-free, and keep every distribution
manifest (`.claude-plugin/`, `.cursor-plugin/`, `gemini-extension.json`,
`package.json`) at the same version.
