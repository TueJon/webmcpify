# Heal — failure taxonomy → fixes

Work one failed tool at a time. Re-verify after each fix. Three failed attempts →
mark `skipped` with a blocker note and move on. **Never** widen the diff, disable a
check, or fake a return value to force a pass.

## Taxonomy

| Symptom | Likely cause | Fix |
|---|---|---|
| Tool absent from `listTools()` | Registration never ran (bootstrap not reached, view not mounted, scope key collision) or flag/Chrome version wrong | Trace the registration call; check `isWebMCPAvailable()` actually true in the test env; verify flags and Chrome ≥150 |
| Tool absent after route change | Scope disposed by navigation (over-scoping) | Move the tool to static app-level registration unless it is genuinely view-bound |
| Declarative tool missing | `toolname` typo, form inside a frame without `allow="tools"`, or page sends `Origin-Agent-Cluster: ?0` | Fix attribute; check Permissions-Policy `tools` and origin-keying headers |
| Schema mismatch (declarative) | Control lacks `name`, description not resolvable, unsupported control type in this Chrome build | Add `name`/`toolparamdescription`/`label[for]`; for unsupported controls switch that form to an imperative tool |
| Schema mismatch (imperative) | Manifest and code drifted | Make code match the approved manifest (not vice versa); if the manifest was wrong, update it and note the change for the human |
| `executeTool` hangs / times out | `dispatchAndWait` completion event never fired (listener missing, wrong event name, requestId not threaded) | Wire the component listener; fire completion after state settles (`queueMicrotask` after the update) |
| Returns success but UI unchanged | `execute()` bypassed the real UI path (parallel implementation) | Rewrite to call the same handler/store action/endpoint the UI uses |
| Invalid input returns success | Missing in-code validation | Validate strictly in code; return `"ERROR: <what/how to fix>"` |
| Fetch-submitted form: agent gets nothing | `preventDefault()` without `respondWith()` | Add the `e.agentInvoked → e.respondWith(promise)` bridge |
| Works manually, fails in Playwright | Headless, missing flags, or profile without the origin trial | Headed + `--enable-features=WebMCP,DevToolsWebMCPSupport`; persistent context |
| 401/403 from `execute()` in test | Tool registered outside the authenticated scope, or test session lacks the role | Role-scope the registration; use a test account with the right role |
| Flaky: passes alone, fails in suite | Shared state between tool executions | Isolate test data per tool run; don't "fix" by reordering tests |

## After healing

Re-run the **full** verify loop once at the end (not just the healed tools) — healing
one tool can unregister another (scope collisions are the classic case).
