# Current limitations

The live CLI/plugin transport, packaged Figma controller/UI, asset bytes, PNG
export, and measured visual QA are implemented. Real Figma Desktop visual
acceptance has not yet been established; do not treat automated harness results
as proof of the specification's visual fidelity threshold.

- One public unauthenticated page at a 1440×900 desktop viewport, captured at full
  document height. Responsive and interactive modes are not implemented.
- Ordinary text remains editable. Available family/style matches are loaded;
  missing fonts fall back to Inter Regular with diagnostics. Italic and advanced
  typography may need manual adjustment.
- Solid fills, images, inline SVG vectors, opacity, basic borders and radii are
  mapped. CSS background images/gradients, shadows, rotated geometry, complex
  clipping, canvas, video, embedded documents, and advanced SVG/CSS effects can
  produce partial results. SVGs containing active or external content are rejected.
- Auto Layout is enabled only when simple start-aligned geometry agrees with it.
  Other layouts preserve editable positions and report geometry fallbacks.
  Component/variant inference is not connected to live node construction.
- Image retrieval is bounded and redirects are rejected with a diagnostic.
  Lazy-loaded images that have not loaded can be missing. Failed assets remain
  source-linked diagnostics, not invented replacements.
- Reconnects require the same still-open plugin instance. Restarting the plugin
  requires a new CLI run; inspect and keep/remove the old partial frame manually.
- Screenshot comparison uses 8×8 luminance SSIM windows, not multiscale SSIM.
  Missing export reports contain explicitly labeled placeholders and cannot pass.
- Capture uses an isolated Playwright-controlled Chrome installation. A Figma
  document must be selected by the user through the local plugin; there is no
  Figma REST API document mutation.
