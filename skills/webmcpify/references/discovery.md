# Discovery — publishing the tool surface off-page

WebMCP tools only exist once the page runs. Crawlers, directories, and browser
extensions want to know *before* navigating, so an ecosystem of pre-visit
discovery conventions has grown around the spec. This layer is **optional,
non-normative, and public** — treat it as a separate deliverable, never as part
of a default integration.

## What is standardized and what is not

| Surface | Status | Source |
|---|---|---|
| `document.modelContext` / `navigator.modelContext` (imperative) | **Spec** (W3C WebML CG draft, Chrome origin trial) | [webmcp explainer](https://webmachinelearning.github.io/webmcp/) |
| `toolname`, `tooldescription`, `toolparamdescription`, `toolautosubmit` on `<form>` (declarative) | **Spec** (declarative API explainer, Chrome docs) | [declarative-api-explainer](https://github.com/webmachinelearning/webmcp/blob/main/declarative-api-explainer.md) |
| `toolactivated` / `toolcancel` events, `:tool-form-active` / `:tool-submit-active` | **Spec** | Chrome declarative API docs |
| `/.well-known/webmcp` manifest | **Not specified.** Chrome discussed pre-visit discovery; nothing shipped. De-facto convention pushed by third-party checkers/registries | community |
| `<link rel="webmcp">`, `Link: </.well-known/webmcp>; rel="webmcp"` | **Not specified** (RFC 8288 is, the `webmcp` relation is not registered) | community |
| `llms.txt`, `AGENTS.md`, robots.txt AI-bot rules | Conventions, widely read | community |

Never invent attributes to satisfy a checker (see *Third-party audits* below).

## Rule 1 — the manifest is a mirror, never a source

The runtime registration is authoritative. The manifest repeats a subset of it
for crawlers. If they can drift, they will:

- Generate the manifest from the approved `.webmcpify/manifest.json` entries,
  not by hand.
- Add a test that fails when the published names/schemas no longer match what
  the app registers (page attributes + runtime tool table). Every integration
  that ships a manifest ships this test.
- Regenerate it in the same commit as any tool contract change.

## Rule 2 — publishing metadata is a disclosure decision

A `.well-known` file is world-readable forever and gets crawled, cached, and
indexed. Before writing one, get explicit human approval and then list **only**:

- tools reachable **without authentication** on a **public** route;
- names, descriptions, and input schemas that are already visible to any visitor
  who opens DevTools on that page.

Never list: tools behind login, role-scoped or admin tools, internal hostnames,
API paths that aren't already public, staging URLs, or any description that
reveals unreleased functionality. When a tool set is auth-gated, publish the
manifest with the public subset and say so in the `$comment`/`description` —
don't publish an empty file and don't publish the gated ones "for completeness".

## Rule 3 — shape

Start from `templates/well-known-webmcp.json`. The fields checkers actually read
are `name`, `description`, `version`, `tools[].name`, `tools[].description`;
`inputSchema` per tool is what makes it useful to an agent.

- Serve at `/.well-known/webmcp` with `Content-Type: application/json`, HTTP 200,
  no redirect (checkers treat a 301/302 as a miss).
- Keep the repo file as `webmcp.json` (correct MIME everywhere, obvious in a
  diff) and map the extensionless path in the server config, e.g. nginx:

  ```nginx
  location = /.well-known/webmcp {
      alias /srv/app/.well-known/webmcp.json;
      default_type application/json;
      add_header Access-Control-Allow-Origin "*" always;
  }
  ```

  Public discovery documents are fetched cross-origin — `Access-Control-Allow-Origin: *`
  is appropriate here **because the file is public by construction**; never copy
  that header onto app routes.
- Advertise it once per page: `<link rel="webmcp" href="/.well-known/webmcp" type="application/json">`
  and, where response headers are cheap to set, `Link: </.well-known/webmcp>; rel="webmcp"`.
  In nginx, an `add_header` inside a `location` **suppresses** server-level ones —
  repeat the security headers (HSTS, CSP) in any location where you add `Link`,
  and re-verify them afterwards.
- Mention the manifest in `llms.txt` if the site has one.

## Third-party audits — score the spec, not the scoreboard

Extensions and web checkers grade pages against a mixed list of spec features,
conventions, and things they made up. Seen in the wild (a 15-point audit
extension, 2026-08):

- `window.ai` / built-in-AI presence — a **browser** capability. No site can
  provide it. Never "fix" this.
- `toolaction` attribute — **does not exist** in any WebMCP draft or Chrome doc.
  Emitting it adds dead markup and teaches the codebase a fiction.
- `/.well-known/webmcp` — real convention, unspecified. Worth serving (this
  guide), not worth restructuring an app for.
- Declarative attributes on pages that have no `<form>` — the honest fix is a
  real form the app actually needs, or nothing. **Never add a form, or fake
  markup, to raise a score.**

During HEAL, only failures from *our* verification harness count as failures. A
third-party audit finding is input for the report, not a defect to chase — quote
it, classify it (spec / convention / invented), and let the human decide.
