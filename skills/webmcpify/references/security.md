# Security checklist

Apply at two points: **before the manifest gate** (classify + flag) and **at the
final diff audit** (verify). Any unchecked box on a mutating tool blocks it.

## Threat model in one paragraph

Any Chrome extension with host permissions — and any agent the user runs — can
enumerate and execute your tools **with the user's live session**. The spec has no
agent-identity mechanism. Page-visible strings (descriptions, labels, enum values,
tool outputs) all enter the model's context, so they are prompt-injection surface in
both directions. Design every tool as if it were a public, authenticated API endpoint
— because effectively it is one.

## Checklist

**Trust boundary**
- [ ] Every `execute()` calls only code paths the UI already uses — same endpoints,
      same validation, same authz, same rate limits. No new endpoints, no bypasses.
- [ ] No secrets, tokens, or privileged config inside tool code or descriptions.
- [ ] Role-based apps: tools registered per role/session and re-scoped on auth
      changes; nothing registered the current session couldn't do via the UI.

**Human-in-the-loop**
- [ ] No `toolautosubmit` on any state-changing form.
- [ ] No destructive/irreversible/payment tools at all in a first integration.
      If the human explicitly insists later: in-page manual confirmation PLUS a
      server-side two-step (confirm token), never a client-side check alone.
- [ ] Initiation tools (`start_*_flow`) genuinely only navigate/open — they must not
      pre-execute any part of the mutation.

**Honesty & hints**
- [ ] Description says exactly what `execute()` does — no more, no less (agents make
      consent decisions from it).
- [ ] `readOnlyHint: true` ONLY on genuinely pure reads (agents skip confirmation
      based on it; mislabeling is the worst single mistake).
- [ ] `untrustedContentHint: true` on every tool returning user-generated or
      external content.
- [ ] Outputs capped (~1.5k chars) and free of instruction-like content where
      possible.

**Privacy**
- [ ] Schemas request no more personal data than the equivalent visible form —
      agents auto-fill anything you declare (over-parameterization = silent
      profiling vector).

**Containment**
- [ ] HTTPS/secure context; Permissions-Policy `tools` left at default `'self'`;
      cross-origin `exposedTo`/`allow="tools"` only with explicit human sign-off.
- [ ] Pages that must never expose tools (un-audited checkout, admin consoles you
      didn't inventory) can send `Permissions-Policy: tools=()` — suggest it in the
      report where relevant.
- [ ] No third-party WebMCP runtime added to the project; test-only APIs
      (`navigator.modelContextTesting`) appear nowhere in shipped code.
