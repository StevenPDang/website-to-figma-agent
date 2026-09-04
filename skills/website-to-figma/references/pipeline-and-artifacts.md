# Pipeline and Artifact Contracts

Use a run directory such as `artifacts/website-to-figma/<run-id>/`. Each persisted JSON artifact must include `schemaVersion`, `runId`, `sourceUrl`, `capturedAt`, and the capture viewport.

## Required Artifacts

### `raw-capture.json`

Browser observations only: DOM identity and hierarchy, computed styles, document-relative geometry, clipping, stacking, text runs, asset references, and visibility. Include pseudo-elements and open shadow roots where accessible. Record inaccessible frames and canvases as limitations.

### `website-ir.json`

Normalized, browser-independent facts. Resolve equivalent colors, lengths, text runs, assets, and coordinate spaces without adding Figma behavior. Every node retains its raw-capture source identifier.

### `inference.json`

Decisions about sections, layout modes, sizing, components, variants, and design tokens. Every decision includes evidence, confidence, and fallback behavior. Do not mix inferred values into raw observations.

### `figma-scene.json`

Figma-specific creation instructions derived from the Website IR and inference annotations. Include stable scene node identifiers, source identifiers, fonts, assets, layout properties, constraints, component relationships, and deterministic child order.

### `import-result.json`

Plugin response containing created Figma node identifiers, warnings, failures, substitutions, counts, and the scene identifiers affected by each result.

### `qa-report.json`

Reference and Figma-render dimensions, comparison metrics, discrepancy regions, unsupported effects, and pass/partial/fail status.

## Capture Modes

- `single`: one page and one specified viewport; default viewport is 1440px wide.
- `responsive`: explicitly requested viewport set, commonly 1440, 768, and 390px.
- `interactive`: one viewport plus explicitly safe interaction states.
- `full`: responsive and interactive capture.

Modes change capture breadth, not artifact boundaries.

## Transport

The CLI is the authoritative run coordinator. It opens a versioned localhost session with the plugin, sends a complete validated scene or bounded chunks, and waits for acknowledgements. Messages carry `protocolVersion`, `runId`, and stable operation identifiers so retries are idempotent. The plugin must reject incompatible schema versions before mutating the document.
