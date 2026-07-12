---
name: webmcpify
description: |
  Integrate WebMCP into any existing web app — static landing page to huge multi-tenant SaaS — end to end: investigate the codebase, inventory user actions into a reviewable tool manifest, integrate declarative/imperative WebMCP tools WITHOUT changing unrelated logic or UI, then verify every tool in a real browser and heal failures until green.

  Scales to large codebases through iterative loops over persistent state (`.webmcpify/manifest.json` in the target repo) — every phase is resumable across sessions, context compactions, and even different agents.

  Trigger when the user wants to: "add WebMCP", "make this site/app agent-ready", "expose tools to AI agents / browser agents", "webmcpify this project", or asks how AI agents can operate their web app.

  Do NOT trigger for: backend-only MCP servers (that's classic MCP, not WebMCP), browser automation of third-party sites, or generic SEO work.
license: MIT
---

# webmcpify — make any web app agent-ready, verifiably

You are running the webmcpify pipeline. It takes an existing web application and
exposes its user-facing functionality as [WebMCP](https://webmachinelearning.github.io/webmcp/)
tools (`document.modelContext`), so browser AI agents can operate the app through
structured tool calls instead of guessing at the DOM.

The pipeline has five phases. **Phases 1–4 are loops over persistent state**, not
one-shot passes — this is what makes the pipeline work on codebases of any size.

```
DETECT ──▶ INVENTORY ──▶ [HUMAN GATE: manifest approval] ──▶ INTEGRATE ──▶ VERIFY ──▶ HEAL
              ▲  loop            per batch on big apps          ▲  loop      ▲ loop    ▲ loop
              └── per area                                      └── per manifest entry ──┘
```

## Ground rules (non-negotiable, enforce in every phase)

1. **Zero unrelated changes.** Every diff hunk you produce must trace to a manifest
   entry (or to the one-time runtime install). Never refactor, reformat, rename, or
   "improve" anything else — even obvious problems. Note them in the report instead.
   The final phase includes a diff audit that must pass.
2. **Read-only tools first.** Tools that mutate state require explicit per-tool
   approval in the manifest (`"mutating": true` acknowledged by the human). Never
   expose destructive/irreversible/payment actions in a first integration.
3. **The server is the only trust boundary.** A tool's `execute()` may only call code
   paths the UI already uses (same endpoints, same validation, same auth). Never
   create new endpoints, never bypass existing checks, never put secrets in tools.
4. **Spec-pure.** Use only the W3C surface: `document.modelContext.registerTool()`
   with AbortSignal-based lifecycle (fallback-detect `navigator.modelContext`).
   No third-party WebMCP runtime dependencies. Everything is feature-detected;
   the app must behave identically in browsers without WebMCP.
5. **Never `toolautosubmit` on state-changing forms.** Only on pure read forms
   (search, filter, availability).
6. **State lives in files, not in your context.** Read/write `.webmcpify/` in the
   target repo constantly. Assume your context can be wiped between any two steps.

## Fresh, authoritative guidance

WebMCP is an evolving origin-trial API (the surface has already changed during the
trial). Before Phase 2, if network is available, pull Google's current official
guides rather than relying on memory:

```sh
npx -y modern-web-guidance@latest retrieve "webmcp,agentic-forms,agentic-javascript-tools"
```

If that fails (offline), use `references/integrate.md` — but prefer the live guides
when they conflict.

## The state protocol (`.webmcpify/` in the target repo)

All pipeline state persists in the target repo under `.webmcpify/`:

| File | Purpose |
|---|---|
| `manifest.json` | The tool manifest — the single source of truth (schema below) |
| `report.md` | Human-facing running report; finalized at the end |

**Resume rule:** at the very start, check whether `.webmcpify/manifest.json` exists.
If it does, **resume**: recompute nothing that is already recorded, pick up at the
first area with `"status": "pending"` or the first tool not yet `verified`/`skipped`.
This makes the pipeline safe to interrupt at any point.

`manifest.json` schema (Webmcpify Manifest v1):

```jsonc
{
  "webmcpify": 1,
  "app": { "stack": "react-vite", "entry": "src/main.tsx", "baseUrl": "http://localhost:5173", "startCommand": "npm run dev" },
  "areas": [
    // The codebase map. One entry per route/view/module — the unit of iteration.
    { "id": "checkout", "paths": ["src/features/checkout/"], "status": "pending" }
    // status: pending | inventoried
  ],
  "tools": [
    {
      "id": "create_ticket",
      "area": "tickets",
      "kind": "imperative",             // imperative | declarative
      "mutating": true,                  // read-only tools: false
      "description": "Creates a new ticket in the currently open project.",
      "inputSchema": { /* JSON Schema */ },
      "source": ["src/features/tickets/NewTicket.tsx:42"],  // the UI code path it wraps
      "status": "discovered",            // discovered | approved | rejected | integrated | verified | failed | skipped
      "attempts": 0,                     // heal attempts, escalate at 3
      "notes": ""
    }
  ],
  "log": [ "2026-07-12 inventory: area checkout done, 4 candidates" ]
}
```

## Phase 0 — DETECT

Identify: stack (static HTML / SSG / React / Next / Vue / Angular / other), build +
dev-server commands, TypeScript or not, auth model (none / session / roles), test
setup, and how the app is started locally. Record in `manifest.json` under `app`.
Create `.webmcpify/` and commit nothing yet. Details: `references/inventory.md` §Detect.

## Phase 1 — INVENTORY (loop; scales to any size)

**Never try to map a large codebase in one pass.** Do this instead:

1. **Area map first (cheap, structural):** enumerate routes/views/feature modules
   from the router config, pages directory, or navigation — *without* reading
   implementation files. Write every area to `manifest.areas` with `"pending"`.
   For a landing page this is one area; for a big SaaS it may be dozens.
2. **Inventory loop — one area per iteration:**
   - Pick the next `pending` area. Deep-read only that area's files.
   - Identify every *user action* (form submissions, button-triggered mutations,
     searches/filters, list/detail reads) and draft a candidate tool for each:
     name (verb-first, execution vs initiation semantics), description, JSON Schema,
     `mutating` classification, source refs. Conventions: `references/inventory.md`.
   - Append candidates as `"discovered"`, set the area `"inventoried"`, append a log
     line. **Write the manifest before moving on.**
   - If your agent supports sub-agents, you may fan out several areas in parallel —
     but each sub-agent writes only its own area's entries.
3. **Exit condition:** no `pending` areas remain, **plus one completeness pass**:
   walk the running app's main navigation (or the sitemap) and ask "is any visible
   user action missing from the manifest?" Add stragglers.

## GATE — manifest approval (the one human checkpoint)

Present the manifest to the human as a compact table (id, area, kind, mutating,
one-line description) and ask them to approve/reject/edit. On large apps, present
per-area batches instead of one giant table. Only `approved` tools proceed.
Mutating tools must be *individually* acknowledged. Record decisions in the manifest.

## Phase 2 — INTEGRATE (loop)

One-time setup first (per repo): vendor the runtime (`references/runtime.md`) into
the project and wire the origin-trial token / test flag note into the README or head
template. Then loop:

1. Pick the next batch of `approved` tools — **one area or ≤5 tools per iteration**.
2. Implement them: declarative attributes for plain HTML forms; imperative
   registration via the vendored runtime for SPA/dynamic actions. Follow
   `references/integrate.md` patterns exactly (AbortSignal lifecycle, UI-settled
   returns, `"ERROR: ..."` strings, `readOnlyHint`/`untrustedContentHint`).
3. Build + typecheck. Fix only what the batch broke.
4. Mark each tool `"integrated"`, write the manifest, and — if the repo uses git —
   commit the batch (message: `feat(webmcp): expose <ids> (webmcpify)`), so every
   batch is independently revertable.
5. Repeat until no `approved` tools remain.

## Phase 3 — VERIFY (loop)

Set up the harness once (`references/verify.md`): headed Chrome with the WebMCP
flag, Playwright if available, dev server running. Then loop over every
`integrated` tool:

- Enumerate registered tools in the live page and assert the tool appears with the
  expected schema.
- Execute it with representative inputs (read-only tools: real calls; mutating
  tools: against dev/test data only, never production).
- Assert on **both** the returned string **and** the resulting UI state.
- Pass → `"verified"`. Fail → `"failed"` with the failure recorded in `notes`.

## Phase 4 — HEAL (loop)

While any tool is `"failed"`:

1. Diagnose from the failure note + `references/heal.md` failure taxonomy
   (schema mismatch, missing `label[for]`/`name`, lifecycle/registration timing,
   UI-settled race, feature flag absent, dev-server issue).
2. Fix **only** that tool's integration, increment `attempts`, re-run Phase 3 for it.
3. `attempts` reaches 3 → mark `"skipped"`, write a clear blocker note, move on.
   Never loop forever; never widen the diff to force a pass.

**Global exit:** every tool `verified` or `skipped` (with reasons), full build green.

## Final — diff audit + report

1. **Diff audit:** review the complete diff since the pipeline started. Every hunk
   must map to a manifest entry or the runtime install. Anything else → revert it.
2. Finalize `.webmcpify/report.md`: tool coverage table (per area), skipped tools
   with blockers, security notes (which mutating tools exist, what guards them),
   and how to test manually (flag, DevTools WebMCP pane, inspector extension).
3. Tell the human: what's exposed, what's skipped and why, and the one-paragraph
   "how to try it" instruction.

## References (read on demand, not upfront)

- `references/inventory.md` — area mapping, tool naming/schema conventions
- `references/integrate.md` — declarative + imperative patterns per stack
- `references/runtime.md` — the vendored runtime module (copy into target repos)
- `references/verify.md` — harness setup: flags, Playwright, DevTools, audits
- `references/heal.md` — failure taxonomy → fixes
- `references/security.md` — the full security checklist (apply before the gate and at the end)
