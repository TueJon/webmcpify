/**
 * Ambient types for the W3C WebMCP API (origin trial), following the shape used by
 * Google's reference demos (GoogleChromeLabs/webmcp-tools) and the spec draft at
 * https://webmachinelearning.github.io/webmcp/. Vendored by webmcpify (MIT).
 */

interface ModelContext {
  registerTool(
    tool: ModelContextTool,
    options?: { signal?: AbortSignal; exposedTo?: string[] },
  ): Promise<void>;
}

interface ModelContextTool {
  /** 1–30 chars recommended (spec allows 128), [a-zA-Z0-9_.-] */
  name: string;
  /** Optional display label */
  title?: string;
  /** Natural-language capability statement, ≤500 chars recommended */
  description: string;
  /** JSON Schema for the tool's input */
  inputSchema?: object;
  execute(
    input: Record<string, unknown>,
    client: ModelContextClient,
  ): unknown | Promise<unknown>;
  annotations?: {
    readOnlyHint?: boolean;
    untrustedContentHint?: boolean;
  };
}

interface ModelContextClient {
  /** Not in the published IDL — feature-detect; UX convenience, never security. */
  requestUserInteraction?(callback: () => void): void;
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
  respondWith?(result: Promise<unknown> | unknown): void;
}
