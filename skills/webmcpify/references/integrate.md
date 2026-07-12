# Integrate — patterns per stack

> Prefer the live official guides when online:
> `npx -y modern-web-guidance@latest retrieve "webmcp,agentic-forms,agentic-javascript-tools"`.
> The patterns below follow Google's reference implementations
> (GoogleChromeLabs/webmcp-tools) and the W3C spec draft.

## Declarative — plain HTML forms (static sites, SSGs, server-rendered pages)

Annotate the existing form. Do not restructure it.

```html
<form toolname="request_quote"
      tooldescription="Requests a project quote. A team member replies within one business day."
      action="/contact" method="post">
  <label for="email">Email</label>
  <input type="email" id="email" name="email" required
         toolparamdescription="Email address for the reply">
  <!-- …existing fields, each with label[for] + name + toolparamdescription… -->
  <button type="submit">Request quote</button>
</form>
```

Rules:
- Browser derives the JSON Schema from the controls — so every control needs
  `name`, a resolvable description (`toolparamdescription` → `label[for]` text →
  `aria-description`), and correct HTML constraints (`required`, `type`, `min`…).
  Radio groups: put `toolparamdescription` on the enclosing `<fieldset>`.
- `toolautosubmit` **only** on pure read forms (search/filter/availability).
  Never on contact/checkout/settings/messaging forms.
- If the form is fetch-submitted (`preventDefault()`), you MUST route the result
  back to the agent — the most common integration bug is a swallowed submit:

```js
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const result = doSubmit(new FormData(e.target))
    .then(() => 'Request received. Reply within one business day.');
  if (e.agentInvoked) e.respondWith(result);
});
```

- Optional UX (verbatim from Chrome docs): style agent activity with
  `form:tool-form-active` / `:tool-submit-active` CSS pseudo-classes.
- Forms that navigate to a thank-you page: best-effort JSON-LD
  `{"@type":"Message","text":"…"}` as the first script block of the target page
  (mechanism still under spec debate — never make product behavior depend on it).

## Imperative — SPAs and dynamic apps

Use the vendored runtime (`runtime.md`). Tools live in a dedicated module per app
(e.g. `src/webmcp/tools.ts`), decoupled from components:

```ts
import { createToolScope, dispatchAndWait } from './webmcpify';

export const searchTicketsTool = {
  name: 'search_tickets',
  description: 'Searches tickets in the currently open project and shows results on screen.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search terms, exactly as the user phrased them.' },
    },
    required: ['query'],
  },
  annotations: { readOnlyHint: true, untrustedContentHint: true },
  async execute(input) {
    const q = String(input.query ?? '').trim();
    if (!q) return 'ERROR: `query` must be a non-empty string.';
    return dispatchAndWait('webmcp:search_tickets', { query: q },
      'Search started. Results are now visible on the page.');
  },
};
```

Key rules:
- **`execute()` wraps the existing UI code path** — dispatch the same event / call
  the same store action / hit the same API the button does. Never a parallel
  implementation.
- **Return only after the interface state is settled** (agents plan from what's on
  screen) — that's what `dispatchAndWait` is for: the component signals completion
  after its state update.
- Return short strings; errors as `"ERROR: <what and how to fix>"` so the model can
  self-correct. Cap outputs ~1.5k chars.
- Validate strictly in code, loosely in schema.

### Registration & lifecycle

- **Static registration is the default**: register app-wide tools once at bootstrap.
- **Per-view registration only** for tools meaningless outside their view — via
  `createToolScope` in the view's mount/unmount (React `useEffect` cleanup, Vue
  `onUnmounted`, Angular `DestroyRef`). Over-scoping makes the toolset flicker and
  strands agents mid-plan.
- React StrictMode double-mount is handled by the runtime's scope registry.

### Auth / roles (SaaS)

Never register a tool the current session couldn't use through the UI. On
login/logout/role change/tenant switch: abort the whole scope and re-register the
correct set. The server still re-checks everything (ground rule 3) — role-scoped
registration is UX hygiene, not security.

## Origin trial / flags note

WebMCP is an origin trial (Chrome 149→). For production exposure the origin needs a
token: `<meta http-equiv="origin-trial" content="TOKEN">` or an `Origin-Trial`
response header — registration at the Chrome Origin Trials console. For local work,
`chrome://flags/#enable-webmcp-testing`. Chrome silently ignores expired tokens, so
nothing may depend on WebMCP being present (ground rule 4). Add a short note about
this to the target repo's README as part of the runtime install.
