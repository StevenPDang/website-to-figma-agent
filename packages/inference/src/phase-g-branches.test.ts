import type {
  AgenticInferenceDecision,
  WebsiteIrArtifact,
} from '@website-to-figma/contracts';
import { describe, expect, it } from 'vitest';

import { resolveComponentDecision } from './agent-components.js';
import { resolveLayoutIntent, type LayoutDecision } from './agent-layout.js';
import { resolveCarouselDecision, type CarouselDecision } from './carousel.js';
import { resolveFallbackDecision, type FallbackDecision } from './fallback.js';
import {
  resolveResponsiveIntent,
  type ResponsiveDecision,
} from './responsive.js';
import { resolveSemanticName } from './semantic-names.js';
import {
  resolveTypographyDecision,
  type TypographyDecision,
} from './typography.js';

const base = {
  confidence: 0.8,
  evidence: ['bounded evidence'],
  fallback: 'geometry' as const,
  origin: 'agent' as const,
};

const ir: WebsiteIrArtifact = {
  schemaVersion: '1.0.0',
  artifactKind: 'website-ir',
  runId: 'run:branches',
  sourceUrl: 'https://example.com',
  capturedAt: '2026-01-01T00:00:00.000Z',
  viewport: { width: 400, height: 300, deviceScaleFactor: 1 },
  payload: {
    rootNodeId: 'ir:root',
    sourceNodeIds: ['source:root', 'source:text', 'source:media'],
    assets: [
      { assetId: 'asset:media', sourceNodeId: 'source:media', kind: 'canvas' },
    ],
    nodes: [
      {
        nodeId: 'ir:root',
        sourceNodeId: 'source:root',
        parentNodeId: null,
        childNodeIds: ['ir:text', 'ir:media'],
        kind: 'frame',
      },
      {
        nodeId: 'ir:text',
        sourceNodeId: 'source:text',
        parentNodeId: 'ir:root',
        childNodeIds: [],
        kind: 'text',
        text: '',
        styles: {},
      },
      {
        nodeId: 'ir:media',
        sourceNodeId: 'source:media',
        parentNodeId: 'ir:root',
        childNodeIds: [],
        kind: 'image',
        visible: false,
      },
    ],
  },
};

describe('Phase G safety branches', () => {
  it('resolves optional layout and responsive values without invented viewport claims', () => {
    const layout: LayoutDecision = {
      ...base,
      decisionId: 'decision:layout',
      sourceNodeIds: ['source:root'],
      kind: 'layout',
      payload: {
        mode: 'grid',
        padding: { top: 1, right: 2, bottom: 3, left: 4 },
        align: 'stretch',
        justify: 'space-between',
      },
    };
    const resolved = resolveLayoutIntent(ir, layout);
    expect(resolved.ok).toBe(true);
    if (resolved.ok)
      expect(resolved.intent).toMatchObject({
        layoutMode: 'NONE',
        padding: { left: 4 },
        align: 'stretch',
        justify: 'space-between',
      });
    const responsive: ResponsiveDecision = {
      ...base,
      decisionId: 'decision:responsive',
      sourceNodeIds: ['source:root'],
      kind: 'responsive',
      payload: { horizontal: 'fixed', vertical: 'fixed' },
    };
    expect(resolveResponsiveIntent(responsive)).toEqual({
      decisionId: 'decision:responsive',
      horizontal: 'fixed',
      vertical: 'fixed',
      provenance: 'inferred-single-viewport',
    });
  });

  it('uses section and node-kind naming fallbacks and strips control characters', () => {
    const root = ir.payload.nodes[0];
    const text = ir.payload.nodes[1];
    if (root === undefined || text === undefined)
      throw new Error('Missing naming fixtures.');
    const section: AgenticInferenceDecision = {
      ...base,
      decisionId: 'decision:section',
      sourceNodeIds: ['source:root'],
      kind: 'section',
      payload: { role: 'hero' },
    };
    expect(resolveSemanticName(root, [section]).name).toBe('Hero');
    const named: AgenticInferenceDecision = {
      ...base,
      decisionId: 'decision:name',
      sourceNodeIds: ['source:text'],
      kind: 'semantic-name',
      payload: { name: 'Primary\u0000 CTA' },
    };
    expect(resolveSemanticName(text, [named]).name).toBe('Primary CTA');
    expect(resolveSemanticName(text, []).name).toBe('Text text');
  });

  it('rejects incomplete component roots before comparing overrides', () => {
    const one: Extract<AgenticInferenceDecision, { kind: 'component' }> = {
      ...base,
      decisionId: 'decision:one',
      sourceNodeIds: ['source:root'],
      kind: 'component',
      payload: {
        name: 'One',
        instanceSourceNodeIds: ['source:root'],
        overrideSourceNodeIds: [],
      },
    };
    expect(resolveComponentDecision(ir, one)).toMatchObject({
      ok: false,
      code: 'COMPONENT_REQUIRES_REPETITION',
    });
    const missing = structuredClone(one);
    missing.payload.instanceSourceNodeIds = ['source:root', 'source:missing'];
    expect(resolveComponentDecision(ir, missing)).toMatchObject({
      ok: false,
      code: 'COMPONENT_STRUCTURE_MISMATCH',
    });
  });

  it('rejects hidden carousel panels and missing clone evidence', () => {
    const decision: CarouselDecision = {
      ...base,
      decisionId: 'decision:carousel',
      sourceNodeIds: ['source:root'],
      kind: 'carousel',
      payload: {
        viewportSourceNodeId: 'source:root',
        panelSourceNodeIds: ['source:media'],
        cloneSourceNodeIds: [],
        clipContent: true,
      },
    };
    expect(resolveCarouselDecision(ir, decision)).toMatchObject({
      ok: false,
      code: 'CAROUSEL_PANEL_NOT_VISIBLE',
    });
    const visible = structuredClone(ir);
    const media = visible.payload.nodes[2];
    if (media === undefined) throw new Error('Missing media fixture.');
    media.visible = true;
    decision.payload.panelSourceNodeIds = ['source:text'];
    decision.payload.cloneSourceNodeIds = ['source:missing'];
    expect(resolveCarouselDecision(visible, decision)).toMatchObject({
      ok: false,
      code: 'CAROUSEL_CLONE_NOT_PROVEN',
    });
  });

  it('handles editable fallbacks and typography target/style alternatives', () => {
    const editable: FallbackDecision = {
      ...base,
      decisionId: 'decision:editable',
      sourceNodeIds: ['source:text'],
      kind: 'fallback',
      payload: { representation: 'editable', reason: 'Keep text' },
    };
    expect(resolveFallbackDecision(ir, editable)).toMatchObject({
      ok: true,
      fallback: { representation: 'editable' },
    });
    const typography: TypographyDecision = {
      ...base,
      decisionId: 'decision:type',
      sourceNodeIds: ['source:text'],
      kind: 'typography',
      payload: {
        substituteFamily: 'Inter',
        preserveLineCount: false,
        lineHeight: 21,
        letterSpacing: 0.5,
      },
    };
    const resolved = resolveTypographyDecision(ir, typography, [
      { family: 'Inter', weight: 500, style: 'italic' },
    ]);
    expect(resolved.ok).toBe(true);
    if (resolved.ok)
      expect(resolved.typography).toMatchObject({
        requestedFamily: 'Inter',
        style: 'italic',
        lineHeight: 21,
        letterSpacing: 0.5,
      });
    const nonText = { ...typography, sourceNodeIds: ['source:root'] };
    expect(resolveTypographyDecision(ir, nonText, [])).toMatchObject({
      ok: false,
      code: 'TYPOGRAPHY_TARGET_NOT_TEXT',
    });
  });
});
