# Tasks: Website-to-Figma Agent Pipeline

## Definition of Done for Every Task

- Acceptance criteria and focused tests pass.
- Affected packages type-check and lint cleanly.
- Persisted or transported data is schema-validated.
- New failures return structured diagnostics and retain completed artifacts where applicable.
- No task weakens the approved safety boundaries or quality thresholds.

## Phase A: Executable Foundation

### Task 1: Scaffold the TypeScript workspace ✅

**Description:** Create the npm workspace, shared TypeScript configuration, build/typecheck/lint/format/test commands, artifact ignore rules, and minimal package entrypoints.

**Acceptance criteria:**

- [x] The documented root commands resolve across all declared workspaces.
- [x] Strict TypeScript compilation succeeds with one minimal test per package boundary.
- [x] Generated artifacts and packaged plugin output are ignored without hiding source fixtures.

**Verification:**

- [x] Run `npm run build`, `npm run typecheck`, `npm run lint`, `npm run format:check`, and `npm test`.

**Dependencies:** None

**Files likely touched:** `package.json`, `tsconfig.base.json`, `eslint.config.js`, `.prettierrc.json`, `.gitignore`

**Estimated scope:** Medium (5 files plus generated package directories handled in focused follow-up commits if needed)

### Task 2: Define artifact envelopes and schemas ✅

**Description:** Implement versioned schemas and TypeScript types for raw capture, Website IR, inference, Figma Scene, import results, QA reports, stable identifiers, and diagnostics.

**Acceptance criteria:**

- [x] Each artifact requires the approved common metadata and stage-specific payload.
- [x] Valid examples parse into typed values; malformed versions and dangling identifiers fail clearly.
- [x] Browser facts, inference annotations, and Figma instructions cannot be confused structurally.

**Verification:**

- [x] Run `npm run validate:schemas` and contracts-package unit tests.

**Dependencies:** Task 1

**Files likely touched:** `packages/contracts/src/artifacts.ts`, `packages/contracts/src/validation.ts`, `packages/contracts/src/artifacts.test.ts`, `packages/contracts/schemas/artifacts.schema.json`

**Estimated scope:** Medium (5 files)

### Task 3: Define the plugin transport protocol ✅

**Description:** Define version negotiation, ephemeral authentication, scene transfer, progress, acknowledgement, completion, failure, and idempotent operation messages.

**Acceptance criteria:**

- [x] Incompatible versions and invalid tokens are rejected before mutation authorization.
- [x] Every mutation carries a run and operation identifier with deterministic retry semantics.
- [x] Protocol validation yields structured errors for invalid state transitions.

**Verification:**

- [x] Run protocol state-machine and schema tests in `packages/contracts`.

**Dependencies:** Task 2

**Files likely touched:** `packages/contracts/src/protocol.ts`, `packages/contracts/src/protocol-state.ts`, `packages/contracts/src/protocol.test.ts`, `packages/contracts/schemas/protocol.schema.json`

**Estimated scope:** Medium (4 files)

### Checkpoint A

- [x] Build, typecheck, lint, formatting, tests, and schema validation pass.
- [x] Artifact and protocol examples have human-readable validation failures.
- [x] Review stable contract boundaries before adding consumers.

## Phase B: Browser-to-IR Slice

### Task 4: Establish the fixture harness and CDP session ✅

**Description:** Add deterministic local fixture pages and a browser-session adapter that navigates, configures the viewport, waits for a stable capture point, and enforces public-URL and run limits.

**Acceptance criteria:**

- [x] Tests launch the fixture site at an explicit viewport through the browser adapter.
- [x] Invalid/private URLs and exceeded time limits fail before artifact capture.
- [x] Session cleanup runs after success, failure, and cancellation.

**Verification:**

- [x] Run browser-extractor integration tests against the local fixture server.

**Dependencies:** Task 3

**Files likely touched:** `packages/browser-extractor/src/session.ts`, `packages/browser-extractor/src/url-policy.ts`, `packages/browser-extractor/src/session.test.ts`, `tests/fixtures/sites/core-layout/index.html`, `tests/fixtures/sites/server.ts`

**Estimated scope:** Medium (5 files)

### Task 5: Capture DOM, styles, text, and geometry

**Description:** Produce raw node observations with stable source IDs, document-relative rectangles, coordinate metadata, visibility, clipping, stacking, text runs, computed styles, pseudo-elements, and accessible open shadow roots.

**Acceptance criteria:**

- [x] Mixed text runs, scrolled geometry, nested clipping, and pseudo-elements are represented correctly in fixtures.
- [x] Capture stops with structured diagnostics at the approved DOM and page-height limits.
- [x] Unsupported cross-origin frames and inaccessible content are classified rather than silently omitted.

**Verification:**

- [x] Run extraction unit tests and the core-layout fixture integration test.

**Dependencies:** Task 4

**Files likely touched:** `packages/browser-extractor/src/dom-capture.ts`, `packages/browser-extractor/src/style-properties.ts`, `packages/browser-extractor/src/source-id.ts`, `packages/browser-extractor/src/dom-capture.test.ts`, `tests/fixtures/sites/dom-edge-cases/index.html`

**Estimated scope:** Medium (5 files)

### Task 6: Capture reference images and assets

**Description:** Capture the master screenshot plus authorized raster images and SVG sources, deduplicate content, enforce artifact limits, and report canvas/video/WebGL or retrieval limitations.

**Acceptance criteria:**

- [x] Screenshot dimensions match the requested viewport and full document capture policy.
- [x] Images and SVGs are content-addressed and traceable to source nodes.
- [x] Missing, oversized, expiring, and unsupported assets return structured diagnostics.

**Verification:**

- [x] Run asset-capture tests and inspect generated artifacts for the media fixture.

**Dependencies:** Task 5

**Files likely touched:** `packages/browser-extractor/src/asset-capture.ts`, `packages/browser-extractor/src/screenshot.ts`, `packages/browser-extractor/src/asset-capture.test.ts`, `tests/fixtures/sites/media/index.html`

**Estimated scope:** Medium (4 files)

### Task 7: Normalize raw capture into Website IR

**Description:** Canonicalize coordinate spaces, lengths, colors, text runs, assets, hierarchy, and style values without introducing Figma-specific properties or inferred layouts.

**Acceptance criteria:**

- [x] Equivalent browser values normalize deterministically while preserving source IDs.
- [x] Raw capture remains immutable and inference fields are absent from Website IR.
- [x] Invalid references and non-finite geometry produce structured errors.

**Verification:**

- [x] Run Website IR unit tests and a raw-capture-to-IR integration test.

**Dependencies:** Tasks 5 and 6

**Files likely touched:** `packages/website-ir/src/normalize.ts`, `packages/website-ir/src/styles.ts`, `packages/website-ir/src/geometry.ts`, `packages/website-ir/src/normalize.test.ts`, `packages/website-ir/src/styles.test.ts`

**Estimated scope:** Medium (5 files)

### Checkpoint B

- [ ] A fixture URL generates schema-valid raw capture and Website IR artifacts.
- [ ] Every IR node traces to raw observations.
- [ ] Build, typecheck, lint, schema validation, and browser integration tests pass.

## Phase C: IR-to-Scene Slice

### Task 8: Infer sections and layout modes

**Description:** Classify section boundaries, horizontal/vertical/wrapped layouts, sizing, padding, gaps, alignment, overlays, and geometry fallbacks from normalized evidence.

**Acceptance criteria:**

- [x] Each decision contains evidence, confidence, and fallback behavior.
- [x] Flex, grid-like, and absolute-overlay fixtures receive the expected classifications.
- [x] Ambiguous layouts retain editable geometry without fabricated certainty.

**Verification:**

- [x] Run inference unit tests and layout fixture integration tests.

**Dependencies:** Task 7

**Files likely touched:** `packages/inference/src/layout.ts`, `packages/inference/src/evidence.ts`, `packages/inference/src/sections.ts`, `packages/inference/src/layout.test.ts`, `packages/inference/src/sections.test.ts`

**Estimated scope:** Medium (5 files)

### Task 9: Infer reusable components

**Description:** Group materially repeated structures and styles into conservative component candidates while leaving one-off and low-confidence matches independent.

**Acceptance criteria:**

- [x] Repeated button/card fixtures produce stable candidates and instance mappings.
- [x] Near-matches preserve meaningful overrides without merging unrelated structures.
- [x] Every grouping decision includes evidence and confidence.

**Verification:**

- [x] Run component inference unit and fixture tests.

**Dependencies:** Task 8

**Files likely touched:** `packages/inference/src/components.ts`, `packages/inference/src/fingerprint.ts`, `packages/inference/src/components.test.ts`, `tests/fixtures/sites/components/index.html`

**Estimated scope:** Medium (4 files)

### Task 10: Compile core Figma Scene nodes

**Description:** Compile hierarchy, frames, text, rectangles, ellipses, sizing, constraints, Auto Layout, absolute children, names, and stable source links into a deterministic scene.

**Acceptance criteria:**

- [x] Core fixture IR compiles to a schema-valid, deterministic scene.
- [x] Text remains text and inferred Auto Layout preserves geometry within declared tolerances.
- [x] Every eligible source node is created or explicitly classified.

**Verification:**

- [x] Run scene compiler unit tests and golden semantic-invariant tests.

**Dependencies:** Tasks 8 and 9

**Files likely touched:** `packages/figma-scene/src/compile.ts`, `packages/figma-scene/src/core-mapping.ts`, `packages/figma-scene/src/naming.ts`, `packages/figma-scene/src/compile.test.ts`, `packages/figma-scene/src/core-mapping.test.ts`

**Estimated scope:** Medium (5 files)

### Task 11: Compile assets and advanced appearance

**Description:** Add raster fills, SVG vectors, gradients, strokes, corner radii, opacity, blend modes, and supported shadows with ordered effects and explicit approximation diagnostics.

**Acceptance criteria:**

- [x] Supported media and style fixtures map to valid scene instructions.
- [x] Unsupported CSS/SVG features are reported with source IDs and chosen fallbacks.
- [x] Asset dependencies are content-addressed and ordered before their consumers.

**Verification:**

- [x] Run advanced mapping tests and validate the complete fixture scene.

**Dependencies:** Task 10

**Files likely touched:** `packages/figma-scene/src/asset-mapping.ts`, `packages/figma-scene/src/paint-mapping.ts`, `packages/figma-scene/src/effect-mapping.ts`, `packages/figma-scene/src/appearance.test.ts`

**Estimated scope:** Medium (4 files)

### Checkpoint C

- [ ] Fixture Website IR compiles into deterministic, schema-valid Figma Scenes.
- [ ] Element coverage and unsupported classifications meet the 98% requirement.
- [ ] Build, typecheck, lint, schema validation, and IR-to-scene integration tests pass.

## Phase D: Scene-to-Figma Slice

### Task 12: Implement secure local transport

**Description:** Implement the CLI WebSocket server and plugin-side transport client with loopback binding, ephemeral token verification, version negotiation, progress, acknowledgements, bounded reconnects, and idempotent operation state.

**Acceptance criteria:**

- [x] Non-loopback binding, invalid tokens, and incompatible versions are rejected.
- [ ] Disconnect/retry resumes from acknowledgements without replaying completed operations.
- [ ] Transport failures produce structured partial results.

**Verification:**

- [x] Run transport integration and protocol conformance tests.

**Dependencies:** Tasks 3 and 11

**Files likely touched:** `apps/cli/src/transport/server.ts`, `apps/figma-plugin/src/transport/client.ts`, `packages/contracts/src/protocol-session.ts`, `tests/integration/transport.test.ts`, `tests/integration/transport-retry.test.ts`

**Estimated scope:** Medium (5 files)

### Task 13: Import core nodes through a Figma adapter

**Description:** Create an adapter for the Figma Plugin API and import pages, frames, text, basic shapes, hierarchy, ordering, metadata, and core paints from a validated scene.

**Acceptance criteria:**

- [x] Adapter tests verify core node properties and deterministic z-order.
- [x] Validation completes before document mutation begins.
- [x] Replayed acknowledged operations do not duplicate nodes.

**Verification:**

- [x] Run plugin importer contract tests using the Figma adapter harness.

**Dependencies:** Task 12

**Files likely touched:** `apps/figma-plugin/src/figma-adapter.ts`, `apps/figma-plugin/src/importer.ts`, `apps/figma-plugin/src/import-state.ts`, `apps/figma-plugin/src/importer.test.ts`, `apps/figma-plugin/src/figma-adapter.test.ts`

**Estimated scope:** Medium (5 files)

### Task 14: Import fonts, assets, layouts, and components

**Description:** Extend the importer for font loading/substitution, image/SVG assets, Auto Layout, constraints, components/instances, gradients, and effects with granular diagnostics.

**Acceptance criteria:**

- [x] Supported scene properties create equivalent adapter operations.
- [x] Missing fonts produce a partial result with deterministic substitution and source-linked warnings.
- [x] Dependency failures affect only dependent nodes and are reflected in import results.

**Verification:**

- [x] Run advanced importer tests and perform a bounded Figma Desktop smoke test.

**Dependencies:** Task 13

**Files likely touched:** `apps/figma-plugin/src/font-loader.ts`, `apps/figma-plugin/src/asset-loader.ts`, `apps/figma-plugin/src/advanced-importer.ts`, `apps/figma-plugin/src/advanced-importer.test.ts`, `apps/figma-plugin/manifest.json`

**Estimated scope:** Medium (5 files)

### Checkpoint D

- [ ] A complete fixture scene imports into Figma Desktop and exports successfully.
- [ ] Retry testing proves idempotent document mutation.
- [ ] Build, typecheck, lint, schema validation, adapter tests, and transport integration tests pass.

## Phase E: End-to-End Product Slice

### Task 15: Wire the CLI pipeline

**Description:** Implement `import` argument parsing, run configuration, stage orchestration, limit enforcement, artifact persistence, retries, cancellation, plugin-session coordination, and completion reporting.

**Acceptance criteria:**

- [x] The documented CLI command executes all stages in dependency order.
- [x] Success, partial, failure, timeout, and cancellation preserve the correct artifacts and diagnostics.
- [x] CLI defaults and limits match the approved specification.

**Verification:**

- [x] Run CLI unit tests and a mocked end-to-end pipeline test.

**Dependencies:** Tasks 7, 11, 12, and 14

**Files likely touched:** `apps/cli/src/commands/import.ts`, `apps/cli/src/pipeline.ts`, `apps/cli/src/run-context.ts`, `apps/cli/src/artifacts.ts`, `apps/cli/src/pipeline.test.ts`

**Estimated scope:** Medium (5 files)

### Task 16: Implement visual QA

**Description:** Compare like-sized browser and Figma exports using SSIM and changed-pixel ratio, produce discrepancy regions, and apply the approved pass/partial thresholds without masking structural failures.

**Acceptance criteria:**

- [x] Identical, tolerably different, and failing image pairs are classified correctly.
- [x] Reports include dimensions, thresholds, metrics, discrepancy artifacts, and stage/source context.
- [x] Dimension mismatches and missing exports fail clearly.

**Verification:**

- [x] Run visual-QA unit tests with deterministic image pairs and report fixtures.

**Dependencies:** Tasks 2 and 14

**Files likely touched:** `packages/visual-qa/src/compare.ts`, `packages/visual-qa/src/ssim.ts`, `packages/visual-qa/src/diff.ts`, `packages/visual-qa/src/report.ts`, `packages/visual-qa/src/compare.test.ts`

**Estimated scope:** Medium (5 files)

### Task 17: Prove and package the MVP

**Description:** Add the final fixture-suite acceptance path, coverage gates, Figma Desktop smoke procedure, plugin packaging, CLI operator documentation, and limitations report.

**Acceptance criteria:**

- [x] Approved fixtures meet artifact, traceability, coverage, editability, and visual thresholds.
- [x] `npm run package:plugin` produces an installable plugin bundle.
- [x] Documentation enables a fresh user to connect the plugin and run an import without undocumented steps.

**Verification:**

- [x] Run all build, typecheck, lint, schema, coverage, integration, end-to-end, and plugin packaging commands.
- [ ] Complete and record the real Figma Desktop smoke test.

**Dependencies:** Tasks 15 and 16

**Files likely touched:** `tests/e2e/import.test.ts`, `tests/e2e/acceptance.ts`, `apps/figma-plugin/build.config.ts`, `docs/getting-started.md`, `docs/limitations.md`

**Estimated scope:** Medium (5 files)

### Checkpoint E: MVP Complete

- [ ] All specification success criteria pass.
- [ ] Coverage meets or exceeds 80% line and branch coverage in required packages.
- [ ] Figma Desktop smoke test is recorded.
- [ ] Known limitations and partial-result behavior are documented.
- [ ] Human reviews the completed MVP.
