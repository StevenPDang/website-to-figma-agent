# Quality Gates

Evaluate each captured viewport independently.

## Required Measurements

- Import completeness: percentage of eligible visible source elements represented or explicitly classified as unsupported.
- Structural integrity: unresolved parent, instance, component, asset, and font references.
- Visual comparison: image dimensions, changed-pixel ratio, perceptual similarity score, and discrepancy regions.
- Editability: rasterized text count, flattened-container count, inferred Auto Layout count, and geometry-fallback count.
- Diagnostics: warnings, substitutions, unsupported effects, and failed nodes linked to source identifiers.

Thresholds belong to run configuration and the project specification, not hard-coded skill instructions. A run passes only when it meets configured thresholds and has no unresolved fatal import errors. Otherwise return `partial` or `failed` with retained artifacts.

## Completion Report

Report the source URL, destination document/page, capture mode and viewports, created node/component/variant counts, asset and font results, QA metrics, unsupported effects, remaining discrepancies, and artifact directory.
