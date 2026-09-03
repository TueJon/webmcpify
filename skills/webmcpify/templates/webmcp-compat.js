/**
 * Shared compat helpers — vendored with webmcpify.
 * Used by templates/webmcp.spec.ts and tests/compat.test.mjs — single source of truth.
 * Collapse string branch when Chrome aligns with spec (#278/#279).
 */

export function parseInputSchema(raw) {
  return typeof raw === 'string' ? JSON.parse(raw) : raw ?? { type: 'object', properties: {} };
}

export function isNativeInputSchema(tool) {
  return typeof tool?.inputSchema === 'string';
}

export function normalizeResult(r) {
  return r == null || typeof r === 'string' ? r : JSON.stringify(r);
}
