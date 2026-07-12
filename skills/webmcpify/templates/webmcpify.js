/**
 * webmcpify runtime (JavaScript variant) — vendored from https://github.com/TueJon/webmcpify
 *
 * MIT License · Copyright (c) 2026 Jonas Tüchler
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software, to deal in the Software without restriction. THE SOFTWARE IS
 * PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND. Full text:
 * https://github.com/TueJon/webmcpify/blob/main/LICENSE — keep this header when
 * copying this file into your project.
 *
 * Spec-shaped helper around the WebMCP API (document.modelContext). Vendor this
 * file; do not add it as a dependency. Everything is feature-detected: in browsers
 * without WebMCP every function is a safe no-op.
 */

/** The ONLY place the raw API is referenced — spec churn is a one-file fix. */
export function getModelContext() {
  if (typeof document !== 'undefined' && document.modelContext) return document.modelContext;
  // Deprecated surface used by the Chrome 149 origin trial; remove when obsolete.
  if (typeof navigator !== 'undefined' && navigator.modelContext) return navigator.modelContext;
  return undefined;
}

export function isWebMCPAvailable() {
  return getModelContext() !== undefined;
}

const scopes = new Map();

/**
 * Register a set of tools under one scope key. Returns a dispose function.
 * Validation runs before any registration; registration rejections roll back the
 * whole scope and are reported via options.onError (default: console.error).
 * Calling with an already-active key returns a no-op disposer.
 *
 * @param {string} key
 * @param {Array<object>} tools
 * @param {{ exposedTo?: string[], validate?: boolean, onError?: (e: unknown) => void }} [options]
 * @returns {() => void}
 */
export function createToolScope(key, tools, options) {
  const mc = getModelContext();
  if (!mc) return () => {};
  if (scopes.has(key)) return () => {};

  if (shouldValidate(options)) for (const tool of tools) validateTool(tool);

  const controller = new AbortController();
  scopes.set(key, controller);
  const registerOptions = { signal: controller.signal };
  if (options && options.exposedTo) registerOptions.exposedTo = options.exposedTo;

  Promise.all(tools.map((tool) => mc.registerTool(tool, registerOptions))).catch((error) => {
    if (scopes.get(key) === controller) {
      controller.abort();
      scopes.delete(key);
    }
    const report =
      (options && options.onError) ||
      ((e) => console.error(`webmcpify: registration failed for scope "${key}"`, e));
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
 * component dispatches `tool-completion-<requestId>` with
 * `detail: { ok, message?, error? }` — fired AFTER the async work truly finished.
 * Failures resolve to an "ERROR: ..." string (self-correction convention).
 *
 * @param {string} eventName
 * @param {object} [detail]
 * @param {number} [timeoutMs]
 * @returns {Promise<string>}
 */
export function dispatchAndWait(eventName, detail = {}, timeoutMs = 10000) {
  return new Promise((resolve) => {
    const requestId = Math.random().toString(36).slice(2, 12);
    const completionEvent = `tool-completion-${requestId}`;
    const cleanup = () => {
      clearTimeout(timer);
      window.removeEventListener(completionEvent, onDone);
    };
    const timer = setTimeout(() => {
      cleanup();
      resolve(
        'ERROR: The interface did not confirm this action in time. It may still be processing — check the current page state before retrying.',
      );
    }, timeoutMs);
    const onDone = (event) => {
      cleanup();
      const result = (event && event.detail) || {};
      if (result.ok === false) {
        resolve(`ERROR: ${result.error || 'The action failed.'}`);
      } else {
        resolve(result.message || 'Action completed successfully.');
      }
    };
    window.addEventListener(completionEvent, onDone);
    window.dispatchEvent(new CustomEvent(eventName, { detail: { ...detail, requestId } }));
  });
}

function shouldValidate(options) {
  if (options && options.validate !== undefined) return options.validate;
  const env = globalThis.process && globalThis.process.env;
  return env !== undefined && env.NODE_ENV !== 'production';
}

/** Contract-quality checks (Google's recommended budgets). */
function validateTool(tool) {
  const problems = [];
  if (!/^[a-zA-Z0-9_.-]{1,30}$/.test(tool.name)) {
    problems.push(`name "${tool.name}" should be 1-30 chars of [a-zA-Z0-9_.-]`);
  }
  if (!tool.description) problems.push(`tool "${tool.name}" is missing a description`);
  else if (tool.description.length > 500) {
    problems.push(`tool "${tool.name}" description exceeds 500 chars`);
  }
  if (problems.length) throw new Error(`webmcpify: ${problems.join('; ')}`);
}
