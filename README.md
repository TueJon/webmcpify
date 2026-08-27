# webmcpify — the WebMCP agent skill

**Make any web app agent-ready — verifiably.**

🌐 **[webmcpify.at](https://webmcpify.at)** — the site itself is webmcpified: open it with a WebMCP-enabled agent and call its tools.

webmcpify is a WebMCP agent skill for **curated core coverage or route-by-route
parity**. It integrates [WebMCP](https://webmachinelearning.github.io/webmcp/)
(`document.modelContext` — a proposed web standard incubated in the W3C Web Machine
Learning Community Group, currently in Chrome origin trial) into an **existing**
web application — from a static landing page to a large multi-tenant SaaS — end to end:

```
DETECT ─▶ INVENTORY ─▶ [you approve the tool manifest] ─▶ INTEGRATE ─▶ VERIFY ─▶ HEAL ─▶ AUDIT
             loop                                            loop        loop     loop
```

Your coding agent investigates the codebase, asks whether you want a curated set of
high-value actions or an auditable per-route interaction census, then proposes a
**tool manifest** with names, schemas, examples, coverage reasons, and a read-only/
mutating classification. After your approval it integrates the tools, **exercises
each one in a real browser**, and heals failures—while keeping unrelated logic and
UI untouched.

## See native Chrome verification

**[Watch the uncut 63-second runtime demo](proof/artifacts/webmcpify-proof-480p.mp4)** —
a prepared local fixture passes a real approval click, registers one client-only
tool, then exercises native `document.modelContext.getTools()` / `executeTool()`
verification, a visible UI change, invalid-input handling, and cleanup.

The runtime registration and browser assertions are real. The phase labels are
advanced by a deterministic script for legibility; the recording does not execute
the skill's inventory, integration, or audit phases. The [`proof/`](proof/README.md)
pack includes the runnable fixture, prepared before/after example manifests, an
illustrative integration patch, and artifact checksums. Reproduce the native-browser
checks with `npm run proof:verify`.

## Why

Browser AI agents (Gemini in Chrome, extensions, assistive tech) are learning to
call structured page tools instead of scraping the DOM. WebMCP is the emerging
standard for that, co-authored by Google and Microsoft engineers, in origin trial
since Chrome 149. Making an app agent-ready by hand means reading a spec that is
still moving (the API surface changed twice during the trial), learning tool-design
conventions, and building a verification setup — webmcpify packages all of that
into one command for your coding agent.

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

**Manual**: copy [`skills/webmcpify/`](skills/webmcpify/) into your agent's skills
directory, or just tell your agent to follow
[`skills/webmcpify/SKILL.md`](skills/webmcpify/SKILL.md).

The skill directory is self-contained — pipeline, phase guides, vendorable runtime,
and the verification template all ship inside it.

## Use

Open your agent in the target repo and pick your scope:

```
/webmcpify                # full pipeline
/webmcpify inventory      # just investigate + propose the tool manifest (zero code changes)
/webmcpify integrate      # integrate the approved manifest
/webmcpify verify         # verify + heal what's integrated
/webmcpify status         # where are we? what's next?
/webmcpify full parity    # census every interactive element on every authenticated route
```

(or in plain words: *"webmcpify this app"*, *"map what tools this app could expose"*)

The pipeline has **one main checkpoint** — you approve the tool manifest (and, for
apps under git, choose whether integration batches are committed). Beyond that it
only comes back for things it genuinely can't resolve: an app that won't start, or
a tool that still fails after capped heal attempts. All state persists in
`.webmcpify/manifest.json`, so runs are **resumable** across sessions, context
windows, and even different agents.

## Built to scale to large codebases

Every phase is a **loop over persistent state**, not a one-shot pass:

- **Inventory** maps the codebase into areas (routes/views/modules) first, then
  deep-reads one area per iteration — a 500-file SaaS is processed area by area,
  never in one context-busting sweep. Sub-agent fan-out writes per-area shard
  files; a single coordinator merges them (no write races).
- **Coverage is explicit:** `curated` produces a reviewed route→tool map for core
  actions; `parity` produces a per-route element census where every interaction is
  mapped to a tool or a written reason. A tool count alone is never called 100%.
- **Tool budgets** keep curated SaaS toolsets usable: priority waves, an overlap rule
  (no two tools matching the same request), and role/tenant coverage tracking.
  Parity uses route-scoped registration and reports client-capacity gaps instead of
  claiming an unmeasured universal per-page limit.
- **Integrate** works in small batches (one area or ≤5 tools), each independently
  built and typechecked — committed per batch only if you opted in.
- **Verify/Heal** iterate per tool with attempt caps and honest escalation
  instead of infinite loops; mutating tools get cleanup steps between retries.
- Interrupt at any point; the next run resumes from the manifest.

## Guarantees

- **Unrelated logic and UI stay untouched** — every diff hunk traces to a manifest
  entry; a final audit against the recorded baseline commit enforces it, and files
  that were already dirty when the run started are never modified or reverted.
- **Read-only first** — server mutations require your explicit per-tool approval.
  Auth, signup, billing, payment and credential-returning tools stay excluded;
  irreversible delete actions can only open the app's existing confirmation UI.
- **Server stays the trust boundary** — tools only call code paths your UI already
  uses; no new endpoints, no bypasses.
- **Spec-shaped, zero dependencies** — a small MIT runtime is vendored into your
  repo (no npm dependency), everything feature-detected: your app is
  **behaviorally unchanged** in browsers without WebMCP.
- **No ambiguous imperative results** — the runtime guards accidental bare
  `null`/`undefined`, and route-changing tools return a structured result before
  deferring navigation and route-scope disposal.
- **Exercised, not assumed** — every tool is enumerated and executed in real
  Chrome, asserting on both the tool result and the resulting UI state, from
  examples recorded in the manifest. That includes mutating declarative forms,
  where Chrome pauses the execution until a real submit interaction — the
  harness performs that submit click mid-execution instead of faking the pass.
- **Spec over scoreboard** — WebMCP checkers and inspector extensions grade pages
  against a mix of spec features, conventions, and invented checks. webmcpify
  classifies their findings instead of chasing them: it never emits
  non-existent attributes or adds markup an app doesn't need to raise a score.
  Optional off-page discovery (a `/.well-known/webmcp` manifest, `rel="webmcp"`
  links) is a separately approved layer, because it publishes tool metadata
  publicly — never part of a default integration.

## What's in this repo

| Path | Purpose |
|---|---|
| [`skills/webmcpify/SKILL.md`](skills/webmcpify/SKILL.md) | The pipeline (what your agent follows) |
| [`skills/webmcpify/references/`](skills/webmcpify/references/) | Phase guides: inventory, integrate, runtime, verify, heal, security, discovery |
| [`skills/webmcpify/templates/`](skills/webmcpify/templates/) | Vendorable runtime (TS + JS), ambient types, Playwright verification template, discovery manifest |

## Status

WebMCP itself is an **origin trial** (Chrome 149 →; the stable milestone is an
estimate, not a commitment): production exposure needs an
[origin-trial token](https://developer.chrome.com/origintrials/), local development
needs `chrome://flags/#enable-webmcp-testing`. The API surface has already changed
during the trial (testing API removed 2026-07; `navigator` → `document`) — webmcpify
isolates that churn in one vendored file, probes for the current
enumeration/execution surface, and treats Google's live
[modern-web-guidance](https://github.com/GoogleChrome/modern-web-guidance) as the
source of current best practices at integration time.

Release-by-release spec adaptations are recorded in the [changelog](CHANGELOG.md).
ChatGPT's separate, model/account-gated client surface is documented as
[Site tools](skills/webmcpify/references/client.md), with dated availability facts
and a troubleshooting order.

## Related projects

- [webmcpify.at](https://webmcpify.at) — project website (itself agent-ready, in all three layers: imperative tools via the vendored runtime, a declarative install form, and a published `/.well-known/webmcp` manifest)
- [webmachinelearning/webmcp](https://github.com/webmachinelearning/webmcp) — the spec draft (W3C WebML CG)
- [GoogleChromeLabs/webmcp-tools](https://github.com/GoogleChromeLabs/webmcp-tools) — Google's demos, types, and evals CLI (webmcpify follows these patterns)
- [GoogleChrome/modern-web-guidance](https://github.com/GoogleChrome/modern-web-guidance) — official best-practice guides (webmcpify pulls its WebMCP guides live)
- [Puppeteer WebMCP](https://pptr.dev/guides/webmcp) — first-class WebMCP automation API (alternative verify harness)
- [MCP-B / WebMCP-org](https://github.com/WebMCP-org/npm-packages) — WebMCP ecosystem: polyfill, extension, transports, and dev tooling (webmcpify vendors a minimal runtime instead of adding dependencies)

## License

[MIT](LICENSE) — © Jonas Tüchler
