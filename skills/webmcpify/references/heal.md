# Heal — failure taxonomy → fixes

Work one failed tool at a time. Re-verify after each fix. Three failed attempts →
mark `skipped` with a blocker note (this is an explicit escalation to the human in
the final report, not a silent drop) and move on. **Never** widen the diff, disable
a check, or fake a return value to force a pass. **Mutating tools:** run the
manifest `cleanup` between attempts — retrying a mutation without cleanup
duplicates data.

## Taxonomy

| Symptom | Likely cause | Fix |
|---|---|---|
| Tool absent from enumeration | Registration never ran (bootstrap not reached, view not mounted) or wrong Chrome build/flags | Trace the registration call; confirm `isWebMCPAvailable()` in the test env; current Chrome + `--enable-features=WebMCP,WebMCPTesting` |
| Whole scope absent | A registration in the batch rejected (duplicate name, invalid schema, policy) — the runtime rolls back the entire scope | Check console for the `onError` report; fix the offending tool contract |
| Tool absent after route change | Scope disposed by navigation (over-scoping) | Move to static app-level registration unless genuinely view-bound |
| Declarative tool missing | `toolname` typo, frame without `allow="tools"`, or page sends `Origin-Agent-Cluster: ?0` | Fix attribute; check Permissions-Policy `tools` and origin-keying headers |
| Schema mismatch (declarative) | Control lacks `name`, description not resolvable, unsupported control type in this build | Add `name`/`toolparamdescription`/`label[for]`; unsupported controls → switch that form to imperative |
| Schema mismatch (imperative) | Manifest and code drifted | Make code match the approved manifest; if the manifest was wrong, update it and flag the change in the report |
| Assertion compares object to string | Enumerated `inputSchema` is a stringified JSON Schema | `JSON.parse` before comparing (see `verify.md`) |
| `executeTool` returns `null` unexpectedly | The execution navigated (normal for submit-navigating declarative forms) | Assert on the post-navigation page instead of the return value |
| `executeTool` rejects | Schema violation or declarative-validation failure — rejection IS the failure signal for these | For invalid-input tests on declarative tools, assert rejection, not an `"ERROR:"` string |
| Execution times out / canned success while UI still loading | Completion event fired before the async work finished, or listener missing/wrong event name | Fire `tool-completion-<requestId>` with `{ ok, message/error }` AFTER awaiting the real work (`runtime.md` contract) |
| Returns success but UI unchanged | `execute()` bypassed the real UI path (parallel implementation) | Rewrite to call the same handler/store action/endpoint the UI uses |
| Invalid input resolves successfully (imperative) | Missing in-code validation | Validate strictly in code; return `"ERROR: <what/how to fix>"` |
| Fetch-submitted form: agent gets nothing | `preventDefault()` without `respondWith()` | Add the `e.agentInvoked → e.respondWith(promise)` bridge |
| Works manually, fails in Playwright | Headless, missing flags, or profile without the flag | Headed + flags; persistent context; `xvfb-run` in CI |
| 401/403 from `execute()` in test | Tool registered outside the authenticated scope, or test session lacks the role in the manifest `auth` field | Role-scope the registration; sign in with the recorded fixture |
| Flaky: passes alone, fails in suite | Shared state between tool executions | Isolate test data per tool run (use `cleanup`); don't reorder tests to hide it |

## After healing

Re-run verification once for **all** tools with status `integrated` or `verified`
(not only the healed ones) — healing one tool can unregister or break another;
scope collisions are the classic case. Only then evaluate the exit condition.
