---
name: website-to-figma
description: Reverse-engineer a live website into an editable Figma design by extracting DOM structure, computed styles, geometry, assets, responsive behavior, and interaction states, then converting them into a structured Figma scene graph. Use this whenever the user wants to copy, import, reconstruct, recreate, or reverse-engineer a website into Figma with high visual fidelity and editable layers.
argument-hint: "<url>"
user-invocable: true
---

# Website to Figma

Reconstruct **$ARGUMENTS** as an editable Figma design.

The goal is not to create a screenshot or flattened visual copy. The goal is to recover the site's visual structure and design intent as editable Figma nodes:

- Frames
- Auto Layout containers
- Text nodes
- Images
- SVG/vector layers
- Components
- Component variants
- Effects
- Responsive frames

The source website remains the visual source of truth.

---

## Core Principle

Do not guess when the browser can provide exact information.

For every visible element, prefer extracting:

- DOM hierarchy
- computed CSS
- rendered geometry
- text content
- assets
- layering
- responsive behavior
- interaction states

Then convert those observations into Figma-native concepts.

A pixel-perfect result that is fully absolute-positioned is not enough. Prefer preserving layout intent when it can be inferred reliably.

Example:

```css
display: flex;
flex-direction: row;
gap: 24px;
padding: 32px 48px;
align-items: center;
```

should normally become:

```text
Figma Frame
layoutMode = HORIZONTAL
itemSpacing = 24
paddingTop = 32
paddingBottom = 32
paddingLeft = 48
paddingRight = 48
counterAxisAlignItems = CENTER
```

Do not convert everything into absolute-positioned rectangles unless the source actually behaves that way or layout intent cannot be inferred safely.

---

# Required Tools

Browser automation is required.

Prefer tools in this order when available:

1. Chrome MCP
2. Playwright MCP
3. Browserbase MCP
4. Puppeteer MCP
5. equivalent browser automation

The browser tool must support:

- navigation
- JavaScript execution
- screenshots
- viewport resizing
- clicking
- hovering
- scrolling

A Figma execution layer is also required.

Prefer:

1. Figma plugin API
2. Figma MCP / connected Figma tool with node creation support
3. generated Figma scene JSON consumed by a local plugin

Do not rely on the normal Figma REST API alone if it cannot create the required editable node structure.

---

# Output Architecture

Use this pipeline:

```text
Browser
  ↓
Raw Website Capture
  ↓
Website Intermediate Representation
  ↓
Layout + Design-System Inference
  ↓
Figma Scene Graph
  ↓
Figma Plugin / Figma Tool
  ↓
Editable Figma Design
  ↓
Visual QA Diff
```

The browser capture and Figma scene graph must remain separate.

Never let the Figma builder infer missing browser facts if those facts can still be extracted.

---

# Phase 1: Pre-Flight

1. Parse `$ARGUMENTS` as a URL.
2. Verify the page is reachable.
3. Open it in the browser tool.
4. Record:
   - final resolved URL
   - page title
   - viewport dimensions
   - document dimensions
5. Create a working artifact directory:

```text
docs/website-to-figma/<page-key>/
```

Recommended contents:

```text
PAGE_TOPOLOGY.md
BEHAVIORS.md
DESIGN_TOKENS.json
RAW_CAPTURE.json
FIGMA_SCENE.json
assets/
screenshots/
components/
qa/
```

Use collision-resistant page keys if multiple pages are processed.

---

# Phase 2: Master Screenshots

Capture master screenshots before modifying browser state.

Required:

- Desktop: 1440px wide
- Tablet: 768px wide
- Mobile: 390px wide

Save:

```text
screenshots/desktop-full.png
screenshots/tablet-full.png
screenshots/mobile-full.png
```

These are the visual references used during reconstruction and QA.

If the page contains lazy-loaded content, scroll through the page once before taking the final full-page references.

---

# Phase 3: Global Extraction

Extract site-wide design information before component-level reconstruction.

## Fonts

Identify:

- font families
- font weights
- font styles
- font sizes
- line heights
- letter spacing

Inspect both:

- `<link>` / stylesheet declarations
- `getComputedStyle()`

Record fonts actually used, not merely fonts loaded by the page.

---

## Colors

Collect colors from computed styles:

- text
- backgrounds
- borders
- fills
- gradients
- shadows

Normalize equivalent values.

Build a palette and identify repeated semantic roles when possible:

```json
{
  "background": "#FFFFFF",
  "foreground": "#171717",
  "primary": "#5B4FFF",
  "muted": "#737373",
  "border": "#E5E5E5"
}
```

Do not force semantic names when there is insufficient evidence.

---

## Effects

Extract:

- border radius
- borders
- box shadows
- filters
- backdrop filters
- opacity
- blend modes

---

## Assets

Enumerate:

- `<img>`
- `<video>`
- inline `<svg>`
- CSS background images
- canvas elements
- Lottie or animation containers
- icon sprites
- logos
- decorative overlays

Pay special attention to layered compositions.

Something that visually looks like one image may actually contain:

```text
Background
Foreground product screenshot
Decorative SVG
Overlay icon
Glow layer
```

Preserve these as separate Figma layers whenever possible.

---

# Phase 4: Raw DOM + Geometry Capture

For each relevant visible element, capture both semantic structure and rendered geometry.

Use a browser-side extraction routine based on:

```javascript
(function () {
  const styleProps = [
    'fontSize',
    'fontWeight',
    'fontFamily',
    'lineHeight',
    'letterSpacing',
    'color',
    'textAlign',
    'textTransform',
    'textDecoration',

    'background',
    'backgroundColor',
    'backgroundImage',

    'padding',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',

    'margin',
    'marginTop',
    'marginRight',
    'marginBottom',
    'marginLeft',

    'width',
    'height',
    'minWidth',
    'maxWidth',
    'minHeight',
    'maxHeight',

    'display',
    'flexDirection',
    'flexWrap',
    'justifyContent',
    'alignItems',
    'alignContent',
    'gap',
    'rowGap',
    'columnGap',

    'gridTemplateColumns',
    'gridTemplateRows',
    'gridColumn',
    'gridRow',

    'border',
    'borderRadius',
    'boxShadow',

    'position',
    'top',
    'right',
    'bottom',
    'left',
    'zIndex',

    'overflow',
    'overflowX',
    'overflowY',

    'opacity',
    'transform',
    'transformOrigin',
    'transition',

    'objectFit',
    'objectPosition',

    'filter',
    'backdropFilter',

    'whiteSpace',
    'textOverflow'
  ];

  function stylesFor(el) {
    const cs = getComputedStyle(el);
    const result = {};

    for (const prop of styleProps) {
      const value = cs[prop];
      if (value !== undefined && value !== '') {
        result[prop] = value;
      }
    }

    return result;
  }

  function walk(el, depth = 0) {
    if (depth > 12) return null;

    const rect = el.getBoundingClientRect();

    return {
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      classes:
        typeof el.className === 'string'
          ? el.className
          : null,

      text:
        el.children.length === 0
          ? (el.textContent || '').trim()
          : null,

      rect: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left
      },

      styles: stylesFor(el),

      image:
        el.tagName === 'IMG'
          ? {
              src: el.currentSrc || el.src,
              alt: el.alt,
              naturalWidth: el.naturalWidth,
              naturalHeight: el.naturalHeight
            }
          : null,

      children: [...el.children]
        .map(child => walk(child, depth + 1))
        .filter(Boolean)
    };
  }

  return walk(document.body);
})();
```

Do not discard geometry just because flex/grid information is available.

The structural CSS and bounding rectangles serve different purposes:

- CSS helps infer layout intent.
- geometry helps guarantee visual fidelity and resolve ambiguity.

---

# Phase 5: Page Topology

Map the page into major sections before creating Figma nodes.

Example:

```text
Page
├── Header [fixed]
├── Hero
│   ├── Copy
│   └── Artwork
├── Logo Strip
├── Feature Grid
│   ├── Feature Card
│   ├── Feature Card
│   └── Feature Card
├── CTA
└── Footer
```

For every section, document:

- visual order
- parent-child relationships
- fixed/sticky status
- z-index relationship
- major layout mode
- background treatment
- responsive behavior
- interaction model

Save to:

```text
PAGE_TOPOLOGY.md
```

This is the reconstruction blueprint.

---

# Phase 6: Interaction Sweep

A website is not only its default visual state.

Perform a behavior sweep before reconstruction.

## Scroll Sweep

Scroll slowly through the page and detect:

- sticky elements
- fixed headers
- scroll-triggered style changes
- reveal animations
- parallax
- scroll snapping
- auto-changing tabs
- section-based theme changes

Record exact triggers when possible.

---

## Click Sweep

Test:

- tabs
- buttons
- cards
- dropdowns
- accordions
- modals
- carousels
- toggles

Capture every meaningful visual state.

---

## Hover Sweep

Inspect:

- buttons
- links
- cards
- nav items
- images

Record:

- fill changes
- border changes
- scale changes
- shadows
- opacity
- underline
- transitions

---

## State Representation in Figma

Translate website states into Figma component variants when useful.

Example:

```text
Button
├── Default
├── Hover
└── Pressed
```

Example:

```text
Navbar
├── Top
└── Scrolled
```

Example:

```text
Pricing Toggle
├── Monthly
└── Annual
```

Do not attempt to encode arbitrary browser behavior into Figma if Figma cannot represent it meaningfully.

Preserve the visual states and document the original trigger.

Save all behavior findings to:

```text
BEHAVIORS.md
```

---

# Phase 7: Responsive Sweep

Inspect the page at:

- 1440px
- 768px
- 390px

For each section determine:

- stack direction changes
- wrapping
- hidden elements
- resized elements
- padding changes
- typography changes
- grid column changes
- alignment changes
- breakpoint behavior

Create one Figma page or frame group containing:

```text
Desktop / 1440
Tablet / 768
Mobile / 390
```

Do not assume the desktop layout simply scales down.

---

# Phase 8: Component Inference

Identify repeated visual structures.

Examples:

- buttons
- cards
- nav items
- badges
- input fields
- pricing cards
- testimonial cards
- icon buttons
- section headers

If multiple nodes share the same structure and style, prefer creating:

```text
Figma Component
  ↓
Instances
```

rather than unrelated duplicated frames.

Create variants when the same component has states or meaningful style variants.

Example:

```text
Button
properties:
  size = small | medium | large
  style = primary | secondary
  state = default | hover
```

Do not over-componentize one-off visual structures.

---

# Phase 9: Layout Inference

For every container, determine whether it should become:

- Auto Layout horizontal
- Auto Layout vertical
- wrapped Auto Layout
- grid-like nested Auto Layout
- freeform frame
- absolute-positioned overlay group

Use evidence from:

- `display`
- `flex-direction`
- `gap`
- padding
- alignment
- child bounding rectangles
- repeated spacing
- responsive behavior

## Confidence Rule

Use semantic layout only when evidence is strong.

When uncertain:

1. preserve pixel fidelity using geometry
2. keep the node structure editable
3. record the ambiguity

Do not hallucinate a design system.

---

# Phase 10: Website Intermediate Representation

Before creating Figma nodes, generate a normalized website IR.

Example:

```json
{
  "type": "frame",
  "name": "Hero",
  "layout": {
    "mode": "horizontal",
    "gap": 64,
    "padding": {
      "top": 120,
      "right": 80,
      "bottom": 120,
      "left": 80
    }
  },
  "size": {
    "width": 1440,
    "height": 720
  },
  "fills": [
    {
      "type": "solid",
      "value": "#FFFFFF"
    }
  ],
  "children": []
}
```

Keep this representation tool-agnostic.

Recommended node types:

```text
frame
text
rectangle
ellipse
image
svg
vector
component
instance
group
```

Recommended layout metadata:

```text
mode
gap
padding
alignment
sizing
constraints
absolutePosition
zIndex
```

Save the result to:

```text
RAW_CAPTURE.json
```

and the normalized representation to:

```text
FIGMA_SCENE.json
```

---

# Phase 11: Figma Mapping

Translate website concepts into Figma concepts.

## Containers

```text
div / section / main
→ Frame
```

Use Auto Layout when appropriate.

---

## Text

```text
h1 / h2 / p / span / label
→ Text node
```

Preserve:

- font family
- weight
- size
- line height
- letter spacing
- alignment
- casing
- decoration
- fill

Load fonts before assigning text styles.

---

## Images

```text
img
→ Rectangle or Frame with image fill
```

Preserve:

- rendered dimensions
- crop behavior
- object-fit
- object-position
- border radius

---

## SVG

Prefer:

```text
inline SVG
→ editable vector hierarchy
```

rather than rasterizing it.

If vector import is unreliable, preserve the SVG as an imported vector object rather than converting it to PNG.

---

## Borders

```text
CSS border
→ Figma stroke
```

Preserve:

- width
- color
- side-specific behavior when possible

---

## Border Radius

```text
border-radius
→ cornerRadius / individual corner radii
```

---

## Shadows

```text
box-shadow
→ DROP_SHADOW / INNER_SHADOW
```

Multiple CSS shadows should remain multiple Figma effects when possible.

---

## Gradients

```text
CSS linear/radial gradient
→ Figma gradient paint
```

Preserve angle, stops, colors, and opacity.

---

## Positioning

Use absolute positioning only for:

- actual absolute/fixed overlays
- overlapping artwork
- decorative layers
- ambiguous layouts where fidelity would otherwise be lost

---

# Phase 12: Component Specifications

Before creating a complex Figma component, create a spec file:

```text
components/<component-name>.spec.md
```

Template:

```markdown
# <ComponentName>

## Source
<selector or DOM path>

## Role
<what this component visually represents>

## Structure
<parent / child hierarchy>

## Geometry
- x:
- y:
- width:
- height:

## Layout
- display:
- direction:
- gap:
- padding:
- alignment:

## Typography
<exact values>

## Fills
<exact values>

## Strokes
<exact values>

## Effects
<exact values>

## Assets
<asset references>

## States
<default / hover / active / scrolled / etc.>

## Responsive Behavior
### Desktop
...

### Tablet
...

### Mobile
...

## Figma Mapping
<frame / auto-layout / component / instance / vector / image>
```

Specs are the contract between browser extraction and Figma construction.

---

# Phase 13: Figma Construction

Construct in this order:

1. page-level desktop frame
2. global background
3. major sections
4. reusable components
5. section content
6. images and vectors
7. overlays
8. component variants
9. tablet frame
10. mobile frame

Name layers semantically.

Good:

```text
Hero
Hero / Copy
Hero / Artwork
Primary Button
Feature Card
Navigation
```

Bad:

```text
Frame 182
Rectangle 90
Group 224
```

Preserve source hierarchy when useful, but optimize names for human editing.

---

# Phase 14: Visual QA

Do not declare completion after the first reconstruction.

For each target viewport:

1. render/export the reconstructed Figma frame
2. compare it against the original website screenshot
3. inspect discrepancies section-by-section

Check:

- position
- width
- height
- spacing
- font metrics
- line wrapping
- image crop
- border radius
- fills
- gradients
- shadows
- z-index/layer order

Fix discrepancies at their source.

If a node is wrong because extraction was wrong:

1. re-extract the browser value
2. update the spec
3. update the Figma scene
4. rebuild the affected node

Do not patch arbitrary offsets without understanding the mismatch.

---

# Optional Visual-Diff Loop

When image comparison tooling is available:

```text
Original screenshot
        ↓
Pixel / perceptual diff
        ↑
Figma export
        ↓
Difference report
        ↓
Targeted corrections
```

Use the diff to locate mismatches, not as a substitute for browser inspection.

---

# Fidelity Priority

When tradeoffs exist, prioritize:

1. visual fidelity
2. correct hierarchy
3. editability
4. Auto Layout quality
5. component reuse
6. inferred design-system cleanliness

Never sacrifice obvious visual accuracy merely to produce prettier Figma structure.

---

# What Not To Do

- Do not import the site as one screenshot.
- Do not rasterize text.
- Do not flatten SVGs unnecessarily.
- Do not estimate CSS values that can be extracted.
- Do not convert every element into an absolute-positioned frame.
- Do not infer Auto Layout without checking geometry and source CSS.
- Do not miss background images or layered overlays.
- Do not extract only the default interaction state.
- Do not ignore mobile behavior.
- Do not replace repeated components with unrelated copies.
- Do not invent missing assets.
- Do not create fake fonts when the original font cannot be loaded.
- Do not silently approximate unsupported browser effects; document them.
- Do not treat visual similarity as sufficient if the resulting Figma file is difficult to edit.

---

# Completion Checklist

Before completion verify:

- [ ] desktop screenshot captured
- [ ] tablet screenshot captured
- [ ] mobile screenshot captured
- [ ] page topology documented
- [ ] global fonts extracted
- [ ] colors extracted
- [ ] effects extracted
- [ ] all visible assets identified
- [ ] DOM hierarchy captured
- [ ] bounding geometry captured
- [ ] flex/grid relationships captured
- [ ] interaction sweep completed
- [ ] responsive sweep completed
- [ ] repeated components identified
- [ ] Figma scene representation generated
- [ ] desktop frame created
- [ ] tablet frame created
- [ ] mobile frame created
- [ ] component variants created where useful
- [ ] visual QA performed
- [ ] known limitations documented

---

# Completion Report

When finished, report:

- source URL
- Figma destination
- viewport frames created
- total major sections
- total editable nodes
- total components
- total component variants
- total assets imported
- fonts used
- responsive frames created
- visual QA status
- remaining discrepancies
- unsupported browser effects
- any assets or fonts that could not be reproduced exactly

The final Figma design should remain easy for a human designer to inspect, rename, rearrange, and modify.
