/**
 * Ambient types for the WebMCP API — vendored from https://github.com/TueJon/webmcpify
 *
 * MIT License · Copyright (c) 2026 Jonas Tüchler · keep this header when copying.
 * Full text: https://github.com/TueJon/webmcpify/blob/main/LICENSE
 *
 * Follows the W3C Web Machine Learning CG draft (https://webmachinelearning.github.io/webmcp/)
 * and Chrome's origin-trial surface as of 2026-07. This API is in flux — re-check
 * against the draft and https://developer.chrome.com/docs/ai/webmcp when updating.
 */

interface ModelContext extends EventTarget {
  registerTool(
    tool: ModelContextTool,
    options?: { signal?: AbortSignal; exposedTo?: string[] },
  ): Promise<void>;
  ontoolchange: ((this: ModelContext, ev: Event) => unknown) | null;
  /**
   * Enumeration/execution surface (Chrome; replaced the removed
   * navigator.modelContextTesting in 2026-07). For agents and test harnesses —
   * never for application logic.
   */
  getTools?(): Promise<RegisteredTool[]>;
  executeTool?(tool: RegisteredTool, inputJson: string): Promise<string | null>;
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
  /** Only `input` is passed — there is no client/session argument in the IDL. */
  execute(input: Record<string, unknown>): unknown | Promise<unknown>;
  annotations?: {
    readOnlyHint?: boolean;
    untrustedContentHint?: boolean;
  };
}

/** Shape returned by getTools(): NOTE inputSchema is a STRINGIFIED JSON Schema. */
interface RegisteredTool {
  name: string;
  description?: string;
  inputSchema?: string;
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
