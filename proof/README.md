# WebMCPify proof pack

This is a sanitized, deterministic run against a local release-notes fixture. It
contains no customer data and performs no network mutation. The single candidate,
`set_release_filter`, wraps the same browser-local filter path used by the visible
buttons.

## Reproduce the verification

Requirements: Node 20+, dependencies from `npm ci`, Google Chrome 150+ (earlier
releases do not expose the native `document.modelContext` surface and the run
fails its first assertion), `xvfb-run`, and (for the derivative) ffmpeg. Chrome
is located through Playwright's `chrome` channel; set `CHROME_BIN` to point at a
specific binary. On a desktop session you can skip Xvfb and run
`node proof/demo/run.mjs --verify` directly.

```sh
npm ci
npm run proof:verify
```

The command starts a loopback-only static server, opens system Google Chrome
headed under Xvfb with `--enable-features=WebMCP,WebMCPTesting`, proves that no
tool exists before approval/integration, triggers the bounded integration, then:

1. enumerates `set_release_filter` through native `document.modelContext.getTools()`;
2. parses and compares its stringified schema and checks `readOnlyHint: false`;
3. executes `{ "category": "fix" }` through native `executeTool()`;
4. checks the result string and the visible UI delta; and
5. confirms an invalid enum resolves the runtime's bounded `ERROR:` convention
   without changing UI state.

## Reproduce the 63-second uncut recording

```sh
npm run proof:record
ffmpeg -y -i proof/artifacts/webmcpify-proof-source.webm \
  -vf scale=854:-2 -c:v libx264 -preset slow -crf 28 -movflags +faststart \
  -an proof/artifacts/webmcpify-proof-480p.mp4
sha256sum proof/artifacts/webmcpify-proof-source.webm \
  proof/artifacts/webmcpify-proof-480p.mp4 > proof/artifacts/SHA256SUMS
```

The recording is one continuous browser capture. The phase labels and log lines
are advanced by `proof/demo/run.mjs`; the gate is a real click, integration is a
real registration through the vendored runtime, and verification uses Chrome's
native production enumeration/execution surface. Pauses are intentional so the
workflow is legible at normal playback speed.

## Sanitized before/after evidence

- [`manifest.before.json`](manifest.before.json) is the inventory result at the
  human gate. The client mutation is still `discovered` and no setup exists.
- [`manifest.after.json`](manifest.after.json) records approval, two bounded setup
  paths, and successful native-Chrome verification.
- [`integration.patch`](integration.patch) is the complete conceptual app diff:
  one module script plus one tool module; no server endpoint or unrelated UI path.

The manifests contain only fixture paths, loopback URLs, and synthetic release
notes. Video output is reproducible but binary-identical hashes can vary with the
installed Chrome/ffmpeg builds; the checked-in `SHA256SUMS` identifies the review
artifacts in this revision.
