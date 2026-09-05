# Spec: Website-to-Figma Agent Pipeline

## Status

Implementation and live integration approved on 2026-09-04. Protocol 1.1.0 and pinned bundling/PNG dependencies approved by the user.

## Assumptions

1. This repository will contain a local developer tool, not a hosted product or user-facing web application.
2. A TypeScript CLI coordinates Chrome extraction, inference stages, artifacts, and communication with a Figma plugin.
3. The Figma plugin is open in the destination document during import and is the only component that mutates the Figma document.
4. The MVP processes one publicly reachable page at one desktop viewport per run.
5. Visual fidelity takes priority when reliable semantic layout inference is impossible, but the result must remain layer-editable.
6. Responsive frames, interaction variants, multi-page crawling, automatic visual correction, and Figma-to-code round-tripping are post-MVP capabilities.
7. Agent inference may initially use the model/tool environment available to the CLI; the scene and artifact contracts must not depend on one model vendor.
8. Only content the user is authorized to access and reproduce is in scope.

## Approved MVP Defaults

- Visual QA uses both SSIM and changed-pixel ratio. Initial fixture acceptance thresholds are SSIM >= 0.95 and changed pixels <= 5% at a per-channel tolerance of 16; thresholds may be tightened using baseline evidence without weakening this floor.
- Only public, unauthenticated URLs are supported.
- The plugin targets Figma Desktop first.
- Layout and component inference begins with deterministic heuristics behind a pluggable inference interface; external model calls are not required for the MVP.
- A run supports at most 15,000 captured DOM nodes, 30,000 CSS pixels of document height, 500 MB of artifacts, and 10 minutes of wall-clock time.
- An unavailable original font produces a partial result with an explicit, deterministic substitute and diagnostic.

## Objective

Build a local agent pipeline that converts a rendered webpage into an editable Figma document. The CLI captures browser facts, normalizes them into a Website IR, infers layout and reusable structures with provenance, produces a validated Figma Scene, and sends it to a local Figma plugin for node creation.

The primary user is a designer or engineer who wants to inspect and modify an existing webpage as structured Figma layers rather than as a flattened screenshot.

### MVP User Story

Given an authorized webpage URL and an open destination Figma document, the user runs one CLI command and receives one editable desktop frame plus artifacts and a QA report that explain the reconstruction.

### Non-Goals for MVP

- A hosted service, GUI, authentication system, or billing system.
- Multi-page site crawling.
- Tablet and mobile reconstruction.
- Capturing hover, pressed, modal, carousel, or scroll-triggered states.
- Figma-to-website code generation.
- Automatically publishing, sharing, or modifying files through the Figma REST API.
- Perfect representation of video, canvas, WebGL, animation, or inaccessible cross-origin frames.

## Architecture

```text
CLI orchestrator
  -> Chrome extractor
  -> raw-capture.json
  -> Website IR normalizer
  -> website-ir.json
  -> layout/component inference
  -> inference.json
  -> Figma Scene compiler + validator
  -> figma-scene.json
  -> versioned localhost transport
  -> Figma plugin
  -> editable nodes + import-result.json
  -> export/comparison
  -> qa-report.json
```

Browser observations, normalized facts, inferred decisions, and Figma instructions are separate versioned contracts. Every derived node retains a stable source identifier and inference provenance.

## Tech Stack

- Node.js 22 LTS
- TypeScript 5.x with strict type checking
- npm workspaces for the CLI, shared contracts, and plugin
- Chrome DevTools Protocol for browser coordination and extraction
- Figma Plugin API for document construction
- WebSocket transport bound to localhost for CLI/plugin communication
- JSON Schema plus TypeScript types for persisted and transported contracts
- Vitest for unit and integration tests
- Playwright-managed Chromium fixtures for deterministic extractor tests
- ESLint and Prettier for static checks and formatting

Exact dependency versions will be pinned when the implementation plan is approved and the workspace is initialized.

## Commands

These commands define the intended project interface; they become executable during implementation.

```bash
npm install
npm run dev --workspace @website-to-figma/cli -- import --url https://example.com --viewport 1440x900
npm run build
npm run typecheck
npm run lint
npm run format:check
npm test -- --coverage
npm run test:integration
npm run test:e2e
npm run validate:schemas
npm run package:plugin
```

## Project Structure

```text
apps/cli/                    CLI entrypoint and pipeline orchestration
apps/figma-plugin/           Figma plugin controller and UI/transport bridge
packages/contracts/          Versioned schemas and shared TypeScript types
packages/browser-extractor/  CDP capture and raw browser observations
packages/website-ir/         Normalization and coordinate/style canonicalization
packages/inference/          Layout, hierarchy, and component inference
packages/figma-scene/        Scene compilation and validation
packages/visual-qa/          Rendering comparison and QA reporting
skills/website-to-figma/     Agent skill and progressively disclosed references
specs/                       Product and architecture specifications
tests/fixtures/sites/        Deterministic local webpage fixtures
tests/integration/           Cross-package pipeline tests
tests/e2e/                   Chrome-to-plugin acceptance tests
artifacts/                   Ignored per-run outputs
website-to-figma-skill.md    Original raw domain-knowledge source
```

## Code Style

Use small typed stage interfaces, explicit results, stable identifiers, and dependency injection at external boundaries. Avoid implicit global state and untyped JSON.

```ts
export interface PipelineStage<Input, Output> {
  readonly name: string;
  run(input: Input, context: RunContext): Promise<StageResult<Output>>;
}

export type StageResult<T> =
  | { ok: true; value: T; warnings: PipelineWarning[] }
  | { ok: false; error: PipelineError; partialArtifact?: ArtifactRef };
```

Conventions:

- `camelCase` for values and functions, `PascalCase` for types, and kebab-case for package and file names.
- Prefer pure transformations for normalization and compilation.
- Validate data at every persisted or transported boundary.
- Include `schemaVersion`, `runId`, and stable node identifiers in contracts.
- Comments explain constraints or provenance, not syntax.

## Testing Strategy

### Unit Tests

Test coordinate normalization, CSS parsing, text-run extraction, layout classification, component grouping, Figma property mapping, schema validation, and retry/idempotency logic. Package tests live beside source as `*.test.ts`.

### Fixture Integration Tests

Use deterministic local sites representing flex, grid, absolute overlays, typography, images, SVG, gradients, shadows, clipping, transforms, and nested scrolling. Assert artifact validity and selected semantic invariants rather than serialized snapshots alone.

### Plugin Contract Tests

Test scene validation, incompatible protocol rejection, idempotent operation handling, font/asset failures, dependency ordering, and structured import results without requiring a live user document for every test.

### End-to-End Tests

Run a local fixture through Chrome capture and the Figma import harness, export the created frame, and produce a QA report. A smaller manual smoke test in the Figma desktop application verifies real plugin behavior before release.

### Coverage Expectations

- At least 80% line and branch coverage for contracts, normalization, inference, and scene compilation.
- Every supported Figma node/property mapping has a fixture or contract test.
- Every fixed bug adds a regression test at the lowest useful level.

## Boundaries

### Always

- Validate URLs, schemas, protocol versions, assets, and plugin messages.
- Bind plugin transport to localhost and require a per-run connection token.
- Preserve raw observations separately from inferred decisions.
- Attach evidence and confidence to inferred layout/component decisions.
- Retain artifacts and structured diagnostics on partial failure.
- Run relevant tests, type checking, linting, and schema validation before completion.
- Treat webpage content and scripts as untrusted.

### Ask First

- Add or replace major dependencies after workspace initialization.
- Expand capture to authenticated, private, or multi-page content.
- Activate controls that may create external state or network side effects.
- Change persisted schemas or the plugin transport protocol after their first stable version.
- Change CI, release configuration, or the supported Node/Figma versions.
- Introduce a hosted service or third-party storage/model dependency.

### Never

- Circumvent authentication, paywalls, CAPTCHAs, or anti-bot controls.
- Store credentials, cookies, personal information, or page secrets in artifacts.
- Use the Figma REST API as a substitute for the plugin construction layer.
- Represent the imported page as one screenshot or rasterize ordinary text.
- Silently invent missing assets, fonts, unsupported effects, or inference certainty.
- Trigger purchases, submissions, account changes, downloads, uploads, or destructive controls without explicit authorization.
- Remove failing tests or weaken quality thresholds to make a run pass.

## Success Criteria

The MVP is complete when all of the following are demonstrated on the approved fixture suite:

1. One CLI command accepts a URL, viewport, and destination session and completes the end-to-end pipeline.
2. The pipeline persists schema-valid raw capture, Website IR, inference, Figma Scene, import result, and QA report artifacts.
3. The plugin creates an editable top-level frame containing supported text, frames, Auto Layout, raster images, SVG vectors, fills, strokes, corner radii, gradients, opacity, and shadows.
4. At least 98% of eligible visible fixture elements are created or explicitly classified with a structured unsupported reason.
5. No ordinary text is rasterized, and no complete page or major section is substituted with a screenshot.
6. All created scene nodes can be traced to source capture identifiers; all inferred layout decisions include evidence and confidence.
7. The reference export and Figma export use identical pixel dimensions, achieve SSIM >= 0.95, and have <= 5% changed pixels at a per-channel tolerance of 16 on the approved fixture suite.
8. Plugin retries do not duplicate already acknowledged nodes for the same operation identifiers.
9. Incompatible scene/protocol versions are rejected before any Figma document mutation.
10. A failed or partial run preserves completed artifacts and reports its failed stage and affected nodes.
11. Automated checks meet the stated coverage threshold and the real-Figma manual smoke test passes.

## Open Questions

None for MVP planning. New questions discovered during implementation must update this specification before changing scope or architecture.

## Approved Live Integration

Protocol 1.1.0 uses authenticated loopback WebSockets (CLI port 3847, explicitly
allowlisted in the development plugin manifest) with a bounded complete-scene
request, content-addressed base64 assets, a destination acknowledgement, and a
structured result plus PNG export. Protocol 1.0.0 remains available for legacy
contract tests but is rejected by the live importer. A plugin instance caches each
run request and result, including in-flight work, for bounded reconnect retries.
Closing/restarting the plugin requires a new CLI run; it never automatically
replays an interrupted import into a new plugin instance.

The CLI defaults to live import; `--capture-only` explicitly prepares artifacts
without connecting. It prints a short-lived connection descriptor for pasting into
the plugin; no token is persisted. Plugin results and PNGs are checked against the
run identity and exact scene membership. Captured full-page dimensions define the
export frame. Missing plugins, substitutions, unsupported features, and QA failure
produce a non-success exit status with retained artifacts.

Use pinned esbuild for an IIFE plugin bundle, official Figma TypeScript declarations
for runtime API checking, and pngjs for PNG decoding. JSON Schema validators used
inside Figma are generated at build time; the plugin does not compile code at runtime.
Pixel QA composites transparency on white, uses 8×8 luminance SSIM windows and the
approved channel tolerance and thresholds. Real Figma visual acceptance remains a
manual release gate, separate from the automated runtime harness.
