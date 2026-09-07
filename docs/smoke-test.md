# Agentic acceptance checks

Follow [getting started](getting-started.md) from the repository root.

## Local Codex capture check

1. Run `codex login`, then build the workspace and plugin.
2. Run an authorized fixture with `--capture-only --inference agentic`.
3. Confirm `inference.json` uses schema 1.1.0,
   `deterministic-inference.json` remains present, and
   `correction-history.json` names `local-codex` and reports token usage when
   Codex provides it.
4. Repeat with an unavailable executable or deliberately small timeout through
   the provider test harness. Confirm the run remains partial with a valid
   deterministic fallback and structured provider diagnostic.

## Figma Desktop acceptance check

Load the rebuilt development plugin in a disposable destination page.

1. Run an authorized public page with `--inference agentic`, paste its temporary
   descriptor into the plugin, and confirm the destination label.
2. Confirm text is editable, image fills resolve, SVGs remain vectors, and the
   imported frame retains source-node and candidate-ownership plugin data.
3. Confirm each candidate appears once. Disconnect and reconnect without
   restarting the plugin and verify acknowledged revisions are not duplicated.
4. Confirm finalization retains the selected candidate, removes only other roots
   carrying the same run ownership, and leaves pre-existing layers untouched.
5. Confirm a provider or render failure retains the latest complete candidate
   and produces actionable recovery guidance.
6. Verify the canonical artifacts and candidate history are valid, `figma.png`
   exists, export dimensions match `reference.png`, and QA contains measurements.
7. A strict automated pass requires SSIM ≥0.95, changed pixels ≤5% at tolerance
   16, at least 98% of eligible elements imported or explicitly unsupported, and
   no rasterized ordinary text or flattened page sections.

Record the document/page, source URL, run directory, selected revision, stop
reason, metrics, node/font/asset results, token usage, and discrepancies.
Automated harness results do not replace this real-Figma review.

## Phase I verification record — 2026-09-06

The local Codex adapter was exercised against the existing Remedy Editorial
capture from run `run:f57577e2-b104-46b2-b8bd-82df04580217`. The first attempt
returned `CODEX_INVALID_OUTPUT`; its raw proposal was not retained, so its exact
validation failure cannot be reconstructed. Validation diagnostics now include
field paths and reasons.

A bounded retry against the same captured evidence produced 23 schema-valid
decisions. Policy rejected one; the merged inference and compiled scene both
passed artifact validation. Reported usage was 515,939 input tokens and 2,838
output tokens (518,777 total). This is provider-reported usage, not a cost estimate.
Evidence is in the ignored local directory `.artifacts/phase-i-codex-smoke-3/`
under `provider-retry*.json`; the original failed run report remains intact.

Synthetic CLI integration covers both one and three candidate revisions,
finalization of the selected revision, measured PNG QA, and aggregated usage.
Root build, typecheck, lint, format check, tests, coverage, integration,
end-to-end, schema validation, and plugin packaging passed. The coverage run
passed 177 tests across 45 files; all required package line/branch thresholds
passed. Aggregate coverage was 83.38% lines and 73.21% branches (the configured
80% gate applies to the required packages, not the aggregate).
The connected Chrome session contained only `about:blank`, so no real-Figma
agentic visual review was performed. Native enriched-scene behavior and the
remaining release criteria must be verified before enabling agentic by default.

## Existing human visual baseline

The Remedy Editorial deterministic import was judged usable by human review at
SSIM 0.9080 and 6.20% changed pixels despite missing the strict automated pixel
threshold. This remains useful visual evidence for the importer, but it does not
count as the required agentic real-Figma smoke run or authorize making agentic
mode the default.
