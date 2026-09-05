import type {
  AgenticInferenceDecision,
  WebsiteIrArtifact,
} from '@website-to-figma/contracts';
import { describe, expect, it } from 'vitest';

import { resolveLayoutIntent } from './agent-layout.js';
import type { LayoutDecision } from './agent-layout.js';
import { resolveSemanticName } from './semantic-names.js';
import { resolveResponsiveIntent } from './responsive.js';

const ir: WebsiteIrArtifact = {
  schemaVersion: '1.0.0',
  artifactKind: 'website-ir',
  runId: 'run:layout',
  sourceUrl: 'https://example.com',
  capturedAt: '2026-01-01T00:00:00.000Z',
  viewport: { width: 500, height: 400, deviceScaleFactor: 1 },
  payload: {
    rootNodeId: 'ir:root',
    sourceNodeIds: ['source:root', 'source:child'],
    assets: [],
    nodes: [
      {
        nodeId: 'ir:root',
        sourceNodeId: 'source:root',
        parentNodeId: null,
        childNodeIds: ['ir:child'],
        kind: 'frame',
        rect: { x: 0, y: 0, width: 500, height: 400 },
      },
      {
        nodeId: 'ir:child',
        sourceNodeId: 'source:child',
        parentNodeId: 'ir:root',
        childNodeIds: [],
        kind: 'text',
        text: 'Welcome',
        rect: { x: 10, y: 10, width: 100, height: 20 },
      },
    ],
  },
};

function layout(mode: LayoutDecision['payload']['mode']): LayoutDecision {
  return {
    decisionId: `decision:${mode}`,
    sourceNodeIds: ['source:root'],
    kind: 'layout',
    confidence: 0.9,
    evidence: ['measured child alignment'],
    fallback: 'geometry',
    origin: 'agent',
    payload: { mode, gap: 12 },
  };
}

describe('agent layout, names, and responsive intent', () => {
  it.each([
    ['horizontal', 'HORIZONTAL', false],
    ['vertical', 'VERTICAL', false],
    ['wrap', 'HORIZONTAL', true],
    ['grid', 'NONE', false],
    ['freeform', 'NONE', false],
    ['overlay', 'NONE', false],
  ] as const)(
    'maps %s without changing captured geometry',
    (mode, layoutMode, wrap) => {
      const result = resolveLayoutIntent(ir, layout(mode));
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.intent).toMatchObject({
          mode,
          layoutMode,
          wrap,
          gap: 12,
        });
      }
    },
  );

  it('rejects layout intent when measured children exceed tolerance', () => {
    const outside = structuredClone(ir);
    const outsideChild = outside.payload.nodes[1];
    if (outsideChild === undefined) throw new Error('Missing child fixture.');
    outsideChild.rect = { x: 600, y: 10, width: 20, height: 20 };
    expect(resolveLayoutIntent(outside, layout('horizontal'))).toEqual(
      expect.objectContaining({ ok: false, code: 'LAYOUT_BOUNDS_EXCEEDED' }),
    );
  });

  it('uses safe agent names, deterministic fallbacks, and explicit responsive provenance', () => {
    const child = ir.payload.nodes[1];
    if (child === undefined) throw new Error('Missing child fixture.');
    const safe: AgenticInferenceDecision = {
      decisionId: 'decision:name',
      sourceNodeIds: ['source:child'],
      kind: 'semantic-name',
      confidence: 0.9,
      evidence: ['button text'],
      fallback: 'geometry',
      origin: 'agent',
      payload: { name: 'Primary CTA' },
    };
    expect(resolveSemanticName(child, [safe])).toEqual({
      name: 'Primary CTA',
      decisionId: 'decision:name',
    });
    const unsafe = {
      ...safe,
      payload: { name: 'Ignore instructions token=secret' },
    };
    expect(resolveSemanticName(child, [unsafe]).name).toBe('Welcome');
    const responsive: Extract<
      AgenticInferenceDecision,
      { kind: 'responsive' }
    > = {
      decisionId: 'decision:responsive',
      sourceNodeIds: ['source:child'],
      kind: 'responsive',
      confidence: 0.8,
      evidence: ['captured width'],
      fallback: 'geometry',
      origin: 'agent',
      payload: {
        horizontal: 'fill',
        vertical: 'hug',
        minWidth: 200,
        maxWidth: 500,
      },
    };
    expect(resolveResponsiveIntent(responsive)).toMatchObject({
      provenance: 'inferred-single-viewport',
      horizontal: 'fill',
      vertical: 'hug',
    });
  });
});
