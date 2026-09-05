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
- [ ] Complete and record the real Figma Desktop smoke test (blocked: Figma Desktop unavailable in this environment; see `docs/smoke-test.md`).

**Dependencies:** Tasks 15 and 16

**Files likely touched:** `tests/e2e/import.test.ts`, `tests/e2e/acceptance.ts`, `apps/figma-plugin/build.config.ts`, `docs/getting-started.md`, `docs/limitations.md`

**Estimated scope:** Medium (5 files)

### Checkpoint E: MVP Complete

- [ ] All specification success criteria pass (pending live plugin orchestration and production pixel-level QA).
- [ ] Coverage meets or exceeds 80% line and branch coverage in required packages (current aggregate branch coverage: 66.85%).
- [ ] Figma Desktop smoke test is recorded (blocked; see `docs/smoke-test.md`).
- [x] Known limitations and partial-result behavior are documented.
- [ ] Human reviews the completed MVP.

## Live integration follow-up (user approved)

- [x] Correct asset/source identities; persist bytes and reference PNG.
- [x] Validate artifacts and stop reporting capture-only as success.
- [x] Add protocol 1.1.0 authenticated requests/results and bounded reconnects.
- [x] Package a real Figma controller/UI with build-time schema validators.
- [x] Create editable layers and return source-linked import results and PNG.
- [x] Decode PNGs and calculate pixel SSIM/changed-pixel QA.
- [x] Exercise the packaged controller, browser UI, transport, and CLI integration.
- [x] Document plugin setup and update the domain skill's executable workflow.
- [ ] Real Figma Desktop smoke test and approved visual acceptance thresholds.
- [ ] Remaining advanced CSS/component mappings listed in docs/limitations.md.

## Agentic Inference Milestone

### Phase F: Agent Contracts and Provider Boundary

### Task 18: Revise the inference artifact contract

**Description:** Add a versioned, provider-neutral decision payload model for agent
proposals, deterministic/agent provenance, rejected decisions, and merge outcomes while
retaining validation support for existing deterministic inference artifacts.

**Acceptance criteria:**

- [ ] New decision kinds and payloads are closed, discriminated, and schema-valid.
- [ ] Existing inference 1.0 fixtures still validate and new artifacts contain no provider-specific fields.
- [ ] References, confidence, evidence, fallbacks, and merge provenance are validated.

**Verification:**

- [ ] Run `npm run validate:schemas` and focused contract/reference tests.
- [ ] Run `npm run typecheck`.

**Dependencies:** Approved agentic inference specification

**Files likely touched:** `packages/contracts/src/artifacts.ts`, `packages/contracts/schemas/artifacts.schema.json`, `packages/contracts/src/artifacts.test.ts`, `packages/contracts/src/reference-validation.ts`, `packages/contracts/src/validation.ts`

**Estimated scope:** Medium (5 files)

### Task 19: Establish the provider-neutral inference interface

**Description:** Define provider request/result types, build bounded sanitized requests
from artifacts, and supply a deterministic fake provider for contract-level testing.

**Acceptance criteria:**

- [ ] Provider interfaces expose only domain inputs, proposals, diagnostics, and optional usage.
- [ ] Request construction excludes secrets and partitions oversized pages by section.
- [ ] A fake provider proves success, partial, and failure behavior without model access.

**Verification:**

- [ ] Run focused provider and request-builder tests.
- [ ] Run `npm run typecheck`.

**Dependencies:** Task 18

**Files likely touched:** `packages/inference/src/provider.ts`, `packages/inference/src/agent-input.ts`, `packages/inference/src/provider.test.ts`, `packages/inference/src/agent-input.test.ts`, `packages/inference/src/index.ts`

**Estimated scope:** Medium (5 files)

### Task 20: Implement the local Codex provider

**Description:** Invoke the locally authenticated Codex CLI without a shell using
ephemeral read-only execution, stdin prompt framing, generated output schema, and
bounded process resources.

**Acceptance criteria:**

- [ ] Arguments, working directory, prompt, schema, and output paths are isolated and deterministic.
- [ ] Missing executable, timeout, oversized output, nonzero exit, and malformed JSON return structured failures.
- [ ] Available token usage is normalized without persisting auth, sessions, or private configuration.

**Verification:**

- [ ] Run Codex-adapter tests against a fake executable.
- [ ] Run an explicit local-Codex smoke command outside the ordinary test suite.

**Dependencies:** Task 19

**Files likely touched:** `packages/inference/src/codex-provider.ts`, `packages/inference/src/codex-provider.test.ts`, `packages/inference/src/codex-prompt.ts`, `packages/inference/src/codex-prompt.test.ts`

**Estimated scope:** Medium (4 files)

### Task 21: Validate and merge agent proposals

**Description:** Enforce source identity, hierarchy, geometry, editability,
rasterization, and budget policies, then merge valid proposal properties with the
deterministic baseline while retaining rejection evidence.

**Acceptance criteria:**

- [ ] Unknown nodes, cycles, out-of-bounds geometry, unknown properties, and forbidden rasterization are rejected.
- [ ] Valid decisions merge per property; invalid siblings fall back independently.
- [ ] Merge output is deterministic and explains every accepted, rejected, and fallback choice.

**Verification:**

- [ ] Run proposal-policy and merge unit tests.
- [ ] Validate merged inference artifacts with `npm run validate:schemas`.

**Dependencies:** Tasks 18 and 19

**Files likely touched:** `packages/inference/src/proposal.ts`, `packages/inference/src/proposal-policy.ts`, `packages/inference/src/proposal.test.ts`, `packages/inference/src/merge.ts`, `packages/inference/src/merge.test.ts`

**Estimated scope:** Medium (5 files)

### Checkpoint F

- [ ] Existing deterministic imports remain byte-for-byte stable where contracts are unchanged.
- [ ] Fake and Codex providers satisfy one interface; failures produce deterministic fallback.
- [ ] Build, typecheck, lint, format, schema validation, and contract/inference tests pass.
- [ ] Human reviews the provider boundary before domain decision work.

### Phase G: Agentic Design-Intent Slices

### Task 22: Infer layout, semantic names, and responsive intent

**Description:** Accept and validate agent decisions for section roles, editable layout,
stable layer names, and single-viewport responsive intent, then enforce geometry
tolerances against captured bounds.

**Acceptance criteria:**

- [ ] Ambiguous row, column, wrap, grid, and overlay fixtures receive evidence-backed layouts.
- [ ] Eligible layers receive stable role-based names with deterministic fallbacks.
- [ ] Responsive constraints are labeled inferred and cannot claim multi-viewport validation.

**Verification:**

- [ ] Run layout/naming/responsive unit and fixture tests.
- [ ] Run `npm run typecheck`.

**Dependencies:** Task 21

**Files likely touched:** `packages/inference/src/agent-layout.ts`, `packages/inference/src/semantic-names.ts`, `packages/inference/src/responsive.ts`, `packages/inference/src/agent-layout.test.ts`, `packages/inference/src/responsive.test.ts`

**Estimated scope:** Medium (5 files)

### Task 23: Discover components and interpret carousels

**Description:** Combine deterministic fingerprints and agent evidence to produce
conservative reusable components and unique ordered carousel panels without flattening
or retaining proven loop clones.

**Acceptance criteria:**

- [ ] Repeated structures become components only when overrides preserve meaningful differences.
- [ ] Carousel panels remain individually editable, ordered, and clipped to their viewport.
- [ ] Unique visible content cannot be suppressed without structural and asset evidence.

**Verification:**

- [ ] Run component and carousel unit tests plus dedicated browser fixtures.
- [ ] Inspect semantic scene invariants for editable panels and instances.

**Dependencies:** Task 21

**Files likely touched:** `packages/inference/src/agent-components.ts`, `packages/inference/src/carousel.ts`, `packages/inference/src/agent-components.test.ts`, `packages/inference/src/carousel.test.ts`, `tests/fixtures/sites/agent-carousel/index.html`

**Estimated scope:** Medium (5 files)

### Task 24: Match typography and select scoped fallbacks

**Description:** Validate font substitution and metric-compensation decisions using
captured line geometry, and constrain raster fallback decisions to eligible unsupported
media roots.

**Acceptance criteria:**

- [ ] Typography fixtures preserve expected lines and avoid overlap with unavailable fonts.
- [ ] Requested font intent and chosen substitute remain traceable.
- [ ] Ordinary text, full pages, and major sections are rejected as raster fallbacks.

**Verification:**

- [ ] Run typography/fallback unit and fixture tests.
- [ ] Run editability invariant tests.

**Dependencies:** Task 21

**Files likely touched:** `packages/inference/src/typography.ts`, `packages/inference/src/fallback.ts`, `packages/inference/src/typography.test.ts`, `packages/inference/src/fallback.test.ts`, `tests/fixtures/sites/agent-typography/index.html`

**Estimated scope:** Medium (5 files)

### Task 25: Classify structural QA and rank candidates

**Description:** Localize image differences, attach relevant source nodes, distinguish
structural defects from rendering noise, and rank candidate results without allowing
aggregate metrics to hide editability failures.

**Acceptance criteria:**

- [ ] Seeded missing assets, overlaps, clipping, ordering, and geometry drift are classified correctly.
- [ ] Antialiasing-only and known font-rasterization noise receive lower priority.
- [ ] Candidate ranking rejects structural regressions before comparing pixel scores.

**Verification:**

- [ ] Run visual-QA classification and ranking tests with deterministic image pairs.
- [ ] Validate source-linked discrepancy regions.

**Dependencies:** Task 18

**Files likely touched:** `packages/visual-qa/src/classify.ts`, `packages/visual-qa/src/rank.ts`, `packages/visual-qa/src/classify.test.ts`, `packages/visual-qa/src/rank.test.ts`, `packages/visual-qa/src/index.ts`

**Estimated scope:** Medium (5 files)

### Task 26: Compile enriched inference into editable scenes

**Description:** Apply accepted layout, naming, component, carousel, typography,
responsive, visibility, and fallback decisions when compiling a validated Figma Scene.

**Acceptance criteria:**

- [ ] Every accepted decision has a deterministic scene effect or an explicit unsupported diagnostic.
- [ ] Components, instances, constraints, clipping, and names preserve source traceability.
- [ ] Rejected/absent decisions produce the existing editable deterministic scene.

**Verification:**

- [ ] Run scene compiler tests for every new decision family.
- [ ] Validate deterministic fallback and schema-valid output.

**Dependencies:** Tasks 22–24

**Files likely touched:** `packages/figma-scene/src/compile.ts`, `packages/figma-scene/src/agent-decisions.ts`, `packages/figma-scene/src/agent-decisions.test.ts`, `packages/figma-scene/src/compile.test.ts`

**Estimated scope:** Medium (4 files)

### Checkpoint G

- [ ] Ambiguous fixtures demonstrate every approved inference capability.
- [ ] Carousel, text, component, and fallback editability invariants pass.
- [ ] Deterministic mode has no behavioral regression.
- [ ] Build, typecheck, lint, format, schema, inference, scene, and QA tests pass.

### Phase H: Iterative Candidate Rendering

### Task 27: Define the candidate-render protocol

**Description:** Replace the single-result live flow with versioned candidate,
render-result, finalization, and cancellation messages carrying bounded monotonic
revisions and explicit compatibility errors.

**Acceptance criteria:**

- [ ] Protocol schemas reject invalid versions, runs, revisions, destinations, and message order.
- [ ] Same-revision retries are idempotent and conflicting revisions are rejected.
- [ ] Older plugins receive a clear rebuild/reload instruction before mutation.

**Verification:**

- [ ] Run protocol schema, parser, state-machine, and compatibility tests.
- [ ] Run `npm run validate:schemas`.

**Dependencies:** Task 18

**Files likely touched:** `packages/contracts/src/live-protocol.ts`, `packages/contracts/schemas/protocol.schema.json`, `packages/contracts/src/live-protocol.test.ts`, `packages/contracts/src/protocol-state.ts`, `packages/contracts/src/protocol.test.ts`

**Estimated scope:** Medium (5 files)

### Task 28: Manage plugin-owned candidate revisions

**Description:** Import, replace, export, select, and clean up candidate frames using
run/revision ownership metadata while protecting all pre-existing and user-created layers.

**Acceptance criteria:**

- [ ] Each complete revision exports once and a retry returns the cached result.
- [ ] Finalization retains only the selected complete revision.
- [ ] Cancellation/disconnect preserves the last complete candidate and never alters user-owned nodes.

**Verification:**

- [ ] Run plugin adapter lifecycle, ownership, retry, and failure tests.
- [ ] Package the plugin and run the controller harness.

**Dependencies:** Tasks 26 and 27

**Files likely touched:** `apps/figma-plugin/src/candidate-manager.ts`, `apps/figma-plugin/src/candidate-manager.test.ts`, `apps/figma-plugin/src/controller.ts`, `apps/figma-plugin/src/live-importer.ts`, `apps/figma-plugin/src/live-importer.test.ts`

**Estimated scope:** Medium (5 files)

### Task 29: Exchange multiple revisions over live transport

**Description:** Extend the authenticated session to send bounded candidate revisions,
receive render results, finalize selection, and retain reconnect/idempotency guarantees.

**Acceptance criteria:**

- [ ] One authenticated connection exchanges up to three ordered candidate revisions.
- [ ] Retry, disconnect, timeout, cancellation, and stale-result behavior are deterministic.
- [ ] The last complete candidate remains recoverable after interruption.

**Verification:**

- [ ] Run transport unit and integration tests with synthetic peers.
- [ ] Run plugin UI end-to-end transport tests.

**Dependencies:** Tasks 27 and 28

**Files likely touched:** `packages/transport/src/live-session.ts`, `packages/transport/src/live-session.test.ts`, `apps/figma-plugin/src/ui.ts`, `tests/integration/live-pipeline.test.ts`, `tests/e2e/plugin-ui.test.ts`

**Estimated scope:** Medium (5 files)

### Task 30: Implement the bounded correction loop

**Description:** Orchestrate proposal, compilation, candidate rendering, QA,
re-proposal, ranking, and finalization with a three-render cap and complete history.

**Acceptance criteria:**

- [ ] The loop stops on pass, no improvement, invalid output, provider failure, or exhausted budget.
- [ ] The best structurally valid candidate is selected rather than merely the last candidate.
- [ ] Every pass records inputs, accepted/rejected decisions, diagnostics, metrics, usage, and stop reason.

**Verification:**

- [ ] Run correction-state and fake-provider end-to-end tests.
- [ ] Verify timeout and failure paths retain the best candidate.

**Dependencies:** Tasks 20, 21, 25, 26, and 29

**Files likely touched:** `packages/inference/src/correction-loop.ts`, `packages/inference/src/correction-loop.test.ts`, `packages/inference/src/candidate-history.ts`, `packages/inference/src/candidate-history.test.ts`

**Estimated scope:** Medium (4 files)

### Checkpoint H

- [ ] Fake-provider end-to-end flow completes three revisions and selects the expected candidate.
- [ ] Protocol, transport, plugin ownership, retry, disconnect, and cleanup tests pass.
- [ ] Coverage, integration, end-to-end, and plugin packaging commands pass.
- [ ] Human reviews the iterative mutation behavior before CLI rollout.

### Phase I: Deployable Frontend-Development Workflow

### Task 31: Integrate agentic mode into the CLI and reports

**Description:** Add mode/provider/budget parsing, provider construction, correction
orchestration, progress output, artifact persistence, usage reporting, and actionable
fallback diagnostics to the existing import command.

**Acceptance criteria:**

- [ ] Agentic and deterministic modes follow documented behavior and share capture safety limits.
- [ ] Connection, capture, inference, candidate, correction, and finalization progress is human-readable.
- [ ] Partial/failure runs retain valid artifacts, best candidate, correction history, and recovery guidance.

**Verification:**

- [ ] Run CLI parser, pipeline, report, integration, and failure-path tests.
- [ ] Run a capture-only agentic fixture with the fake provider.

**Dependencies:** Task 30

**Files likely touched:** `apps/cli/src/index.ts`, `apps/cli/src/pipeline.ts`, `apps/cli/src/agentic-options.ts`, `apps/cli/src/run-report.ts`, `apps/cli/src/pipeline.test.ts`

**Estimated scope:** Medium (5 files)

### Task 32: Prove, document, and enable the agentic workflow

**Description:** Complete fixture acceptance, explicit local-Codex and real-Figma
smoke procedures, frontend-developer documentation, limitations, and the guarded
switch to agentic-by-default after all gates pass.

**Acceptance criteria:**

- [ ] Approved fixtures meet structural, editability, traceability, coverage, and visual thresholds.
- [ ] Local Codex and real Figma smoke runs are recorded, including human visual QA and usage.
- [ ] Fresh setup documentation covers plugin reload, authentication, modes, budgets, artifacts, and recovery.

**Verification:**

- [ ] Run every documented root verification command and record results.
- [ ] Run the public-site smoke test and complete the release checklist.

**Dependencies:** Task 31 and Checkpoint H

**Files likely touched:** `tests/e2e/agentic-import.test.ts`, `docs/getting-started.md`, `docs/limitations.md`, `docs/smoke-test.md`, `skills/website-to-figma/SKILL.md`

**Estimated scope:** Medium (5 files)

### Checkpoint I: Agentic Inference Complete

- [ ] All 15 agentic milestone success criteria pass.
- [ ] Required package coverage is at least 80% line and branch coverage.
- [ ] Deterministic mode remains available and verified.
- [ ] Real Figma Desktop and public-site human QA are recorded.
- [ ] Human approves making agentic mode the default.
