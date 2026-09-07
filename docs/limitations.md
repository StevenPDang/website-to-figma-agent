# Current limitations

The live CLI/plugin transport, packaged Figma controller/UI, agentic inference,
candidate selection, asset bytes, PNG export, and measured visual QA are
implemented. Deterministic mode remains the default until final real-Figma agentic
acceptance and human default-switch approval.

- One public unauthenticated page at a 1440×900 desktop viewport, captured at full
  document height. Responsive and interactive modes are not implemented.
- Ordinary text remains editable. Available family/style matches are loaded;
  missing fonts fall back to Inter Regular with diagnostics. Italic and advanced
  typography may need manual adjustment.
- Solid fills, images, inline SVG vectors, opacity, basic borders and radii are
  mapped. CSS background images/gradients, shadows, rotated geometry, complex
  clipping, canvas, video, embedded documents, and advanced SVG/CSS effects can
  produce partial results. SVGs containing active or external content are rejected.
- Agent decisions enrich scene layout, semantic names, constraints, clipping,
  typography provenance, components, instances, and scoped fallbacks. The live
  importer does not yet materialize all enriched fields as native Auto Layout,
  components/instances, or responsive constraints. Scene metadata alone does not
  prove those features work in Figma; this remains a release acceptance gap.
- Image retrieval is bounded and redirects are rejected with a diagnostic.
  Lazy-loaded images that have not loaded can be missing. Failed assets remain
  source-linked diagnostics, not invented replacements.
- Reconnects require the same still-open plugin instance. Restarting the plugin
  requires a new CLI run. Protocol 1.2 retains the most recent complete candidate;
  finalization removes only other candidates carrying matching run ownership.
- Agentic inference currently supports the local Codex adapter. Hosted providers,
  interaction-state capture, multiple viewports, and website regeneration from a
  customized Figma design remain outside the approved scope.
- Provider calls have time and output-byte limits, but no hard token-spending cap.
  Full-page evidence can be expensive; the recorded public-page smoke retry used
  518,777 reported tokens. Token usage does not establish a dollar cost or identify
  cached-token billing. Agentic mode remains opt-in while this is evaluated.
- Screenshot comparison uses 8×8 luminance SSIM windows, not multiscale SSIM.
  Missing export reports contain explicitly labeled placeholders and cannot pass.
- Capture uses an isolated Playwright-controlled Chrome installation. A Figma
  document must be selected by the user through the local plugin; there is no
  Figma REST API document mutation.
