import {
  INFERENCE_SCHEMA_VERSION,
  type AgenticInferenceArtifact,
  type AgenticInferenceDecision,
  validateArtifact,
  type WebsiteIrArtifact,
} from '@website-to-figma/contracts';
import { describe, expect, it } from 'vitest';

import { compileScene } from './compile.js';

const ir: WebsiteIrArtifact = {
  schemaVersion: '1.0.0',
  artifactKind: 'website-ir',
  runId: 'run:scene-agent',
  sourceUrl: 'https://example.com',
  capturedAt: '2026-01-01T00:00:00.000Z',
  viewport: { width: 800, height: 600, deviceScaleFactor: 1 },
  payload: {
    rootNodeId: 'ir:root',
    sourceNodeIds: [
      'source:root',
      'source:a',
      'source:a-text',
      'source:b',
      'source:b-text',
      'source:media',
    ],
    assets: [
      {
        assetId: 'asset:media',
        sourceNodeId: 'source:media',
        kind: 'video',
        contentHash:
          'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      },
    ],
    nodes: [
      {
        nodeId: 'ir:root',
        sourceNodeId: 'source:root',
        parentNodeId: null,
        childNodeIds: ['ir:a', 'ir:b', 'ir:media'],
        kind: 'frame',
        rect: { x: 0, y: 0, width: 800, height: 600 },
      },
      {
        nodeId: 'ir:a',
        sourceNodeId: 'source:a',
        parentNodeId: 'ir:root',
        childNodeIds: ['ir:a-text'],
        kind: 'frame',
        rect: { x: 0, y: 0, width: 200, height: 100 },
      },
      {
        nodeId: 'ir:a-text',
        sourceNodeId: 'source:a-text',
        parentNodeId: 'ir:a',
        childNodeIds: [],
        kind: 'text',
        text: 'Alpha',
        rect: { x: 0, y: 0, width: 100, height: 24 },
        styles: { 'font-family': 'Missing', 'line-height': '24px' },
      },
      {
        nodeId: 'ir:b',
        sourceNodeId: 'source:b',
        parentNodeId: 'ir:root',
        childNodeIds: ['ir:b-text'],
        kind: 'frame',
        rect: { x: 220, y: 0, width: 200, height: 100 },
      },
      {
        nodeId: 'ir:b-text',
        sourceNodeId: 'source:b-text',
        parentNodeId: 'ir:b',
        childNodeIds: [],
        kind: 'text',
        text: 'Beta',
        rect: { x: 220, y: 0, width: 100, height: 24 },
      },
      {
        nodeId: 'ir:media',
        sourceNodeId: 'source:media',
        parentNodeId: 'ir:root',
        childNodeIds: [],
        kind: 'image',
        rect: { x: 0, y: 150, width: 320, height: 180 },
      },
    ],
  },
};

function inference(
  decisions: AgenticInferenceDecision[],
): AgenticInferenceArtifact {
  return {
    schemaVersion: INFERENCE_SCHEMA_VERSION,
    artifactKind: 'inference',
    runId: ir.runId,
    sourceUrl: ir.sourceUrl,
    capturedAt: ir.capturedAt,
    viewport: ir.viewport,
    payload: {
      sourceNodeIds: ir.payload.sourceNodeIds,
      decisions,
      deterministicDecisions: [],
      proposedDecisions: decisions,
      rejectedDecisions: [],
      mergeOutcomes: decisions.map((decision) => ({
        decisionId: decision.decisionId,
        status: 'accepted',
      })),
    },
  };
}

const base = {
  confidence: 0.9,
  evidence: ['agent evidence'],
  fallback: 'geometry' as const,
  origin: 'agent' as const,
};

describe('agentic scene compilation', () => {
  it('applies layout, naming, responsive, typography, fallback, and component effects', () => {
    const decisions: AgenticInferenceDecision[] = [
      {
        ...base,
        decisionId: 'decision:layout',
        sourceNodeIds: ['source:root'],
        kind: 'layout',
        payload: {
          mode: 'wrap',
          gap: 20,
          padding: { top: 10, right: 10, bottom: 10, left: 10 },
        },
      },
      {
        ...base,
        decisionId: 'decision:name',
        sourceNodeIds: ['source:root'],
        kind: 'semantic-name',
        payload: { name: 'Featured Work' },
      },
      {
        ...base,
        decisionId: 'decision:responsive',
        sourceNodeIds: ['source:root'],
        kind: 'responsive',
        payload: {
          horizontal: 'fill',
          vertical: 'hug',
          minWidth: 400,
          maxWidth: 1200,
        },
      },
      {
        ...base,
        decisionId: 'decision:type',
        sourceNodeIds: ['source:a-text'],
        kind: 'typography',
        payload: {
          requestedFamily: 'Missing',
          substituteFamily: 'Inter',
          weight: 600,
          style: 'normal',
          preserveLineCount: true,
        },
      },
      {
        ...base,
        decisionId: 'decision:fallback',
        sourceNodeIds: ['source:media'],
        kind: 'fallback',
        payload: { representation: 'raster', reason: 'Video frame' },
      },
      {
        ...base,
        decisionId: 'decision:component',
        sourceNodeIds: ['source:a', 'source:b'],
        kind: 'component',
        payload: {
          name: 'Project Card',
          instanceSourceNodeIds: ['source:a', 'source:b'],
          overrideSourceNodeIds: ['source:b-text'],
        },
      },
      {
        ...base,
        decisionId: 'decision:qa',
        sourceNodeIds: ['source:root'],
        kind: 'qa-priority',
        payload: { category: 'geometry', priority: 'high' },
      },
    ];
    const scene = compileScene(ir, inference(decisions));
    const root = scene.payload.nodes.find(
      (node) => node.sourceNodeId === 'source:root',
    );
    const firstCard = scene.payload.nodes.find(
      (node) => node.sourceNodeId === 'source:a',
    );
    const secondCard = scene.payload.nodes.find(
      (node) => node.sourceNodeId === 'source:b',
    );
    const text = scene.payload.nodes.find(
      (node) => node.sourceNodeId === 'source:a-text',
    );
    const media = scene.payload.nodes.find(
      (node) => node.sourceNodeId === 'source:media',
    );
    expect(root).toMatchObject({
      name: 'Featured Work',
      layoutMode: 'HORIZONTAL',
      layoutIntent: 'wrap',
      layoutWrap: true,
      itemSpacing: 20,
      constraints: { provenance: 'inferred-single-viewport' },
    });
    expect(firstCard).toMatchObject({
      kind: 'component',
      componentSourceNodeId: 'source:a',
    });
    expect(secondCard).toMatchObject({
      kind: 'instance',
      componentSourceNodeId: 'source:a',
    });
    expect(text).toMatchObject({
      typography: {
        requestedFamily: 'Missing',
        resolvedFamily: 'Inter',
        preserveLineCount: true,
      },
      styles: { 'font-family': 'Inter' },
    });
    expect(media).toMatchObject({
      kind: 'image',
      fallbackRepresentation: 'raster',
    });
    expect(scene.payload.diagnostics?.[0]?.code).toBe(
      'INFERENCE_DECISION_DEFERRED',
    );
    const validation = validateArtifact(scene);
    if (!validation.ok) {
      throw new Error(JSON.stringify(validation.issues));
    }
  });

  it('keeps carousel panels editable and removes a proven loop clone', () => {
    const carouselIr = structuredClone(ir);
    const media = carouselIr.payload.nodes[5];
    if (media === undefined) throw new Error('Missing media fixture.');
    const clone = {
      ...media,
      nodeId: 'ir:clone',
      sourceNodeId: 'source:clone',
      parentNodeId: 'ir:root',
      childNodeIds: [],
    };
    carouselIr.payload.nodes.push(clone);
    carouselIr.payload.sourceNodeIds.push('source:clone');
    carouselIr.payload.assets.push({
      assetId: 'asset:clone',
      sourceNodeId: 'source:clone',
      kind: 'video',
      contentHash:
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    });
    const decision: AgenticInferenceDecision = {
      ...base,
      decisionId: 'decision:carousel',
      sourceNodeIds: ['source:root'],
      kind: 'carousel',
      payload: {
        viewportSourceNodeId: 'source:root',
        panelSourceNodeIds: ['source:media'],
        cloneSourceNodeIds: ['source:clone'],
        clipContent: true,
      },
    };
    const artifact = inference([decision]);
    artifact.payload.sourceNodeIds.push('source:clone');
    const scene = compileScene(carouselIr, artifact);
    expect(
      scene.payload.nodes.some((node) => node.sourceNodeId === 'source:media'),
    ).toBe(true);
    expect(
      scene.payload.nodes.some((node) => node.sourceNodeId === 'source:clone'),
    ).toBe(false);
    expect(
      scene.payload.nodes.find((node) => node.sourceNodeId === 'source:root')
        ?.clipsContent,
    ).toBe(true);
  });

  it('preserves deterministic output when no agentic artifact is supplied', () => {
    expect(compileScene(ir)).toEqual(compileScene(ir, undefined));
    expect(compileScene(ir).payload.diagnostics).toBeUndefined();
  });

  it('records unsupported agent effects without changing editable fallback nodes', () => {
    const decisions: AgenticInferenceDecision[] = [
      {
        ...base,
        decisionId: 'decision:bad-component',
        sourceNodeIds: ['source:a'],
        kind: 'component',
        payload: {
          name: 'Card',
          instanceSourceNodeIds: ['source:a'],
          overrideSourceNodeIds: [],
        },
      },
      {
        ...base,
        decisionId: 'decision:bad-type',
        sourceNodeIds: ['source:root'],
        kind: 'typography',
        payload: { substituteFamily: 'Inter', preserveLineCount: true },
      },
      {
        ...base,
        decisionId: 'decision:bad-fallback',
        sourceNodeIds: ['source:a'],
        kind: 'fallback',
        payload: { representation: 'raster', reason: 'Not media' },
      },
      {
        ...base,
        decisionId: 'decision:token',
        sourceNodeIds: ['source:root'],
        kind: 'token',
        payload: { tokenType: 'color', name: 'Surface', value: '#fff' },
      },
      {
        ...base,
        decisionId: 'decision:section',
        sourceNodeIds: ['source:root'],
        kind: 'section',
        payload: { role: 'gallery' },
      },
    ];
    const scene = compileScene(ir, inference(decisions));
    expect(
      scene.payload.nodes.find((node) => node.sourceNodeId === 'source:a')
        ?.kind,
    ).toBe('frame');
    expect(
      scene.payload.nodes.find((node) => node.sourceNodeId === 'source:root')
        ?.name,
    ).toBe('Gallery');
    expect(scene.payload.diagnostics?.map((item) => item.code)).toEqual([
      'COMPONENT_REQUIRES_REPETITION',
      'TYPOGRAPHY_TARGET_NOT_TEXT',
      'FALLBACK_TARGET_NOT_ELIGIBLE',
      'INFERENCE_DECISION_DEFERRED',
    ]);
  });

  it('keeps invalid layout and carousel proposals as warnings', () => {
    const outOfBoundsIr = structuredClone(ir);
    const secondCard = outOfBoundsIr.payload.nodes.find(
      (node) => node.sourceNodeId === 'source:b',
    );
    if (secondCard?.rect === undefined)
      throw new Error('Missing card fixture.');
    secondCard.rect.x = 900;
    const decisions: AgenticInferenceDecision[] = [
      {
        ...base,
        decisionId: 'decision:bad-layout',
        sourceNodeIds: ['source:root'],
        kind: 'layout',
        payload: { mode: 'horizontal', gap: 10 },
      },
      {
        ...base,
        decisionId: 'decision:bad-carousel',
        sourceNodeIds: ['source:root'],
        kind: 'carousel',
        payload: {
          viewportSourceNodeId: 'source:root',
          panelSourceNodeIds: ['source:a'],
          cloneSourceNodeIds: ['source:b'],
          clipContent: true,
        },
      },
    ];
    expect(
      compileScene(
        outOfBoundsIr,
        inference(decisions),
      ).payload.diagnostics?.map((item) => item.code),
    ).toEqual(['LAYOUT_BOUNDS_EXCEEDED', 'CAROUSEL_CLONE_NOT_PROVEN']);
  });

  it('applies optional typography metrics and editable fallback without changing kind', () => {
    const decisions: AgenticInferenceDecision[] = [
      {
        ...base,
        decisionId: 'decision:type-metrics',
        sourceNodeIds: ['source:a-text'],
        kind: 'typography',
        payload: {
          requestedFamily: 'Missing',
          substituteFamily: 'Inter',
          weight: 400,
          style: 'normal',
          lineHeight: 30,
          letterSpacing: 1.5,
          preserveLineCount: false,
        },
      },
      {
        ...base,
        decisionId: 'decision:editable',
        sourceNodeIds: ['source:media'],
        kind: 'fallback',
        payload: { representation: 'editable', reason: 'Keep layers' },
      },
    ];
    const scene = compileScene(ir, inference(decisions));
    expect(
      scene.payload.nodes.find((node) => node.sourceNodeId === 'source:a-text'),
    ).toMatchObject({
      styles: { 'line-height': '30px', 'letter-spacing': '1.5px' },
      typography: { preserveLineCount: false },
    });
    expect(
      scene.payload.nodes.find((node) => node.sourceNodeId === 'source:media'),
    ).toMatchObject({ kind: 'image', fallbackRepresentation: 'editable' });
  });
});
