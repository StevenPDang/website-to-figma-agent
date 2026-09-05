# Website-to-Figma Agent Pipeline

This repository implements the local agent pipeline for converting a public website into an editable Figma scene.

## Quick start

```sh
npm install
npm run build
node apps/cli/dist/src/index.js import https://example.com --output .artifacts/example
```

Open the destination page in Figma Desktop and load the development plugin from
`apps/figma-plugin/dist/plugin/manifest.json` after running `npm run package:plugin`.
Paste the CLI's temporary connection JSON into the plugin to import editable
layers. The CLI saves source artifacts, image/SVG bytes, a reference screenshot,
node results, the Figma export, and a measured visual QA report.

See [getting started](docs/getting-started.md) for exact setup and recovery steps.
Use `--capture-only` to prepare artifacts without Figma. Partial imports and failed
QA return a nonzero exit status; see [limitations](docs/limitations.md).

The MVP accepts one public unauthenticated URL at a desktop viewport. Private hosts, credentials, page controls with external side effects, and unsupported effects are rejected or reported as partial results.

## Verification

```sh
npm test
npm run build
npm run typecheck
npm run lint
npm run format:check
npm run validate:schemas
npm run package:plugin
```
