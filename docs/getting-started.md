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

The CLI captures one page at 1440×900, including its full document height, then
prints a connection JSON object. Paste that object into the plugin and choose
**Connect and import into this page**. This explicitly selects the open document
and page. Keep the plugin open until the CLI finishes. The connection token is
short-lived; do not share it or save it in source control.

The development plugin uses the valid development URL `http://localhost:3847` for
the WebSocket loopback on port 3847. If another run is using it, finish
that run first. The CLI waits up to 120 seconds for connection and import. Use
`--plugin-timeout 300` for a longer wait (maximum 540 seconds). Reopen the plugin
for a new CLI run. Up to three temporary WebSocket disconnects reconnect to the
same plugin instance; an interrupted run is never automatically replayed into a
new plugin instance. Existing layers from an interrupted run remain available.

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
