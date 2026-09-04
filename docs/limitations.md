# MVP limitations

- The current CLI persists raw capture, Website IR, inference, and Figma Scene artifacts; live plugin-session orchestration and QA artifact persistence remain integration work.
- Visual comparison currently provides deterministic exact-byte classification; production PNG decoding and pixel-level SSIM are still required for the approved visual threshold.
- Browser extraction uses Playwright-managed Chrome in the CLI adapter. Chrome DevTools MCP is available for agent-side inspection and smoke checks, but is not a runtime dependency.
- Missing fonts are substituted deterministically with Inter and reported as partial diagnostics.
- Canvas, video, WebGL, unsupported SVG/CSS effects, and inaccessible cross-origin frames are classified or omitted with diagnostics.
- A real Figma Desktop smoke test was not runnable in this environment; the in-memory adapter contract tests are the available substitute.
