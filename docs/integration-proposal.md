# Live import integration — approved

The current 1.0.0 protocol only returns a completion status. It cannot carry the
validated scene envelope, asset bytes, import-result artifact, or PNG export.

Proposed protocol 1.1.0 adds a bounded `import-request` message containing the
existing scene artifact and content-addressed asset bytes, and an `import-result`
message containing the existing result artifact and a PNG export. Both messages
retain the run ID and require an authenticated localhost session. A destination
document/page identity is acknowledged before import. Duplicate requests for a
run return the cached result; disconnects use bounded retries. Incompatible peers
are rejected before document mutation. Existing persisted artifact schemas remain
1.0.0. No arbitrary Figma property execution is exposed.

Package the plugin as a browser-compatible bundle using esbuild, already present
transitively, declared as a direct pinned development dependency. Use a small
pinned PNG decoder dependency for server-side pixel QA rather than hand-writing a
PNG codec. Preserve the approved SSIM and changed-pixel thresholds.

Approved by the user. Implemented with esbuild 0.28.2, pngjs 7.0.0, and official
Figma API declarations 1.117.0. See getting-started.md for operation. The previous
assumption that esbuild was installed transitively was incorrect; it is now a
direct pinned dependency compatible with the existing Vite toolchain.
