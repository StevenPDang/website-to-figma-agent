# Figma Mapping Guidance

Map containers to frames. Use horizontal, vertical, or wrapping Auto Layout only when supported by layout evidence. Use nested Auto Layout to represent regular grids. Use freeform frames for true overlays and geometry-preserving fallbacks.

Map text to text nodes with explicit font family, style, size, line height, letter spacing, alignment, decoration, and fill. Preserve separate text runs when inline styling differs.

Map raster media to image fills while preserving crop and object-position behavior. Map inline SVG to imported vector hierarchies where practical. Record a fallback when an effect or SVG feature must be approximated.

Map CSS fills, gradients, strokes, individual corner radii, opacity, blend modes, and supported shadows to equivalent Figma paints and effects. Preserve effect order when the APIs permit it.

Create a component only when repeated instances share material structure and styling. Create variants only for observed, meaningful differences. Do not manufacture a comprehensive design system from isolated similarities.

Layer names should reflect semantic roles, while stable plugin data or metadata retains machine identifiers. Node creation order must respect component dependencies, font loading, asset availability, hierarchy, and z-order.
