/**
 * Ambient types for the WebMCP API — vendored from https://github.com/TueJon/webmcpify
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
 * registerTool/ontoolchange/annotations/getTools/executeTool follow the CG draft
 * (https://webmachinelearning.github.io/webmcp/). Chrome's origin-trial I/O shape
 * can lag that draft; keep the compatibility notes below dated and explicit.
 *
 * This is a GLOBAL script file — no imports (an import would turn it into a
 * module and un-globalize every interface). React JSX typings for the declarative
 * attributes live in the separate webmcp-jsx.d.ts template.
 */

interface ModelContextToolAnnotations {
  /** Developer tooling hint; never enforcement. */
  debugging?: boolean;
  readOnlyHint?: boolean;
  untrustedContentHint?: boolean;
  /** Significant real-world or non-reversible effect; a hint, never enforcement. */
  consequentialHint?: boolean;
}

type ModelContextToolResult =
  | string
  | number
  | boolean
  | Record<string, unknown>
  | unknown[];

/** Current CG callback options. Legacy Chrome 150 may omit the options argument. */
interface ToolExecuteCallbackOptions {
  signal: AbortSignal;
}

/** Fired after callback invocation; cancellation here does not undo started work. */
interface ToolActivatedEvent extends Event { readonly toolName: string; }
interface ToolCancelEvent extends Event { readonly toolName: string; }
interface ModelContextEventMap {
  toolchange: Event;
  toolactivated: ToolActivatedEvent;
  toolcancel: ToolCancelEvent;
}

interface ModelContext extends EventTarget {
  ontoolactivated: ((this: ModelContext, ev: ToolActivatedEvent) => unknown) | null;
  ontoolcancel: ((this: ModelContext, ev: ToolCancelEvent) => unknown) | null;
  addEventListener<K extends keyof ModelContextEventMap>(
    type: K, listener: (this: ModelContext, ev: ModelContextEventMap[K]) => unknown,
    options?: boolean | AddEventListenerOptions,
  ): void;
  addEventListener(type: string, listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions): void;
  removeEventListener<K extends keyof ModelContextEventMap>(
    type: K, listener: (this: ModelContext, ev: ModelContextEventMap[K]) => unknown,
    options?: boolean | EventListenerOptions,
  ): void;
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions): void;
  registerTool(
    tool: ModelContextTool,
    options?: { signal?: AbortSignal; exposedTo?: string[] },
  ): Promise<void>;
  ontoolchange: ((this: ModelContext, ev: Event) => unknown) | null;
  /**
   * Enumerates exposed tools from active documents in the same traversable,
   * including permitted ancestors and siblings (CG clarification, 2026-11-13).
   * Cross-origin policy, exposedTo and fromOrigins gates still apply. Intended
   * for in-page agents and test harnesses, not application logic.
   */
  getTools(options?: { fromOrigins?: string[] }): Promise<RegisteredTool[]>;
  /**
   * Agent/test execution surface in the CG draft. Current Chrome accepts an
   * object; scalar result serialization can differ from the draft (see dated
   * native compatibility evidence). Navigation null is retained for
   * Chrome/declarative compatibility even though the 2026-10-02 draft IDL lists
   * DOMString. Chrome 150's JSON-string input remains in the verification adapter.
   */
  executeTool?(
    tool: RegisteredTool,
    inputObject?: unknown,
    options?: { signal?: AbortSignal },
  ): Promise<string | null>;
  /** Internal simulation capability used by the vendored Workbench. */
  __webmcpStubObjectMode?: boolean;
}

interface ModelContextTool {
  /** [a-zA-Z0-9_.-]; spec allows up to 128 chars, Google recommends ≤30 */
  name: string;
  /** Optional display label */
  title?: string;
  /** Natural-language capability statement, ≤500 chars recommended */
  description: string;
  /** JSON Schema for the tool's input */
  inputSchema?: object;
  /** Optional expected output contract in the current CG draft; not runtime authorization/validation. */
  outputSchema?: object;
  /**
   * Current draft passes options with a required signal; second argument is optional
   * here to represent legacy Chrome 150. Forward options unchanged; registration
   * signals only control availability. Return JSON-safe results, never bare absence.
   * Native result representation is browser/version-dependent; preserve raw
   * results rather than assuming every scalar is JSON text (checked 2026-11-09).
   */
  execute(input: Record<string, unknown>, options?: ToolExecuteCallbackOptions): Promise<ModelContextToolResult>;
  annotations?: ModelContextToolAnnotations;
}

/**
 * Handle returned by getTools(). The CG Tool interface exposes read-only
 * prototype attributes and binds execution to one registration. Older Chrome
 * may return a plain dictionary with different metadata and lifetime semantics.
 * Pass the original handle directly to executeTool.
 */
interface RegisteredTool {
  readonly name: string;
  readonly title?: string;
  readonly description: string;
  readonly inputSchema?: string | object | null;
  readonly outputSchema?: string | object | null;
  readonly annotations?: ModelContextToolAnnotations | null;
  /**
   * Browser-serialized registering origin. Opaque origins in secure contexts
   * may serialize as "null". Equal strings do not prove equal opaque origins.
   */
  readonly origin: string;
  /** CG owner window. Null when the registering document is no longer active. */
  readonly source?: Window | null;
  /** Legacy Chrome owner window. Its proxy can follow a replacement document. */
  readonly window?: Window | null;
}

interface Document {
  readonly modelContext?: ModelContext;
}

interface Navigator {
  /** Deprecated Chrome 149 origin-trial surface; prefer document.modelContext. */
  readonly modelContext?: ModelContext;
}

/** Declarative form submissions: agent-invoked flag + result bridge. */
interface SubmitEvent {
  readonly agentInvoked?: boolean;
  respondWith?(result: Promise<unknown>): void;
}
