/**
 * webmcpify runtime — vendored from https://github.com/tue-Jonas/webmcpify (MIT).
 * Spec-pure helper around the W3C WebMCP API (document.modelContext).
 * Vendor this file into your project; do not add it as a dependency.
 *
 * The API is an origin-trial feature and everything here is feature-detected:
 * in browsers without WebMCP every function is a safe no-op.
 */

/** The ONLY place the raw API is referenced — spec churn is a one-file fix. */
export function getModelContext(): ModelContext | undefined {
  if (typeof document !== 'undefined' && document.modelContext) return document.modelContext;
  // Deprecated surface used by the Chrome 149 origin trial; remove when obsolete.
  if (typeof navigator !== 'undefined' && navigator.modelContext) return navigator.modelContext;
  return undefined;
}

export function isWebMCPAvailable(): boolean {
  return getModelContext() !== undefined;
}

const scopes = new Map<string, AbortController>();

/**
 * Register a set of tools under one scope key. Returns a dispose function.
 * Idempotent per key (safe under React StrictMode double-mount).
 * AbortSignal is the spec's only unregistration mechanism — never look for an
 * unregisterTool().
 */
export function createToolScope(
  key: string,
  tools: ModelContextTool[],
  options?: { exposedTo?: string[] },
): () => void {
  const mc = getModelContext();
  if (!mc || scopes.has(key)) return () => disposeScope(key);
  const controller = new AbortController();
  scopes.set(key, controller);
  for (const tool of tools) {
    validateTool(tool);
    void mc.registerTool(tool, { signal: controller.signal, ...options });
  }
  return () => disposeScope(key);
}

function disposeScope(key: string): void {
  scopes.get(key)?.abort();
  scopes.delete(key);
}

/**
 * Bridge execute() to the app's own event/state flow, resolving only after the UI
 * signals completion — agents plan from interface state, so a tool must not return
 * before the interface reflects its effect.
 *
 * The listening component performs its normal state update, then fires
 * `tool-completion-<requestId>` (after the update settles, e.g. via queueMicrotask).
 */
export function dispatchAndWait(
  eventName: string,
  detail: Record<string, unknown> = {},
  successMessage = 'Action completed successfully.',
  timeoutMs = 5000,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const requestId = Math.random().toString(36).slice(2, 12);
    const completionEvent = `tool-completion-${requestId}`;
    const timer = setTimeout(() => {
      window.removeEventListener(completionEvent, onDone);
      reject(new Error(`Timed out waiting for the UI to update (${eventName}).`));
    }, timeoutMs);
    const onDone = () => {
      clearTimeout(timer);
      window.removeEventListener(completionEvent, onDone);
      resolve(successMessage);
    };
    window.addEventListener(completionEvent, onDone);
    window.dispatchEvent(new CustomEvent(eventName, { detail: { ...detail, requestId } }));
  });
}

/** Contract-quality checks, thrown only outside production builds. */
function validateTool(tool: ModelContextTool): void {
  const dev =
    typeof process !== 'undefined' && process.env && process.env.NODE_ENV !== 'production';
  if (!dev) return;
  const problems: string[] = [];
  if (!/^[a-zA-Z0-9_.-]{1,30}$/.test(tool.name)) {
    problems.push(`name "${tool.name}" must be 1-30 chars of [a-zA-Z0-9_.-]`);
  }
  if (!tool.description) problems.push(`tool "${tool.name}" is missing a description`);
  else if (tool.description.length > 500) {
    problems.push(`tool "${tool.name}" description exceeds 500 chars`);
  }
  if (problems.length) throw new Error(`webmcpify: ${problems.join('; ')}`);
}
