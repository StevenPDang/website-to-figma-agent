# Spec: Website-to-Figma Agent Pipeline

## Status

Implementation and live integration approved on 2026-09-04. Protocol 1.1.0 and pinned bundling/PNG dependencies approved by the user.

## Assumptions

1. This repository will contain a local developer tool, not a hosted product or user-facing web application.
2. A TypeScript CLI coordinates Chrome extraction, inference stages, artifacts, and communication with a Figma plugin.
3. The Figma plugin is open in the destination document during import and is the only component that mutates the Figma document.
4. The MVP processes one publicly reachable page at one desktop viewport per run.
5. Visual fidelity takes priority when reliable semantic layout inference is impossible, but the result must remain layer-editable.
6. Interaction variants, multi-page crawling, and Figma-to-code round-tripping are post-MVP capabilities. The agentic inference milestone adds responsive intent inference and automatic visual correction for the captured desktop frame.
7. Agent inference uses a provider-neutral adapter. The first provider invokes the locally installed Codex agent; persisted contracts must not contain Codex-specific fields.
8. Only content the user is authorized to access and reproduce is in scope.

## Approved MVP Defaults

- Visual QA uses both SSIM and changed-pixel ratio. Initial fixture acceptance thresholds are SSIM >= 0.95 and changed pixels <= 5% at a per-channel tolerance of 16; thresholds may be tightened using baseline evidence without weakening this floor.
- Only public, unauthenticated URLs are supported.
- The plugin targets Figma Desktop first.
- Layout and component inference begins with deterministic heuristics behind a pluggable inference interface; external model calls are not required for the MVP.
- A run supports at most 15,000 captured DOM nodes, 30,000 CSS pixels of document height, 500 MB of artifacts, and 10 minutes of wall-clock time.
- An unavailable original font produces a partial result with an explicit, deterministic substitute and diagnostic.
- Before capture, high-confidence cookie or consent overlays may be hidden locally, together with an identified backdrop, without activating controls or persisting consent. Every suppression is reported as a diagnostic.

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

## Agentic Inference Milestone — Phase 1 Draft

### Status and Approval Gate

This section specifies the next milestone and is awaiting human review. Do not
update `tasks/plan.md`, update `tasks/todo.md`, change stable schemas or protocols,
or implement this milestone until this section is approved.

Approval of this section explicitly approves:

- an additive inference artifact schema revision;
- a backward-incompatible live protocol revision for bounded candidate-render
  iterations;
- invoking the user's locally authenticated Codex CLI as the first inference
  provider; and
- retaining the deterministic inference path as a supported fallback.

### Objective

Turn the existing deterministic converter into a deployable agentic tool for
frontend development. A frontend developer supplies an authorized public webpage,
connects the Figma plugin once, and receives an editable, semantically organized
Figma reconstruction. The local agent resolves design intent that browser geometry
does not fully encode and iteratively corrects meaningful visual discrepancies.

The pipeline remains useful without a model. Deterministic capture, normalization,
inference, compilation, import, and QA establish a reproducible baseline. Agentic
inference refines that baseline through validated structured proposals; it never
replaces raw browser facts or emits executable project code.

### User Workflow and Commands

The milestone extends the existing CLI without removing current behavior:

```bash
# Agentic import using the configured provider; Codex is initially the default.
node apps/cli/dist/src/index.js import https://example.com --inference agentic

# Reproducible deterministic fallback with no model invocation.
node apps/cli/dist/src/index.js import https://example.com --inference deterministic

# Agentic capture and inference without Figma mutation or render correction.
node apps/cli/dist/src/index.js import https://example.com --capture-only --inference agentic

# Repository verification.
npm run build
npm run typecheck
npm run lint
npm run format:check
npm test
npm run test:coverage
npm run test:integration
npm run test:e2e
npm run validate:schemas
npm run package:plugin
```

The connector JSON still appears before browser navigation. One authenticated plugin
connection remains open through capture, baseline import, candidate renders, final
selection, and QA reporting. Agentic mode becomes the product default only after the
milestone acceptance suite passes; until then it requires `--inference agentic`.

### Architecture and Stage Order

```text
Authenticated plugin connection
  -> deterministic browser capture and Website IR
  -> deterministic baseline inference
  -> provider-neutral agent inference request
  -> local Codex adapter (read-only, ephemeral execution)
  -> schema-validated inference proposal
  -> policy validation and deterministic merge
  -> candidate Figma Scene
  -> plugin candidate render and PNG export
  -> structural and pixel QA
  -> bounded agent correction loop
  -> best valid editable scene committed in Figma
  -> inference, import, QA, and run-report artifacts
```

The provider boundary is an internal typed interface:

```ts
export interface InferenceProvider {
  readonly providerId: string;
  infer(request: AgentInferenceRequest): Promise<AgentInferenceResult>;
}

export type AgentInferenceResult =
  | { ok: true; proposal: AgentInferenceProposal; usage?: InferenceUsage }
  | { ok: false; diagnostic: Diagnostic };
```

The interface contains project-domain inputs and outputs only. Provider-specific
process events, model names, session identifiers, and authentication details remain
inside the adapter and must not enter persisted inference or scene contracts.

The Codex adapter invokes `codex exec` through an argument array rather than a shell.
It uses ephemeral, read-only execution, a generated JSON output schema, bounded time
and output size, and a minimal prompt assembled from trusted repository instructions.
The agent receives sanitized artifact data and reference/candidate images. Webpage
text is delimited as untrusted data and cannot alter the task or tool policy.

### Agent Inputs

Each request contains only the evidence needed for its pass:

- run identity, viewport, stage, pass number, and remaining correction budget;
- normalized Website IR with stable source IDs and captured geometry/styles;
- deterministic inference decisions with evidence, confidence, and fallback;
- asset metadata without auth tokens, cookies, or unrelated page data;
- relevant capture/import diagnostics;
- the reference PNG and, for correction passes, the candidate PNG;
- localized discrepancy regions and structural QA findings; and
- the capabilities and invariants the proposal validator will enforce.

Large pages are partitioned by inferred section. Shared global evidence such as font
availability, viewport, design tokens, and component fingerprints is supplied once.
Requests must remain within configurable byte, time, pass, and model-usage budgets.

### Agent Output and Validation

The agent returns a declarative proposal, never source code, shell commands, Figma
API calls, or arbitrary CSS. The additive inference schema supports these decision
kinds:

- `section`: semantic boundaries and section roles;
- `layout`: row, column, wrap, grid, freeform, overlay, alignment, padding, and gap;
- `component`: component sets, instance membership, and allowed overrides;
- `carousel`: viewport, ordered visible panels, loop-clone suppression, and clipping;
- `typography`: family fallback, weight/style preservation, wrapping, and metric compensation;
- `semantic-name`: stable human-readable layer and component names;
- `responsive`: fill, hug, fixed, min/max, alignment, and inferred constraints;
- `fallback`: editable representation or scoped raster fallback for unsupported media;
- `qa-priority`: structural discrepancy classification and correction priority; and
- `token`: reusable colors, typography, spacing, radii, and effects.

Every decision includes stable decision and source IDs, confidence, concise evidence,
the proposed values, and a deterministic fallback. The validator rejects proposals
that reference unknown nodes, create cycles, exceed geometry bounds, contain unknown
properties, rasterize ordinary text or major sections, suppress unique visible
content without evidence, or violate run budgets. Invalid decisions fall back
individually; one invalid decision does not discard an otherwise valid proposal.

The merged inference artifact preserves deterministic and agent decisions separately,
records which proposal won for each property, and makes conflicts inspectable. Raw
capture and Website IR remain immutable.

### Required Inference Capabilities

#### Layout reconstruction

Infer Auto Layout, grid-like rows and columns, wrapping, alignment, padding, gaps,
and intentional overlays from CSS plus measured geometry. Agent decisions may replace
freeform geometry only when the reconstructed bounds remain within declared tolerance.

#### Component discovery

Group repeated cards, navigation items, buttons, testimonials, footer groups, and
other repeated structures. A component requires multiple materially similar
structures, a stable root, declared instance overrides, and evidence that meaningful
differences will survive conversion. Low-confidence groups remain independent.

#### Visual correction

Classify discrepancy regions before proposing changes. Correction may adjust inferred
layout, wrapping, sizing, clipping, layer order, typography compensation, visibility,
or fallback selection. It cannot apply unexplained per-site offsets. The loop runs a
maximum of three candidate renders including the baseline and stops on automated pass,
no structural defects plus human acceptance, no measurable improvement, invalid output,
or exhausted time/model budget. The pipeline retains the best valid candidate.

#### Carousel interpretation

Identify the carousel viewport and unique logical panels, remove duplicated loop
clones, retain the panel order visible at capture time, preserve viewport clipping,
and keep each panel independently editable. Hidden or off-viewport clones require
structural and asset evidence before suppression.

#### Typography matching

Prefer an exact available face. Otherwise select a deterministic substitute with the
closest available weight and style, then compensate line breaking and bounds using
captured line geometry. Text remains editable and its original requested family is
retained as provenance.

#### Semantic layer naming

Assign concise role-based names such as `Hero`, `Featured Work`, `Project Card`, and
`Primary CTA`. Names must be stable for identical input and must not include secrets,
prompt text, model commentary, or unexplained marketing interpretation.

#### Responsive intent

Infer fill, hug, fixed, min/max, alignment, and anchoring constraints from CSS and the
single captured viewport. These are labeled as inferred intent with confidence, not
validated responsive behavior. Generating additional responsive frames remains out
of scope until multi-viewport capture is approved.

#### Fallback decisions

Choose editable approximations for supported content and scoped raster fallbacks for
video, canvas, WebGL, inaccessible frames, or complex animation states. Fallbacks are
limited to the smallest meaningful media region. Ordinary text, full pages, and major
content sections cannot be rasterized.

#### QA prioritization

Separate rendering noise such as antialiasing and known font rasterization differences
from missing content, overlaps, clipping, hierarchy, ordering, and large geometry drift.
Structural defects take priority over aggregate similarity scores. Human acceptance is
recorded separately and does not weaken automated fixture thresholds.

### Candidate Render Protocol

The current one-request protocol cannot support automatic visual correction. The
milestone introduces a new protocol version with a bounded candidate lifecycle:

1. CLI sends a candidate scene with `runId` and monotonically increasing `revision`.
2. Plugin validates the complete scene before mutation.
3. Plugin creates or replaces only nodes owned by that run and revision.
4. Plugin exports the candidate PNG and returns structured import diagnostics.
5. CLI evaluates QA and either sends the next revision or a finalization message.
6. Plugin retains the selected revision and removes other run-owned candidates.

Retries for the same run and revision are idempotent. The plugin never removes or
changes user-owned layers. Disconnects preserve the most recent complete candidate
and require an explicit new run after bounded reconnect attempts.

### Project Structure

```text
packages/inference/src/provider.ts          Provider-neutral interface and result types
packages/inference/src/agent-input.ts       Sanitized, bounded request construction
packages/inference/src/proposal.ts          Proposal validation and deterministic merge
packages/inference/src/codex-provider.ts    Local Codex process adapter
packages/inference/src/correction-loop.ts   Candidate selection and stop policy
packages/contracts/                         Versioned inference and protocol schemas
packages/figma-scene/                       Agent-decision compilation
packages/visual-qa/                         Structural classification and localized diffs
apps/cli/                                   Mode, provider, budgets, and orchestration
apps/figma-plugin/                          Candidate revision import/finalization
tests/fixtures/sites/                       Ambiguous layout/component/carousel fixtures
```

Tests remain beside package source unless they cross package boundaries.

### Code Style

Provider adapters return explicit results and never leak process exceptions into
pipeline control flow:

```ts
export async function runAgentInference(
  provider: InferenceProvider,
  request: AgentInferenceRequest,
): Promise<AgentInferenceResult> {
  const result = await provider.infer(request);
  return result.ok ? validateProposal(result.proposal, request) : result;
}
```

Use strict TypeScript, named exports, pure transformations for request construction,
validation, merging, and candidate selection, plus stable IDs and exhaustive unions.

### Testing Strategy

- Unit tests validate request sanitization, output schemas, policy rejection, merge
  precedence, clone detection, component grouping, typography compensation, naming,
  responsive constraints, QA classification, and correction stop conditions.
- Provider contract tests run a deterministic fake provider through the same interface;
  ordinary test suites do not require Codex authentication or network access.
- Codex adapter tests use a fake executable to verify argument isolation, stdin framing,
  timeouts, output limits, malformed output, and process termination.
- Fixture integration tests compare deterministic and agentic semantic invariants for
  ambiguous flex/grid, overlays, repeated components, carousels, and typography.
- Protocol tests cover candidate revision validation, idempotent retries, disconnects,
  finalization, and cleanup of run-owned candidates.
- End-to-end tests execute the bounded correction loop with a fake provider and Figma
  harness. A separately invoked local-Codex smoke test and real-Figma smoke test form
  the release gate.
- Coverage remains at least 80% line and branch coverage for contracts, normalization,
  inference, proposal validation, scene compilation, and correction policy.

### Boundaries

#### Always

- Run deterministic inference first and retain it as fallback evidence.
- Validate agent input and output at the provider boundary and again before persistence.
- Execute Codex ephemerally with a read-only sandbox and bounded resources.
- Preserve raw observations, source IDs, agent evidence, rejected decisions, and the
  best valid candidate for debugging.
- Prefer structural correctness and editability over metric-only improvements.
- Report provider identity, duration, pass count, and token usage when available without
  persisting authentication or private Codex configuration.

#### Ask First

- Add another model provider or a hosted inference service.
- Change stable inference schemas or candidate-render protocol after this milestone is approved.
- Increase correction passes or resource budgets beyond approved defaults.
- Expand capture to additional viewports, interaction states, private pages, or website generation.

#### Never

- Treat webpage text, metadata, images, diagnostics, or model output as executable instructions.
- Give the inference subprocess write access to source code, Figma, browser controls, credentials,
  cookies, connection tokens, or unrelated artifacts.
- Accept unvalidated agent output or silently replace failed agent output with invented values.
- Optimize SSIM by flattening ordinary text, unique content, complete pages, or major sections.
- Allow a candidate revision to mutate or remove layers not owned by its run.

### Success Criteria

The milestone is complete when all of the following are demonstrated:

1. `--inference agentic` invokes the provider-neutral interface with local Codex as the
   initial adapter, while deterministic mode performs no model invocation.
2. Missing Codex, timeout, malformed output, invalid decisions, and budget exhaustion
   produce structured diagnostics and a valid deterministic fallback result.
3. All persisted agent decisions validate against the revised inference schema, cite
   existing source nodes, include evidence/confidence, and remain provider-neutral.
4. Approved ambiguous-layout fixtures produce correct layout classifications and Figma
   Auto Layout or grid-like editable structures without exceeding geometry tolerances.
5. Repeated-component fixtures produce reusable components and instances while near-matches
   preserve declared overrides and unrelated nodes remain independent.
6. Carousel fixtures import one editable panel per unique logical item, preserve ordering
   and clipping, and omit proven loop clones.
7. Typography fixtures preserve expected line count and avoid text overlap when the original
   font is unavailable; original font intent remains traceable.
8. Every eligible imported layer has a stable semantic name or a deterministic fallback name.
9. Responsive decisions contain constraints, confidence, and evidence and are never reported
   as multi-viewport validation.
10. Raster fallbacks remain scoped to eligible unsupported media and structural tests prove
    that ordinary text and major sections remain editable.
11. QA classification identifies seeded missing assets, overlaps, clipping, ordering, and
    geometry drift while deprioritizing seeded antialiasing-only differences.
12. The candidate protocol completes up to three idempotent revisions over one authenticated
    plugin connection, retains the best valid result, and never alters user-owned layers.
13. The approved fixture suite continues to meet SSIM >= 0.95 and changed pixels <= 5%, with
    no structural or editability regression from deterministic mode.
14. A real public-site smoke test is judged usable by human visual QA and produces a readable
    report containing decisions, rejected proposals, correction history, diagnostics, and usage.
15. All documented build, test, coverage, schema, integration, end-to-end, and plugin packaging
    commands pass before agentic mode becomes the default.

### Open Questions

None. The provider-neutral adapter, local Codex implementation, staged rollout, three-render
limit, deterministic fallback, schema revision, and candidate-render protocol are proposed for
approval as one milestone. Discoveries that change these contracts return to this gate.

## Approved Live Integration

Protocol 1.1.0 uses authenticated loopback WebSockets (CLI port 3847, explicitly
allowlisted as `http://localhost:3847` in the development plugin manifest) with a bounded complete-scene
request, content-addressed base64 assets, a destination acknowledgement, and a
structured result plus PNG export. Protocol 1.0.0 remains available for legacy
contract tests but is rejected by the live importer. A plugin instance caches each
run request and result, including in-flight work, for bounded reconnect retries.
Closing/restarting the plugin requires a new CLI run; it never automatically
replays an interrupted import into a new plugin instance.

The CLI defaults to live import; `--capture-only` explicitly prepares artifacts
without connecting. It prints a short-lived connection descriptor for pasting into
the plugin, then waits for an authenticated plugin connection before navigating to
or capturing the source page; no token is persisted. Plugin results and PNGs are
checked against the run identity and exact scene membership. Captured full-page
dimensions define the export frame. Missing plugins, substitutions, unsupported
features, and QA failure produce a non-success exit status with retained artifacts.

Use pinned esbuild for an IIFE plugin bundle, official Figma TypeScript declarations
for runtime API checking, and pngjs for PNG decoding. JSON Schema validators used
inside Figma are generated at build time; the plugin does not compile code at runtime.
Pixel QA composites transparency on white, uses 8×8 luminance SSIM windows and the
approved channel tolerance and thresholds. Real Figma visual acceptance remains a
manual release gate, separate from the automated runtime harness.
