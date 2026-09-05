# Implementation Plan: Website-to-Figma Agent Pipeline

## Status

The original MVP plan is implemented. The agentic inference milestone plan below is a Phase 2 draft for human review. Do not begin agentic implementation until that plan and its additions to `tasks/todo.md` are approved.

## Overview

Build the MVP as a sequence of tested vertical slices. Establish versioned contracts first, then prove browser capture through normalization and inference, compile the result into a Figma Scene, import it through a secure local plugin protocol, and finally wire the complete CLI and visual QA loop. Each checkpoint must leave the repository buildable and preserve structured artifacts on failure.

## Architecture Decisions

- Use an npm workspace monorepo so the CLI, plugin, and pipeline packages share types while retaining explicit boundaries.
- Treat JSON Schema as the persisted and transported source of truth; generate or maintain matching strict TypeScript types in the contracts package.
- Use Chrome DevTools Protocol for production capture and deterministic local fixture pages for integration tests.
- Store document-relative geometry and explicit coordinate-space metadata in raw capture to prevent scroll-offset ambiguity.
- Keep inference deterministic for MVP and expose a typed inference interface for later agent/model implementations.
- Compile Figma-specific values only after normalization and inference; browser extraction never emits Figma nodes.
- Bind WebSocket transport to loopback, authenticate each run with an ephemeral token, version every message, and make mutations idempotent by operation identifier.
- Build the Figma plugin importer behind an adapter so most behavior can be contract-tested outside the live Figma runtime.
- Report missing fonts and unsupported effects as partial results with stable source-node diagnostics.
- Compare like-sized exports using both SSIM and changed-pixel ratio; visual metrics locate discrepancies but do not override structural/editability requirements.

## Dependency Graph

```text
Workspace/tooling
  -> Artifact + protocol contracts
      -> Browser session + fixture harness
          -> Raw extraction + asset capture
              -> Website IR normalization
                  -> Layout/component inference
                      -> Figma Scene compiler
                          -> Local transport
                              -> Plugin importer
                                  -> CLI orchestration
                                      -> Visual QA
                                          -> End-to-end acceptance
```

The contract foundation is intentionally early because every independently testable slice depends on stable identifiers, diagnostics, and artifact envelopes.

## Implementation Phases

### Phase A: Executable Foundation

1. Scaffold the workspace and quality commands.
2. Define the artifact schemas and validation boundary.
3. Define the transport protocol and idempotency contract.

Checkpoint: all workspace commands run, valid fixtures pass schema validation, and invalid fixtures produce structured errors.

### Phase B: Browser-to-IR Slice

4. Establish deterministic local website fixtures and a CDP browser session.
5. Capture the DOM, text, visibility, styles, geometry, and source identifiers.
6. Capture screenshots, images, SVGs, and asset diagnostics within approved limits.
7. Normalize raw capture into browser-independent Website IR.

Checkpoint: one fixture URL produces valid `raw-capture.json` and `website-ir.json` with stable traceability and no Figma-specific fields.

### Phase C: IR-to-Scene Slice

8. Infer sections and layout modes with evidence, confidence, and geometry fallback.
9. Infer repeated components conservatively.
10. Compile core frames, text, shapes, hierarchy, and Auto Layout into a valid Figma Scene.
11. Compile images, SVG, gradients, strokes, radii, opacity, and supported effects with explicit fallbacks.

Checkpoint: fixture IR produces a deterministic, schema-valid scene covering every supported or classified source element.

### Phase D: Scene-to-Figma Slice

12. Implement the authenticated, versioned local transport session.
13. Implement plugin creation for core nodes and deterministic ordering.
14. Add fonts, assets, Auto Layout, component instances, advanced paints/effects, and partial-result diagnostics.

Checkpoint: a fixture scene imports without duplicate mutations on retry and exports from a real Figma Desktop smoke test.

### Phase E: End-to-End Product Slice

15. Wire CLI configuration, orchestration, limits, retries, artifact persistence, and completion reporting.
16. Implement visual QA metrics and discrepancy artifacts.
17. Add end-to-end acceptance coverage, plugin packaging, and operator documentation.

Checkpoint: the approved fixture suite meets all specification success criteria through the documented CLI command.

## Verification Strategy

- Every task runs its focused tests plus type checking for affected workspaces.
- Every checkpoint runs `npm run build`, `npm run typecheck`, `npm run lint`, `npm run validate:schemas`, and the tests available at that stage.
- Contract changes require compatibility fixtures and must update the specification before changing a stable schema or protocol.
- The final checkpoint adds `npm test -- --coverage`, `npm run test:integration`, `npm run test:e2e`, and `npm run package:plugin`.
- Real Figma mutation is reserved for explicit smoke-test checkpoints; most importer behavior uses an adapter test harness.

## Parallelization

After artifact and protocol contracts are approved and implemented:

- Browser extraction and plugin adapter work can proceed independently against shared fixtures.
- Layout inference and visual-QA metric work can proceed independently after Website IR types stabilize.
- Documentation and additional fixture authoring can proceed alongside implementation.

Sequential dependencies remain contracts before consumers, normalization before inference, scene compilation before live import, and complete orchestration before final end-to-end acceptance. Parallel contributors must not edit shared contracts without coordination.

## Risks and Mitigations

| Risk                                                           | Impact | Mitigation                                                                                          |
| -------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------- |
| Browser rendering cannot map exactly to Figma layout semantics | High   | Retain geometry, confidence, provenance, and editable freeform fallbacks                            |
| Text differs because browser and Figma font metrics diverge    | High   | Capture text runs precisely, load exact fonts when available, report substitutes, and test wrapping |
| Figma plugin runtime complicates automated tests               | High   | Isolate creation behind an adapter and reserve live Figma for bounded smoke tests                   |
| Plugin retry duplicates document nodes                         | High   | Use operation IDs, acknowledgements, persisted run state, and idempotency tests                     |
| Large or adversarial pages exhaust time or memory              | High   | Enforce URL, node, height, artifact, and duration limits at stage boundaries                        |
| SVG/CSS effects are unsupported or lossy                       | Medium | Maintain capability classification and structured approximation diagnostics                         |
| Asset URLs expire or reject cross-origin access                | Medium | Capture bytes during the browser stage where authorized and record retrieval failures               |
| Visual metric rewards flattened but uneditable output          | Medium | Gate visual quality alongside structural traceability and rasterization checks                      |
| Shared schemas churn during parallel work                      | Medium | Stabilize contracts early, use compatibility fixtures, and require coordinated version changes      |

## Original MVP Planning Gate

- [x] Human approved the original architecture and implementation order.
- [x] Human approved the original task decomposition in `tasks/todo.md`.
- [x] Task 1 began using incremental implementation and test-driven development.

## Open Questions

None. Implementation discoveries that would alter scope, stable contracts, dependencies, or quality thresholds return to the specification gate.

## Agentic Inference Milestone Plan

### Overview

Add a provider-neutral agentic refinement layer to the working deterministic
website-to-Figma pipeline. The local Codex CLI is the first provider. It receives
bounded, sanitized evidence and returns schema-constrained decisions that are
validated and merged with deterministic inference. The plugin supports up to three
idempotent candidate revisions so QA can select the best editable result over one
authenticated connection.

### Architecture Decisions

- Keep raw capture and Website IR immutable; agent decisions live only in a revised
  inference artifact and downstream scene revisions.
- Add a provider-neutral `InferenceProvider` boundary before implementing Codex.
- Invoke Codex with `spawn`, explicit arguments, stdin, read-only sandboxing,
  ephemeral sessions, an output schema, and bounded time/output. Do not invoke a shell.
- Keep deterministic inference mandatory and merge valid agent decisions per property.
- Version inference artifacts independently enough to read existing 1.0 artifacts
  while writing the new revision for agentic runs.
- Revise the live protocol once for candidate revision, render result, and finalization
  messages; validate every message before Figma mutation.
- Preserve protocol idempotency with `(runId, revision)` and restrict replacement or
  cleanup to nodes carrying matching run ownership metadata.
- Use structural QA before pixel metrics and retain the best valid candidate, with a
  maximum of three renders including the baseline.
- Keep `--inference agentic` opt-in until the acceptance checkpoint passes, then make
  it the default while retaining `--inference deterministic`.

### Dependency Graph

```text
Inference schema revision ──┬──> provider interface ──> Codex adapter
                            └──> proposal validation and merge

Candidate protocol revision ──> plugin revision lifecycle ──> live transport

Validated proposal + domain policies
  ├──> layout, naming, responsive intent
  ├──> components and carousel interpretation
  ├──> typography and fallback selection
  └──> structural QA prioritization
          └──> enriched scene compilation
                  └──> bounded correction loop
                          └──> CLI, reports, acceptance, default rollout
```

Contracts precede all consumers. The Codex adapter and domain-policy slices can
proceed independently after the provider and proposal contracts stabilize. Protocol
and plugin revision work can proceed alongside domain policies, but correction-loop
integration waits for both streams.

### Implementation Phases

#### Phase F: Agent Contracts and Provider Boundary

1. Revise the inference artifact schema with typed, provider-neutral decision payloads,
   rejection records, merge provenance, and backward-compatible readers.
2. Define the provider request/result interface, bounded input builder, and deterministic
   fake provider contract tests.
3. Implement the local Codex adapter with process isolation, JSON-schema output,
   time/output limits, usage parsing, and structured failures.
4. Validate proposals against source identity, geometry, hierarchy, rasterization, and
   run-budget policies; merge valid properties over the deterministic baseline.

Checkpoint F: fake and Codex adapters satisfy the same contract, invalid output falls
back deterministically, existing deterministic imports remain unchanged, and contract,
inference, build, typecheck, lint, and schema checks pass.

#### Phase G: Agentic Design-Intent Slices

5. Add layout reconstruction, semantic naming, and responsive-intent decisions with
   geometry-tolerance enforcement.
6. Add conservative component discovery and carousel interpretation with unique-panel
   identity and evidence-based clone suppression.
7. Add typography matching/metric compensation and scoped media-fallback decisions.
8. Add localized structural QA classification and candidate-ranking rules that separate
   actionable defects from rendering noise.
9. Compile accepted agent decisions into editable scene layout, names, components,
   instances, constraints, visibility, typography, and fallbacks.

Checkpoint G: ambiguous fixtures demonstrate each decision family, rejected decisions
fall back locally, carousel panels remain editable, ordinary text never rasterizes, and
the fixture suite has no deterministic regression.

#### Phase H: Iterative Candidate Rendering

10. Define protocol 1.2 candidate, render-result, finalization, and cancellation messages
    with revision validation and compatibility failure messages.
11. Implement plugin-owned candidate creation, replacement, export, selection, cleanup,
    and retry idempotency without touching user-owned layers.
12. Extend live transport to exchange multiple bounded revisions over one authenticated
    connection and preserve the last complete candidate on interruption.
13. Implement the correction-loop state machine with three-render maximum, best-candidate
    selection, no-improvement detection, provider failure fallback, and complete history.

Checkpoint H: a fake-provider end-to-end run imports, evaluates, revises, finalizes, and
retains the correct candidate over one connection; retry and disconnect tests prove
idempotency and ownership safety.

#### Phase I: Deployable Frontend-Development Workflow

14. Add CLI mode/provider/budget options, orchestration, human-readable progress,
    inference artifacts, correction history, usage reporting, and recovery guidance.
15. Add agentic fixture acceptance, local-Codex and real-Figma smoke procedures,
    operator documentation, limitations, and the guarded switch to agentic-by-default.

Checkpoint I: all approved success criteria and root checks pass, deterministic mode
remains available, a public-site import passes human QA, and a fresh frontend developer
can run the documented workflow without hidden setup steps.

### Verification Checkpoints

At every task, run focused tests plus type checking for affected packages. At each
phase checkpoint, run:

```bash
npm run build
npm run typecheck
npm run lint
npm run format:check
npm test
npm run validate:schemas
```

At Checkpoints H and I, also run:

```bash
npm run test:coverage
npm run test:integration
npm run test:e2e
npm run package:plugin
```

The local-Codex smoke test is explicit and excluded from ordinary automated tests so
CI and contributors do not require local authentication. The final release gate also
requires a real Figma Desktop run and recorded human visual assessment.

### Risks and Mitigations

| Risk                                               | Impact | Mitigation                                                                                            |
| -------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------- |
| Agent output is plausible but structurally invalid | High   | Closed schemas, source-ID validation, property policies, and per-decision fallback                    |
| Webpage content attempts prompt injection          | High   | Minimal trusted prompt, explicit untrusted-data framing, no tools, read-only ephemeral Codex process  |
| Candidate revisions damage user layers             | High   | Run ownership metadata, validate-before-mutate, revision idempotency, ownership tests                 |
| Model latency or cost makes the tool impractical   | High   | Section partitioning, three-render cap, configurable budgets, usage reporting, deterministic fallback |
| Pixel optimization harms editability               | High   | Structural gates precede metrics; prohibit text/section rasterization                                 |
| Component inference merges meaningful variants     | Medium | Conservative thresholds, explicit overrides, evidence, independent-node fallback                      |
| One viewport overstates responsive certainty       | Medium | Label intent as inferred, retain confidence/evidence, do not claim viewport validation                |
| Protocol migration strands an older plugin         | Medium | Explicit version rejection and setup documentation requiring rebuilt plugin reload                    |
| Codex CLI behavior changes                         | Medium | Adapter contract, executable capability check, fake-process tests, structured unsupported diagnostic  |

### Planning Gate

- [ ] Human approves this architecture, dependency order, checkpoints, and rollout.
- [ ] Human approves Tasks 18–32 in `tasks/todo.md`.
- [ ] Only then begin Task 18 with incremental implementation and test-driven development.

### Open Questions

None. The plan implements the approved specification without adding another provider,
hosted service, viewport, interaction mode, or website-generation stage.
