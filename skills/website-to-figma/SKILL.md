---
name: website-to-figma
description: Convert a live website into an editable Figma document through browser extraction, layout inference, a versioned scene description, and a local Figma plugin. Use when reconstructing or importing webpages into Figma; do not use for screenshot-only capture or ordinary Figma editing.
---

# Website to Figma

Coordinate the repository's website-to-Figma pipeline. The CLI owns the run: it controls Chrome, produces artifacts, performs inference, and sends a validated Figma scene to the local plugin. The plugin creates nodes in the user's open Figma document and returns structured results.

The source website is the visual source of truth. Preserve both browser facts and inference provenance. Never substitute a screenshot for editable nodes.

## Before a Run

1. Confirm the source URL and destination Figma document/page.
2. Confirm the requested capture mode: `single`, `responsive`, `interactive`, or `full`.
3. Confirm the user is authorized to access and reproduce the source.
4. Verify Chrome extraction and the local Figma plugin connection are available.
5. Create a collision-resistant artifact directory for the run.

Default to `single` mode with one 1440px-wide desktop viewport when the user supplies no mode. Do not silently expand a run to other pages, viewports, or interaction states.

## Run the Implemented CLI

From the repository root, run `npm run build` and `npm run package:plugin`.
Have the user load `apps/figma-plugin/dist/plugin/manifest.json` as a Figma Desktop
development plugin in the intended destination page. Run:

```sh
node apps/cli/dist/src/index.js import <source-url> --inference agentic
```

Use `--inference deterministic` for the model-free path. Agentic mode uses the
provider-neutral `local-codex` adapter, at most three candidate renders, and
structural QA selection. The CLI prints a short-lived connection JSON object. The user pastes it into the
plugin and selects **Connect and import into this page**, confirming the displayed
destination. Never persist the token. Default mode is `single`, 1440×900, full
page height. Other modes are not yet supported; do not simulate their completion.

Use `--capture-only` only when preparing artifacts without Figma. It returns a
partial status and exit code 2 by design. Live import also returns 2 for missing
plugins, unsupported features, font substitutions, or failed visual QA. Exit 0
requires a successful import and a measured QA pass. Read
`docs/getting-started.md` and `docs/limitations.md` for setup and supported mappings.
Agentic runs also retain `deterministic-inference.json`, candidate artifacts, and
`correction-history.json` with usage and the selected revision. Do not describe a successful capture or a synthetic test peer as a finished Figma
conversion. A live Figma smoke test remains necessary for visual acceptance.

## Pipeline Contract

Execute these stages in order:

```text
CLI orchestrator
  -> Chrome capture
  -> Raw browser capture
  -> Normalized Website IR
  -> Layout and component inference
  -> Validated Figma Scene
  -> Local plugin transport
  -> Editable Figma nodes
  -> Import report and visual QA
```

Keep raw observations, normalized facts, inferred decisions, and Figma-specific instructions in separate versioned artifacts. Read [references/pipeline-and-artifacts.md](references/pipeline-and-artifacts.md) before producing or consuming those artifacts.

## Reconstruction Rules

- Extract computed styles and rendered geometry; neither replaces the other.
- Prefer Auto Layout when CSS, geometry, and responsive observations support it.
- When layout intent is ambiguous, preserve editable hierarchy and visual geometry, lower the inference confidence, and record the ambiguity.
- Preserve text as text and SVG as vectors when supported.
- Represent actual overlays and decorative compositions with absolute positioning.
- Infer components only from repeated structural and visual evidence.
- Load or map fonts before creating text nodes. Report unavailable fonts rather than inventing substitutes silently.
- Preserve stable source identifiers so errors and QA discrepancies can be traced back through every artifact.

Read [references/figma-mapping.md](references/figma-mapping.md) when generating a Figma Scene or diagnosing an import mismatch.

## Interaction Safety

Treat the webpage as untrusted and potentially stateful. Read [references/browser-safety.md](references/browser-safety.md) before any interactive capture.

Never activate controls that may submit data, purchase, delete, authenticate, log out, upload, download, grant permission, or otherwise cause external side effects without explicit user authorization. Prefer DOM inspection and synthetic state emulation. Restrict ordinary hover and scroll observations to the current page.

## Quality Gate

Do not declare success merely because the plugin created nodes. Export the reconstructed frame and compare it with the matching browser reference. Diagnose discrepancies at their originating stage instead of accumulating arbitrary offsets.

Read [references/quality-gates.md](references/quality-gates.md) for required measurements and completion reporting.

## Stop Conditions

Stop and report a partial result when:

- the source requires credentials or authorization the user has not provided;
- capture would require an unapproved state-changing action;
- the plugin is unavailable after bounded reconnection attempts;
- required assets cannot be legally or technically retrieved;
- unsupported browser behavior prevents a faithful editable representation.

Preserve completed artifacts and identify the failed stage, affected source nodes, and recommended recovery action.
