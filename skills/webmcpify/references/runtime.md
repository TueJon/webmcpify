# Runtime — vendoring and wiring the templates

Copy from this skill's `templates/` directory into the target project
(suggested: `src/webmcp/`):

- TypeScript projects: `templates/webmcpify.ts` + `templates/webmcp.d.ts`
- JavaScript projects: `templates/webmcpify.js`

**Vendor, don't depend** — the runtime is ~150 lines, MIT, and a target repo must
not gain a dependency for an origin-trial API. **Keep the license header** in the
copied files (it carries the MIT copyright + permission notice the license requires).
Record the copy in the manifest (`pipeline.setup.runtimeVendored: true`).

What it provides:

| Export | Purpose |
|---|---|
| `getModelContext()` | The ONLY place `document.modelContext` / deprecated `navigator.modelContext` is referenced — spec churn stays a one-file fix |
| `isWebMCPAvailable()` | Feature detection — the app must work identically without WebMCP |
| `createToolScope(key, tools, options?)` | Registers a tool set under one AbortController; returns dispose. Validates contracts BEFORE registering; awaits registrations and **rolls back the whole scope** on any rejection (reported via `options.onError`, default `console.error`). An already-active key returns a no-op disposer — safe under React StrictMode |
| `dispatchAndWait(event, detail?, timeoutMs?)` | Bridges `execute()` to the app's own event/state flow; resolves only after the component confirms the real outcome (payload below). Timeouts and failures resolve to `"ERROR: ..."` strings (self-correction convention, no unhandled rejections) |

Validation note: budget checks auto-enable when a bundler defines
`NODE_ENV !== 'production'`; unbundled projects pass `{ validate: true }` during
development.

## The completion contract (the part integrators get wrong)

`dispatchAndWait` resolves when the component fires `tool-completion-<requestId>`
with `detail: { ok: boolean, message?: string, error?: string }`. Fire it **after
the async work has truly finished** — awaited fetch, committed state, rendered
result — never right after *starting* the action. Agents plan from what is on
screen; a completion fired early produces false greens.

```tsx
// component side (React example — adapt per framework):
useEffect(() => {
  const onSearch = async (e: Event) => {
    const { query, requestId } = (e as CustomEvent).detail;
    try {
      const results = await runSearch(query);          // the existing code path, awaited
      window.dispatchEvent(new CustomEvent(`tool-completion-${requestId}`, {
        detail: { ok: true, message: `Search finished — ${results.length} results are now visible.` },
      }));
    } catch (err) {
      window.dispatchEvent(new CustomEvent(`tool-completion-${requestId}`, {
        detail: { ok: false, error: err instanceof Error ? err.message : 'Search failed.' },
      }));
    }
  };
  window.addEventListener('webmcp:search_tickets', onSearch);
  return () => window.removeEventListener('webmcp:search_tickets', onSearch);
}, []);
```

If the framework batches rendering after the await (React 18 does), the state is
committed by the time the event fires; when in doubt, dispatch the completion from
an effect that observes the updated state.

## Wiring patterns

```tsx
// bootstrap (app-wide tools, static registration — the default):
import { createToolScope } from './webmcp/webmcpify';
import { appTools } from './webmcp/tools';
createToolScope('app', appTools);

// per-view tools (only when genuinely view-bound):
useEffect(() => createToolScope('tickets-view', ticketViewTools), []);
// createToolScope returns the dispose fn → React runs it on unmount.
```

Role-scoped SaaS registration — dispose and re-create on auth changes:

```ts
let dispose: (() => void) | undefined;
export function syncToolsForUser(user: User | null) {
  dispose?.();
  const tools = [...publicTools, ...(user ? memberTools : []),
                 ...(user?.role === 'admin' ? adminTools : [])];
  dispose = createToolScope('auth-scoped', tools);
}
// call on login, logout, role change, tenant switch
```
