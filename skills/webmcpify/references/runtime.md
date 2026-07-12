# Runtime — the module you vendor into the target repo

Copy `runtime/webmcpify.ts` (or `.js` for non-TS projects) from this skill's repo
into the target project (suggested: `src/webmcp/webmcpify.ts`), plus
`runtime/webmcp.d.ts` for TypeScript ambient types. **Vendor, don't depend** — the
file is ~90 lines, MIT, and the target repo must not gain a runtime dependency for
an origin-trial API. Adjust the header comment to note the source + version.

What it provides (and why each exists):

| Export | Purpose |
|---|---|
| `getModelContext()` | The ONLY place `document.modelContext` / deprecated `navigator.modelContext` is referenced — spec churn is a one-file fix |
| `isWebMCPAvailable()` | Feature detection — the app must work identically without WebMCP |
| `createToolScope(key, tools)` | Registers a set of tools under one AbortController; returns dispose. Idempotent per key (StrictMode-safe). AbortSignal is the only unregistration mechanism in the spec |
| `dispatchAndWait(event, detail, successMessage, timeoutMs)` | Bridges `execute()` to the app's own event/state flow and resolves only after the UI signals completion — Google's UI-settled pattern |
| Dev-mode budget validation | Throws in dev on name >30 chars / bad chars, description >500, missing description — catching contract-quality bugs at registration time |

Wiring pattern (React example — adapt per framework):

```tsx
// bootstrap (app-wide tools, static registration — the default):
import { createToolScope } from './webmcp/webmcpify';
import { appTools } from './webmcp/tools';
createToolScope('app', appTools);

// per-view tools (only when genuinely view-bound):
useEffect(() => createToolScope('tickets-view', ticketViewTools), []);
// createToolScope returns the dispose fn → React runs it on unmount. Do not wrap it.

// component side of dispatchAndWait:
useEffect(() => {
  const onSearch = (e: Event) => {
    const { query, requestId } = (e as CustomEvent).detail;
    runSearch(query); // the existing state update
    queueMicrotask(() =>
      window.dispatchEvent(new CustomEvent(`tool-completion-${requestId}`)));
  };
  window.addEventListener('webmcp:search_tickets', onSearch);
  return () => window.removeEventListener('webmcp:search_tickets', onSearch);
}, []);
```

For role-scoped SaaS registration, dispose and re-create scopes on auth changes:

```ts
let dispose: (() => void) | undefined;
export function syncToolsForUser(user: User | null) {
  dispose?.();
  const tools = [...publicTools, ...(user ? memberTools : []),
                 ...(user?.role === 'admin' ? adminTools : [])];
  dispose = createToolScope('auth-scoped', tools);
}
```
