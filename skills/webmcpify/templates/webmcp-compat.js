/**
 * webmcpify compat helpers — vendored from https://github.com/TueJon/webmcpify
 *
 * MIT License
 * Copyright (c) 2026 Jonas Tüchler
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software — keep this header when
 * copying this file into your project.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 * Full text: https://github.com/TueJon/webmcpify/blob/main/LICENSE
 *
 * Shared string/object compat helpers for the native-vs-stub I/O divergence.
 * Used by templates/webmcp.spec.ts (inlined inside page.evaluate for the
 * browser-boundary parts) and tests/compat.test.mjs — single source of truth.
 * Collapse the string branch when Chrome aligns with the spec (#278/#279).
 */

export function parseInputSchema(raw) {
  return typeof raw === 'string' ? JSON.parse(raw) : raw ?? { type: 'object', properties: {} };
}

/**
 * Stub tools carry .execute and take the object; native RegisteredTools never
 * have .execute. Native mc.executeTool always takes a JSON string (even when
 * wrapped or with omitted inputSchema) — no transport retry, so a handler
 * TypeError never double-executes.
 */
export function isStubTool(tool) {
  return typeof tool?.execute === 'function';
}

export function normalizeResult(r) {
  return r == null ? null : typeof r === 'string' ? r : JSON.stringify(r);
}
