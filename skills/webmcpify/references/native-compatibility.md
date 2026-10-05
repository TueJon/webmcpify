# Native compatibility — checked 2026-10-05

WebMCP is evolving. These are separate evidence levels; simulation results are
not native browser acceptance.

## Current primary documentation

The [CG draft](https://webmachinelearning.github.io/webmcp/) specifies callback
options containing an execution signal, optional input defaulting to `{}`, and
JSON serialization of successful imperative results. A callback returning `"done"`
therefore produces the JSON string text `"done"` at `executeTool`, including the
quotes; a callback object produces serialized JSON. Callback values and native
client results are different boundaries. Browser-owned `null` for declarative
navigation is separate from the runtime guard against absent imperative results.

The [Chrome imperative guide](https://developer.chrome.com/docs/ai/webmcp/imperative-api)
(updated 2026-09-21) documents execution cancellation via callback `{ signal }`,
Chrome 153 preserving in-flight executions when tools are unregistered, Chrome 155
deprecating JSON-string input in favor of object input, and the `debugging`
annotation from Chrome 156. These version claims are documentation, not proof
from the installed Chrome 150 run.

The [Chrome declarative guide](https://developer.chrome.com/docs/ai/webmcp/declarative-api)
(updated 2026-09-25) documents `agentInvoked` and `respondWith` after
`preventDefault()`. Activation/cancellation events target `document.modelContext`;
window event handlers are unsupported from Chrome 156. Declarative submission and
navigation are not covered by imperative simulation.

## Accepted native evidence: Chrome 150

Governor report: `/tmp/webmcpify-native-browser-governor-report.md`, run
2026-10-05T05:31:43.012Z, Chrome 150.0.7871.186, headed with WebMCP and
WebMCPTesting, temporary synthetic loopback fixture only:

| Probe | Observed result |
|---|---|
| Callback options | Second argument absent; no execution signal received. |
| Caller abort | Caller rejected with AbortError; delayed side effect still ran. |
| Registration abort during execution | Tool disappeared; caller rejected with UnknownError; callback continued and side effect ran. |
| Omitted execute input | TypeError requiring two arguments; callback was not invoked. |

These observations do not establish modern cancellation, omitted-input defaults,
or current-draft result serialization in Chrome 150. Use the existing side-effect-free
input capability probe to select object versus legacy JSON-string input; never
retry a real application tool to discover compatibility.

## Accepted native evidence: Chrome Beta 156

Governor evidence: `/tmp/webmcpify-beta-governor-evidence.json`, run
2026-10-05T05:38:51.840Z, Chrome Beta 156.0.8078.4, headless with WebMCP and
WebMCPTesting, temporary synthetic loopback fixture only. All five probes pass:

| Probe | Observed result |
|---|---|
| Input shape | Object input invoked the callback exactly once. |
| Callback options | Second argument contained an AbortSignal. |
| Caller abort | Started callback received the signal; caller rejected with AbortError; cooperative handler suppressed the delayed side effect. |
| Registration abort during execution | Tool disappeared; already-started callback completed, side effect ran, and caller fulfilled. |
| Omitted execute input | Callback invoked once with `{}`. |

Successful imperative results arrived as serialized JSON strings: the callback
object `{ accepted: true }` produced the string `{"accepted":true}`. `unregisterTool`
was absent; removal was tested only through the registration AbortSignal, not a
distinct unregister operation. These five probes do not establish native WPT,
declarative submission/navigation, or debugging-annotation conformance.

## Local runtime and verification boundaries

Forward `options?.signal` unchanged through wrappers to the fourth argument:

```ts
execute: singleFlight((input, options?: ToolExecuteCallbackOptions) =>
  dispatchAndWait('webmcp:save', input, 10000, options?.signal)),
```

The bridge handles preabort without dispatch, cooperative cancellation and cleanup.
Handlers must pass the dispatched signal to asynchronous work and check it before
committing state. Cancellation/timeout leaves an unknown outcome when handlers or
servers continue; inspect state before a manual retry. Registration disposal removes
availability and is not an execution-cancellation mechanism.

`tests/parity.test.mjs` compares JS and transpiled TS client runtime behavior;
`tests/workbench.test.mjs` tests imperative simulation (default input, serialized
returns and execution/registration separation). `tests/workbench-browser.mjs` tests
the Workbench UI using simulation, not native API conformance. Mutation-journal
checks in `tests/manifest-lock.test.mjs` cover host-side durable dispatch/settlement,
locking and interrupted entries; neither journaling nor cancellation guarantees
exactly-once effects. No continuation-token support is implemented here.
