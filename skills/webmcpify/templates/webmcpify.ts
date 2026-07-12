/**
 * webmcpify runtime — vendored from https://github.com/TueJon/webmcpify
 *
 * MIT License · Copyright (c) 2026 Jonas Tüchler
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software, to deal in the Software without restriction. THE SOFTWARE IS
 * PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND. Full text:
 * https://github.com/TueJon/webmcpify/blob/main/LICENSE — keep this header when
 * copying this file into your project.
 *
 * Spec-shaped helper around the WebMCP API (document.modelContext, W3C Web Machine
 * Learning CG draft / Chrome origin trial). Vendor this file; do not add it as a
 * dependency. Everything is feature-detected: in browsers without WebMCP every
 * function is a safe no-op and the app behaves identically.
 */

export interface ToolScopeOptions {
  exposedTo?: string[];
  /**
   * Contract validation (name/description budgets). Default: enabled when a
   * bundler defines NODE_ENV !== 'production'; unbundled projects should pass
   * `validate: true` during development.
   */
  validate?: boolean;
  /** Called if any registration in the scope fails (the scope is rolled back). */
  onError?: (error: unknown) => void;
}

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
 *
 * - AbortSignal is the spec's only unregistration mechanism — dispose aborts it.
 * - Validation runs BEFORE any registration, so a bad contract never leaves a
 *   half-registered scope.
 * - Registration rejections (duplicate names, invalid schemas, policy failures)
 *   roll back the entire scope and are reported via `onError` (default:
 *   console.error) instead of becoming unhandled rejections.
 * - Calling with a key that is already active returns a no-op disposer and leaves
 *   the existing scope untouched (safe under React StrictMode double-mount).
 */
export function createToolScope(
  key: string,
  tools: ModelContextTool[],
  options?: ToolScopeOptions,
): () => void {
  const mc = getModelContext();
  if (!mc) return () => {};
  if (scopes.has(key)) return () => {};

  if (shouldValidate(options)) for (const tool of tools) validateTool(tool);

  const controller = new AbortController();
  scopes.set(key, controller);
  const registerOptions: { signal: AbortSignal; exposedTo?: string[] } = {
    signal: controller.signal,
  };
  if (options?.exposedTo) registerOptions.exposedTo = options.exposedTo;

  Promise.all(tools.map((tool) => mc.registerTool(tool, registerOptions))).catch((error) => {
    if (scopes.get(key) === controller) {
      controller.abort();
      scopes.delete(key);
    }
    const report =
      options?.onError ??
      ((e: unknown) => console.error(`webmcpify: registration failed for scope "${key}"`, e));
    report(error);
  });

  return () => {
    if (scopes.get(key) === controller) {
      controller.abort();
      scopes.delete(key);
    }
  };
}

/**
 * Bridge execute() to the app's own event/state flow. Resolves only after the
 * component confirms the outcome by dispatching `tool-completion-<requestId>` with
 * `detail: { ok: boolean, message?: string, error?: string }` — and it must do so
 * AFTER the async work truly finished (awaited fetch/state commit/render), because
 * agents plan from what is on screen.
 *
 * Failures resolve (not reject) to an "ERROR: ..." string so the model can
 * self-correct without unhandled rejections inside execute().
 */
export function dispatchAndWait(
  eventName: string,
  detail: Record<string, unknown> = {},
  timeoutMs = 10000,
): Promise<string> {
  return new Promise((resolve) => {
    const requestId = Math.random().toString(36).slice(2, 12);
    const completionEvent = `tool-completion-${requestId}`;
    const cleanup = () => {
      clearTimeout(timer);
      window.removeEventListener(completionEvent, onDone as EventListener);
    };
    const timer = setTimeout(() => {
      cleanup();
      resolve(
        'ERROR: The interface did not confirm this action in time. It may still be processing — check the current page state before retrying.',
      );
    }, timeoutMs);
    const onDone = (event: Event) => {
      cleanup();
      const result = (event as CustomEvent<{ ok?: boolean; message?: string; error?: string }>)
        .detail ?? {};
      if (result.ok === false) {
        resolve(`ERROR: ${result.error ?? 'The action failed.'}`);
      } else {
        resolve(result.message ?? 'Action completed successfully.');
      }
    };
    window.addEventListener(completionEvent, onDone as EventListener);
    window.dispatchEvent(new CustomEvent(eventName, { detail: { ...detail, requestId } }));
  });
}

function shouldValidate(options?: ToolScopeOptions): boolean {
  if (options?.validate !== undefined) return options.validate;
  // Portable dev detection without Node ambient types; false when unbundled.
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env;
  return env !== undefined && env.NODE_ENV !== 'production';
}

/** Contract-quality checks (Google's recommended budgets). */
function validateTool(tool: ModelContextTool): void {
  const problems: string[] = [];
  if (!/^[a-zA-Z0-9_.-]{1,30}$/.test(tool.name)) {
    problems.push(`name "${tool.name}" should be 1-30 chars of [a-zA-Z0-9_.-]`);
  }
  if (!tool.description) problems.push(`tool "${tool.name}" is missing a description`);
  else if (tool.description.length > 500) {
    problems.push(`tool "${tool.name}" description exceeds 500 chars`);
  }
  if (problems.length) throw new Error(`webmcpify: ${problems.join('; ')}`);
}
