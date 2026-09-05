# Figma Desktop acceptance check

Follow [getting started](getting-started.md) to build and load the development
plugin in a disposable destination page.

1. Run the CLI against a public authorized page and connect the plugin using its
   temporary descriptor. Confirm the destination label before importing.
2. Confirm text is editable, image fills resolve, SVGs remain vectors, and the
   imported frame retains source-node plugin data. Inspect the reported font
   substitutions and geometry fallbacks.
3. Verify all six artifacts are valid, `figma.png` exists, the export dimensions
   match `reference.png`, and the QA report contains measured values.
4. Disconnect/reconnect the transport without restarting the plugin. Confirm one
   frame remains and acknowledged work is not duplicated.
5. Confirm a missing plugin times out with retained artifacts and a partial exit.
6. A release acceptance pass requires SSIM ≥0.95, changed pixels ≤5% at tolerance
   16, ≥98% of eligible elements imported or explicitly unsupported, and no
   rasterized ordinary text or flattened page sections.

Record the document/page, source URL, run directory, metrics, node/font/asset
results, and any discrepancies. This check has not been marked passed merely
because the automated runtime harness passes.
