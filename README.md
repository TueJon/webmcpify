# webmcpify

**Make any web app agent-ready — verifiably.**

webmcpify is an agent skill that integrates [WebMCP](https://webmachinelearning.github.io/webmcp/)
(the W3C Web Model Context Protocol, `document.modelContext`) into an **existing**
web application — from a static landing page to a large multi-tenant SaaS — end to end:

```
DETECT ─▶ INVENTORY ─▶ [you approve the tool manifest] ─▶ INTEGRATE ─▶ VERIFY ─▶ HEAL
             loop                                            loop        loop     loop
```

Your coding agent investigates the codebase, proposes a **tool manifest** (every
user action worth exposing, with names, schemas, and a read-only/mutating
classification), and after your approval integrates the tools, **proves each one
works in a real browser**, and heals failures until everything is green — while
guaranteeing **zero changes to unrelated logic or UI**.

## Why

Browser AI agents (Gemini in Chrome, extensions, assistive tech) are learning to
call structured page tools instead of scraping the DOM. WebMCP is the emerging
W3C standard for that, co-developed by Google and Microsoft, in origin trial since
Chrome 149. Making an app agent-ready by hand means reading specs that are still
moving, learning tool-design conventions, and building a verification setup —
webmcpify packages all of that into one command for your coding agent.

## Install (one command)

**Any agent** — Claude Code, Codex, Cursor, opencode, Copilot, and [70+ more](https://github.com/vercel-labs/skills):

```sh
npx skills add TueJon/webmcpify
```

**Claude Code** (as a plugin):

```
/plugin marketplace add TueJon/webmcpify
/plugin install webmcpify@webmcpify
```

**Manual** (any agent that reads skills or instructions): copy
[`skills/webmcpify/`](skills/webmcpify/) into your agent's skills directory, or just
tell your agent to follow
[`skills/webmcpify/SKILL.md`](skills/webmcpify/SKILL.md).

## Use

Open your agent in the target repo and say:

```
webmcpify this app
```

The agent runs the pipeline and comes back to you exactly once — to approve the
tool manifest. Everything else (integration, browser verification, healing) runs
autonomously, with all state persisted in `.webmcpify/manifest.json` so runs are
**resumable** across sessions, context windows, and even different agents.

## Built to scale to large codebases

Every phase is a **loop over persistent state**, not a one-shot pass:

- **Inventory** maps the codebase into areas (routes/views/modules) first, then
  deep-reads one area per iteration — a 500-file SaaS is processed area by area,
  never in one context-busting sweep. Sub-agent fan-out per area is supported.
- **Integrate** works in small batches (one area or ≤5 tools), each independently
  built, typechecked, and committed.
- **Verify/Heal** iterate per tool, with an attempt cap and human escalation
  instead of infinite loops.
- Interrupt at any point; the next run resumes from the manifest.

## Guarantees

- **Zero unrelated changes** — every diff hunk traces to a manifest entry; a final
  diff audit enforces it.
- **Read-only first** — mutating tools require your explicit per-tool approval;
  destructive/payment actions are never exposed.
- **Server stays the trust boundary** — tools only call code paths your UI already
  uses; no new endpoints, no bypasses.
- **Spec-pure, zero dependencies** — a ~90-line MIT runtime is vendored into your
  repo (no npm dependency), everything feature-detected: your app is byte-for-byte
  identical for browsers without WebMCP.
- **Proven, not promised** — every tool is enumerated and executed in real Chrome,
  asserting on both the tool result and the resulting UI state.

## What's in this repo

| Path | Purpose |
|---|---|
| [`skills/webmcpify/SKILL.md`](skills/webmcpify/SKILL.md) | The pipeline (what your agent follows) |
| [`skills/webmcpify/references/`](skills/webmcpify/references/) | Phase guides: inventory, integrate, runtime, verify, heal, security |
| [`runtime/`](runtime/) | The spec-pure runtime + ambient types, vendored into target repos |
| [`harness/`](harness/) | Playwright verification template |

## Status

WebMCP itself is an **origin trial** (Chrome 149 → expected stable ~157): production
exposure needs an [origin-trial token](https://developer.chrome.com/origintrials/),
local development needs `chrome://flags/#enable-webmcp-testing`. The API surface has
already changed once mid-trial — webmcpify isolates that churn in one vendored file
and treats Google's live [modern-web-guidance](https://github.com/GoogleChrome/modern-web-guidance)
as the source of current best practices at integration time.

## Related projects

- [webmachinelearning/webmcp](https://github.com/webmachinelearning/webmcp) — the W3C spec
- [GoogleChromeLabs/webmcp-tools](https://github.com/GoogleChromeLabs/webmcp-tools) — Google's demos, types, and evals CLI (webmcpify follows these patterns)
- [GoogleChrome/modern-web-guidance](https://github.com/GoogleChrome/modern-web-guidance) — official best-practice guides (webmcpify pulls its WebMCP guides live)
- [MCP-B / WebMCP-org](https://github.com/WebMCP-org/npm-packages) — polyfill + extension ecosystem (different philosophy: runtime dependency; webmcpify vendors instead)

## License

[MIT](LICENSE) — © Jonas Tüchler
