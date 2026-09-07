# Import a website into Figma

## Setup

```sh
npm install
npm run build
npm run package:plugin
```

Use Figma Desktop. Open the destination design document and page. From the Figma
menu choose **Plugins → Development → Import plugin from manifest**, then select
`apps/figma-plugin/dist/plugin/manifest.json` from this repository. Run **Website to
Figma Importer** from the Development menu. The plugin displays its destination.

## Import

```sh
node apps/cli/dist/src/index.js import https://skanvi.com/
```

The CLI first prints a connection JSON object and waits. Paste that object into the plugin and choose
**Connect and import into this page**. This explicitly selects the open document
and page. After connection, capture starts at 1440×900, including the full document height.
Keep the plugin open until the CLI finishes. The connection token is
short-lived; do not share it or save it in source control.

Deterministic inference remains the guarded default until final agentic release
approval. To run the local Codex pipeline:

```sh
codex login
node apps/cli/dist/src/index.js import https://skanvi.com/ --inference agentic
```

Agentic mode runs deterministic inference first, invokes the provider-neutral
adapter, and renders at most three candidates. The local Codex adapter runs an
ephemeral read-only session with bounded structured evidence and the reference and
latest candidate PNG. Its approved controls are:

```text
--provider local-codex
--max-renders 1..3
--provider-timeout 1..540
--max-provider-output-bytes 1024..10000000
```

Defaults are three renders, 120 seconds per provider call, and a 2,000,000-byte
provider output limit.

The development plugin uses the valid development URL `http://localhost:3847` for
the WebSocket loopback on port 3847. If another run is using it, finish
that run first. The CLI waits up to 120 seconds for connection and import. Use
`--plugin-timeout 300` for a longer wait (maximum 540 seconds). Rebuild and reload
the development plugin after pulling protocol changes. Protocol 1.2 rejects older
plugins with rebuild/reload guidance. Reopen the plugin for each new CLI run. Up to
three temporary disconnects reconnect to the same plugin instance. An interruption
preserves the latest complete candidate and never modifies pre-existing layers.

Exit codes: **0** means import and visual QA passed; **2** means partial import,
unsupported/substituted content, failed QA, or capture-only; **1** means a fatal
pipeline error. Review diagnostics even when a frame appears visually plausible.

## Artifacts and quality

Each run writes to a unique `.artifacts/<run-id>/` directory (or `--output <dir>`):

- `raw-capture.json`, `website-ir.json`, `inference.json`, `figma-scene.json`
- `assets/<sha256>` containing image/SVG bytes and `reference.png`
- `import-result.json` with node IDs and source-linked diagnostics
- `figma.png` when export succeeds
- `qa-report.json` with decoded pixel measurements
- `deterministic-inference.json` for the immutable agentic fallback baseline
- `correction-history.json` with requests, decisions, diagnostics, metrics, usage,
  selected revision, and stop reason
- `candidate-<revision>-*.json` and PNGs for completed candidate passes

QA requires SSIM ≥0.95 **and** changed pixels ≤5%, at a per-channel tolerance of 16. It uses 8×8 luminance SSIM windows and composites transparent pixels on white.
Dimension mismatch fails. A report marked `QA_NOT_RUN` contains explicitly labeled
placeholder metrics, not measurements. An absent plugin never produces success.

For artifact preparation without Figma:

```sh
node apps/cli/dist/src/index.js import https://skanvi.com/ --capture-only
```

This intentionally returns exit code 2. Its JSON scene is an intermediate artifact,
not a file that Figma opens directly. Run the live command when the destination is
ready. Avoid reusing an output directory because that can mix old exports with a
new run.

Agentic capture-only mode invokes the provider and writes enriched inference
without contacting Figma:

```sh
node apps/cli/dist/src/index.js import https://skanvi.com/ --capture-only --inference agentic
```

If Codex is missing, unauthenticated, times out, exceeds its output budget, or
returns invalid decisions, the report records a structured diagnostic and retains
the valid deterministic fallback. If a later candidate fails, the plugin keeps the
last complete candidate and the report points to `correction-history.json`.

## Verification and limitations

See [limitations](limitations.md) and [manual smoke test](smoke-test.md).
Automated tests exercise the packaged controller without dynamic code generation,
the packaged UI in Chrome, authenticated transport and retries, and the CLI's PNG
QA. The integration peer returns a known image to verify QA wiring; it is not a
substitute for checking Figma's real renderer.

Implementation references: [Figma plugin manifest](https://developers.figma.com/docs/plugins/manifest/),
[font loading](https://developers.figma.com/docs/plugins/api/properties/figma-loadfontasync/),
[PNG export](https://developers.figma.com/docs/plugins/api/properties/nodes-exportasync/),
[pngjs](https://github.com/pngjs/pngjs), and [esbuild](https://esbuild.github.io/api/#bundle).
