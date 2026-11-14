# ChatGPT client reality — Site tools

Checked 2026-11-09 against the official OpenAI documentation:
<https://learn.chatgpt.com/docs/webmcp>. Re-check that page before publishing or
relying on model/workspace availability; this UI is moving independently of the
WebMCP draft and Chrome implementation.

## What is documented

- ChatGPT calls WebMCP integrations **Site tools**. In the desktop app's built-in
  browser, open **Site tools** in the address bar and then **Available site tools**
  to inspect the page's registrations. This is the fastest client-side ground
  truth for the currently open page.
- Site tools require a supported model and access through the account or managed
  workspace's browser policy. Browser settings and site permissions still apply.
  The current page does not list model names or a workspace exclusion matrix;
  removing the old matrix is not proof of access in a particular account.
- The official guide documents JavaScript registration and HTML form tools in
  the top-level page and same-origin/cross-origin iframes. Each frame must have a
  secure context; access is checked for the tool provider's origin.
- The guide permits omitting `exposedTo` for agent discovery. This is distinct
  from in-page cross-origin `getTools`/`executeTool` access: preserve embedder
  `tools` delegation, provider `exposedTo`, consumer `fromOrigins`, and the
  explicit approval boundary in `security.md`.
- Tools belong to the page that registered them. Closing or navigating away can
  make them unavailable; a client that tears down the page between turns cannot
  call that old registration.
- Each invocation in the built-in browser receives a safety review. Normal access
  and confirmation policies still apply. Website tool definitions and results
  remain untrusted. No account/browser integration was tested for this update.

Date every public summary and link the official page. Do not publish model names
from memory.

## Dated observations, not promises

One session on 2026-08-26/27 observed plain Chat handing Site-tools work to Work
mode and collapsing the browser pane, while a Work workspace offered Site tools.
Those observations are account/UI-specific and do not override the official
availability statement. Verify them in the exact account before troubleshooting a
customer report or publishing a claim.

## Troubleshooting order

1. In the built-in browser, keep the page open and inspect **Site tools → Available
   site tools**.
2. Confirm the desktop app is current and the selected model supports Site tools;
   check current official guidance rather than a historical model list.
3. Check account/workspace access and browser/site permissions, including
   **Settings → Browser → Permissions → Enable site tools**. Fallback ordinary
   browser interaction alone does not diagnose a broken integration.
4. Inspect the actual owning document's JavaScript registration or form metadata,
   frame secure context, provider-origin access and document lifetime.
5. For the website itself, confirm a secure context and live registration. Use the
   headed-Chrome harness in `verify.md` for developer proof; ChatGPT availability
   and Chrome harness success are separate checks.
