# Inventory — mapping a codebase into a tool manifest

## Detect (Phase 0 details)

Establish, in this order:

1. **Stack**: look at `package.json` (deps: react/vue/@angular/next/astro/eleventy…),
   or absence of one (static HTML). Record as `app.stack`.
2. **Start command + base URL**: `dev`/`start` scripts, framework defaults
   (`vite` → 5173, `next` → 3000, static → any file server). The verify phase needs
   a working local run — if the app can't be started, record that as a blocker and
   ask the human before proceeding past integration.
3. **Auth model**: none / session / role-based. Role-based apps need role-scoped
   registration (see `integrate.md` §Auth) and their mutating tools deserve extra
   scrutiny at the gate.
4. **TypeScript?** Determines whether to vendor the runtime as `.ts` or `.js`.

## Building the area map

The area map is the unit of loop iteration. Sources, in order of preference:

- **Router config** (React Router routes, Next `app/`/`pages/` dirs, Vue Router,
  Angular routes) — each top-level route = one area.
- **Navigation UI** (header/sidebar links) for static sites and SSGs.
- **Feature folders** (`src/features/*`, `src/modules/*`) when routing is flat.

Keep areas coarse: 5–30 areas for a big SaaS, 1–3 for a landing page. An area
should be deep-readable in one loop iteration without flooding context. Split an
area that turns out too big; merge trivial ones.

## What counts as a candidate tool

Walk each area's UI code and list **user actions**, not functions:

| UI pattern | Candidate tool | `mutating` |
|---|---|---|
| Search/filter form or input | `search_<noun>` | false |
| Data list/detail currently rendered | `list_<noun>` / `get_<noun>` | false |
| Create/edit form with submit → API call | `create_<noun>` / `update_<noun>` | true |
| Button triggering a state change | `<verb>_<noun>` | true |
| Multi-step flow (wizard, checkout) | `start_<noun>_flow` (initiation only) | false* |
| Contact/booking form (static sites) | declarative form annotation | true |

*Initiation tools only navigate/open the flow — the human completes it. That is the
correct way to expose complex mutations without automating them.

**Skip** (do not inventory): login/logout/auth flows, payment execution, account
deletion, user management, anything irreversible, file uploads (v1), and pure
navigation that agents can do anyway.

## Naming and schema conventions (Google's, condensed)

- **Verb-first, execution vs initiation honest**: `create_event` acts immediately;
  `start_event_creation_process` merely opens a form. The name must never lie.
- Name ≤30 chars, `[a-zA-Z0-9_.-]`; prefix with the app name if tools may coexist
  with other origins' tools in testing (`myapp_search_tickets`).
- Description ≤500 chars, positive capability statement ("Searches the catalog…"),
  no marketing. Param descriptions ≤150 chars.
- **Raw user input rule**: schemas accept what the user would say ("11:00 to 15:00"),
  never ask the agent to compute or transform. Use semantic enum values
  (`"High"`, not `priority_id: 3`).
- Read-only tools get `annotations: { readOnlyHint: true }`; tools returning
  user-generated or external content get `untrustedContentHint: true`.

## Writing manifest entries

For every candidate record: `id`, `area`, `kind` (`declarative` for plain HTML forms
that exist in the markup; `imperative` for anything driven by JS state), `mutating`,
`description`, `inputSchema`, `source` (file:line of the UI handler/form — this is
what the integrate phase wraps), `status: "discovered"`.

The completeness pass at the end of Phase 1: start the app (or read the rendered
nav), enumerate what a user can *do* per screen, and diff against the manifest.
