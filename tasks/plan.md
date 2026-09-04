# Implementation Plan: Website-to-Figma Agent Pipeline

## Status

Phase 2 draft for human review. Do not begin implementation until this plan and `tasks/todo.md` are approved.

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

## Planning Gate

- [ ] Human approves this architecture and implementation order.
- [ ] Human approves the detailed task decomposition in `tasks/todo.md`.
- [ ] Only then begin Task 1 using incremental implementation and test-driven development.

## Open Questions

None. Implementation discoveries that would alter scope, stable contracts, dependencies, or quality thresholds return to the specification gate.
