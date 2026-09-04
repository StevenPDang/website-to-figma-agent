# Website-to-Figma Agent Pipeline

This repository implements the local agent pipeline for converting a public website into an editable Figma scene.

## Quick start

```sh
npm install
npm run build
node apps/cli/dist/src/index.js import https://example.com --output .artifacts/example
```

The CLI persists `raw-capture.json`, `website-ir.json`, `inference.json`, and `figma-scene.json` in the output directory. The Figma plugin adapter consumes the validated scene through the authenticated localhost transport.

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
