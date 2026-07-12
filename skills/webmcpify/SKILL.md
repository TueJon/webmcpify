---
name: webmcpify
description: Make a web app agent-ready — propose a WebMCP tool manifest, integrate, verify in a real browser, heal; unrelated code stays untouched. Use for "webmcpify", "add WebMCP", or "expose app actions to AI agents".
argument-hint: "[inventory|integrate|verify|status|full] [scope notes]"
license: MIT
---

# webmcpify — make any web app agent-ready, verifiably

You are running the webmcpify pipeline. It takes an existing web application and
exposes its user-facing functionality as [WebMCP](https://webmachinelearning.github.io/webmcp/)
tools (`document.modelContext` — a proposed web standard incubated in the W3C Web
Machine Learning Community Group, currently a Chrome origin trial), so browser AI
agents can operate the app through structured tool calls instead of guessing at the DOM.

```
DETECT ──▶ INVENTORY ──▶ [HUMAN GATE: manifest approval] ──▶ INTEGRATE ──▶ VERIFY ──▶ HEAL ──▶ AUDIT
              ▲  loop            per-area batches on big apps    ▲  loop      ▲ loop    ▲ loop
              └── per area                                       └── per manifest entry ──┘
```

Everything you need ships inside this skill directory: phase guides in
`references/`, and vendorable code in `templates/` (runtime, ambient types,
JS variant, verification spec). Never assume files exist outside the skill dir.

**Out of scope** (stop and say so): backend-only MCP servers (that's classic MCP,
not WebMCP), automating third-party sites you don't control, and generic SEO work.

## Invocation modes

The user may pass an argument (`/webmcpify <mode>` or plain words):

| Argument | Run | Stop at |
|---|---|---|
| *(none)* or `full` | all phases, resuming from current manifest state | done |
| `inventory` / `map` | DETECT + INVENTORY loops only — **zero code changes** | present the manifest table for review |
| `integrate` | INTEGRATE loop only (requires approved tools in the manifest) | integrated + built |
| `verify` | VERIFY + HEAL loops on integrated/verified tools | green/skipped report |
| `status` | read `.webmcpify/manifest.json` — **read-only** | report phase, per-status tool counts, and the recommended next command |

Any other text is scoping guidance (e.g. "only the checkout area", "read-only tools only").

## Ground rules (non-negotiable, enforce in every phase)

1. **Zero unrelated changes.** Every diff hunk you produce must trace to a manifest
   entry or the recorded one-time setup. Never refactor, reformat, rename, or
   "improve" anything else — note problems in the report instead. Files that were
   already dirty at baseline (recorded in the manifest) are **untouchable**: never
   modify or revert them.
2. **Read-only tools first.** Tools that mutate state require explicit per-tool
   human approval recorded in the manifest. Never expose destructive, irreversible,
   or payment actions in a first integration.
3. **The server is the only trust boundary.** A tool's `execute()` may only call code
   paths the UI already uses (same endpoints, same validation, same auth). Never
   create new endpoints, never bypass existing checks, never put secrets in tools.
4. **Spec-shaped and dependency-free.** Register via `document.modelContext.registerTool()`
   with AbortSignal lifecycle (feature-detect the deprecated `navigator.modelContext`
   fallback). No third-party WebMCP runtime dependencies. Everything feature-detected:
   the app behaves identically in browsers without WebMCP.
5. **Never `toolautosubmit` on state-changing forms.** Only on pure read forms
   (search, filter, availability).
6. **State lives in files, not in your context.** Read/write `.webmcpify/` constantly;
   assume your context can be wiped between any two steps. Write the manifest
   atomically (write `manifest.json.tmp`, then rename over `manifest.json`).
7. **Commits are opt-in.** Never commit unless the human chose a commit policy at
   the gate (see below). Without git or without permission, leave changes in the
   working tree and record progress in the manifest only.

## Fresh, authoritative guidance

WebMCP is an evolving origin-trial API — the surface has already changed during the
trial (testing API removed 2026-07; `navigator` → `document`). Before Phase 2, if
network is available, pull Google's current official guides rather than relying on
memory:

```sh
npx -y modern-web-guidance@latest retrieve "webmcp,agentic-forms,agentic-javascript-tools"
```

If offline, use `references/integrate.md` — but prefer the live guides when they conflict.

## The state protocol — `.webmcpify/` in the target repo

| File | Purpose |
|---|---|
| `manifest.json` | Single source of truth (schema below; atomic writes) |
| `areas/<id>.tools.json` | Sub-agent shard output during inventory fan-out (merged, then deleted) |
| `report.md` | Human-facing running report; finalized at the end |

**Resume rule:** if `manifest.json` exists, resume — recompute nothing already
recorded; continue at `pipeline.phase`, the first `pending` area, or the first tool
whose status is not terminal. Terminal statuses: `verified`, `skipped`, `rejected`.

Manifest schema (Webmcpify Manifest v2):

```jsonc
{
  "webmcpify": 2,
  "app": { "stack": "react-vite", "typescript": true, "entry": "src/main.tsx",
           "baseUrl": "http://localhost:5173", "startCommand": "npm run dev" },
  "pipeline": {
    "phase": "inventory",          // detect|inventory|gate|integrate|verify|heal|audit|done
    "setup": { "runtimeVendored": false, "harnessInstalled": false, "originTrialNoted": false },
    "baselineSha": "abc1234",      // HEAD at pipeline start; null if no git
    "baselineDirty": ["src/wip.ts"], // paths dirty at start — untouchable (ground rule 1)
    "commitPolicy": null           // set at the gate: "commit-per-batch" | "no-commit"
  },
  "areas": [
    { "id": "checkout", "paths": ["src/features/checkout/"], "status": "pending" } // pending|inventoried
  ],
  "tools": [
    {
      "id": "create_ticket",
      "area": "tickets",
      "kind": "imperative",        // imperative | declarative
      "mutating": true,
      "priority": 1,               // 1 = expose first; 2/3 = later waves
      "description": "Creates a new ticket in the currently open project.",
      "inputSchema": { /* JSON Schema */ },
      "source": ["src/features/tickets/NewTicket.tsx:42"], // the UI code path it wraps
      "route": "/projects/demo/tickets",                    // where verify navigates
      "auth": "role:member",       // "none" | "session" | "role:<name>" — how verify signs in
      "examples": { "valid": { "title": "Test ticket" }, "invalid": {} },
      "expect": { "result": "created", "ui": "new row appears in the ticket list" },
      "cleanup": "delete the created ticket via the UI's own delete path (test data only)", // mutating tools
      "status": "discovered",      // discovered|approved|rejected*|integrated|verified|failed|skipped*  (* = terminal)
      "approval": null,            // mutating tools, once approved: { "note": "...", "at": "2026-07-12" }
      "attempts": 0,
      "batchCommit": null,         // sha when commitPolicy = commit-per-batch
      "notes": ""
    }
  ],
  "log": [ "2026-07-12 inventory: area checkout done, 4 candidates" ]
}
```

## Phase 0 — DETECT

Identify stack, build + dev-server commands, TypeScript or not, auth model, test
setup, and how the app starts locally; record under `app`. Record the git baseline:
`pipeline.baselineSha` = current HEAD and `pipeline.baselineDirty` = `git status
--porcelain` paths (both `null`/`[]` without git). If the app cannot be started
locally, record the blocker — integration may proceed, but verification will be
blocked and this must be surfaced at the gate. Details: `references/inventory.md`.

## Phase 1 — INVENTORY (loop; scales to any size)

**Never map a large codebase in one pass.**

1. **Area map first (cheap, structural):** enumerate routes/views/feature modules
   from the router config, pages directory, or navigation — without reading
   implementation files. Write every area to `areas` with `"pending"`.
2. **Inventory loop — one area per iteration:** deep-read only that area's files;
   draft a candidate tool per user action (conventions, tool-count budget, and
   overlap rules: `references/inventory.md`) with ALL manifest fields filled,
   including `route`, `auth`, `examples`, `expect`, and `cleanup` for mutating
   candidates — the verify phase runs from these fields alone. Append as
   `"discovered"`, mark the area `"inventoried"`, write the manifest, repeat.
   - **Sub-agent fan-out:** sub-agents never write `manifest.json`. Each writes only
     its own `areas/<id>.tools.json` shard; you (the coordinator) merge shards into
     the manifest sequentially, then delete them.
3. **Exit:** no `pending` areas remain, plus one completeness pass — walk the app's
   navigation and ask "is any visible user action missing?"

## GATE — manifest approval (the one main checkpoint)

Present the manifest compactly (id, area, kind, mutating, priority, one-line
description) — per-area batches on large apps. Ask the human to decide, in one
exchange where possible:

1. Which tools are `approved` vs `rejected` (**`rejected` is terminal** — rejected
   tools are excluded from every later phase and from exit conditions).
   Mutating tools need individual acknowledgment → record in `approval`.
2. **Commit policy**: `commit-per-batch` (each integration batch committed,
   revertable — recommended on a clean baseline) or `no-commit` (leave changes
   uncommitted for the human to review/commit). Also whether `.webmcpify/` itself
   should be committed (recommended: yes — it documents the integration).
3. Any blockers from DETECT (e.g. app won't start).

Apply `references/security.md` to every mutating tool **before** presenting.

## Phase 2 — INTEGRATE (loop)

One-time setup first (record in `pipeline.setup`): vendor the runtime from this
skill's `templates/` (`webmcpify.ts`, or `webmcpify.js` for non-TS projects, plus
`webmcp.d.ts` for TS — keep the license header; see `references/runtime.md`) and
note the origin-trial/flag requirement in the target README. Then loop:

1. Pick the next batch of `approved` tools — one area or ≤5 tools.
2. Implement per `references/integrate.md`: declarative attributes for standard
   HTML forms (including framework-rendered and fetch-intercepted ones);
   imperative registration via the vendored runtime for non-form or
   controlled-state actions.
3. Build + typecheck; fix only what the batch broke.
4. Mark tools `"integrated"`, write the manifest; under `commit-per-batch`, commit
   (`feat(webmcp): expose <ids> (webmcpify)`) and record `batchCommit`.
5. Repeat until no `approved` tools remain.

## Phase 3 — VERIFY (loop)

Set up once from `templates/webmcp.spec.ts` per `references/verify.md` (real headed
Chrome; production `getTools()`/`executeTool()` surface with legacy fallback probe).
Then loop over every `integrated` tool, using its manifest `route`, `auth`,
`examples`, and `expect` fields:

- assert the tool is registered with the expected schema (enumerated `inputSchema`
  is a *stringified* JSON Schema — parse before comparing);
- execute the valid example (mutating tools: dev/test data only, then run
  `cleanup`) and one invalid example;
- assert on the returned result **and** the resulting UI state per `expect`.

Pass → `"verified"`. Fail → `"failed"` + failure note. Role-scoped tools: verify
under each relevant role per the `auth` field.

## Phase 4 — HEAL (loop)

While any tool is `"failed"`: diagnose via `references/heal.md`, fix **only** that
tool's integration, increment `attempts`, re-verify. At 3 attempts → `"skipped"`
with a clear blocker note. Never widen the diff or fake a pass. After healing,
re-run verification once for **all** tools with status `integrated` or `verified`
(healing one tool can break another — scope collisions).

**Exit:** every tool is `verified`, `skipped`, or `rejected`; build green.

## Final — AUDIT + report

1. **Diff audit:** collect the pipeline's changes — `git diff <baselineSha>..HEAD`
   plus the working tree under `commit-per-batch`, or the working tree alone under
   `no-commit`. Every hunk must map to a manifest entry or recorded setup. An
   unrelated hunk in a file the pipeline touched → revert that hunk. A hunk in a
   `baselineDirty` file → **leave it alone** and flag it in the report. Without a
   `baselineSha`, audit only files named in manifest `source`/setup records.
2. Finalize `.webmcpify/report.md`: tool coverage per area, skipped/rejected tools
   with reasons, security notes (which mutating tools exist, what guards them),
   how to test manually (flag, DevTools WebMCP pane, inspector extension), and
   every blocker that needs a human.
3. Tell the human: what's exposed, what's skipped and why, and how to try it.

## References (read on demand, not upfront)

- `references/inventory.md` — area mapping, naming/schema conventions, budgets/overlap
- `references/integrate.md` — declarative + imperative patterns per stack
- `references/runtime.md` — vendoring + wiring the `templates/` runtime
- `references/verify.md` — harness setup: flags, surfaces, Playwright/Puppeteer, evals
- `references/heal.md` — failure taxonomy → fixes
- `references/security.md` — the security checklist (apply before the gate and at audit)
