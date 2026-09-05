import { describe, expect, it } from 'vitest';
import { compileScene } from './compile.js';
import type { WebsiteIrArtifact } from '@website-to-figma/contracts';

const ir: WebsiteIrArtifact = {
  schemaVersion: '1.0.0',
  artifactKind: 'website-ir',
  runId: 'run:test',
  sourceUrl: 'https://example.com',
  capturedAt: '2026-01-01T00:00:00.000Z',
  viewport: { width: 800, height: 600, deviceScaleFactor: 1 },
  payload: {
    rootNodeId: 'ir:0',
    sourceNodeIds: ['dom:0'],
    assets: [],
    nodes: [
      {
        nodeId: 'ir:0',
        sourceNodeId: 'dom:0',
        parentNodeId: null,
        childNodeIds: [],
        kind: 'text',
        text: 'Hello',
      },
    ],
  },
};

describe('compileScene', () => {
  it('creates deterministic editable scene nodes with source links', () => {
    const scene = compileScene(ir);
    expect(scene.payload.rootNodeIds).toEqual(['scene:0']);
    expect(scene.payload.nodes[0]).toMatchObject({
      sceneNodeId: 'scene:0',
      sourceNodeId: 'dom:0',
      kind: 'text',
      text: 'Hello',
    });
  });
});

it('does not apply parent layout decisions to text children or freeform frames', () => {
  const input = structuredClone(ir);
  const root = input.payload.nodes[0];
  if (!root) throw new Error('fixture');
  root.kind = 'frame';
  root.childNodeIds = ['ir:1'];
  root.styles = { display: 'block' };
  input.payload.nodes.push({
    nodeId: 'ir:1',
    sourceNodeId: 'dom:1',
    parentNodeId: 'ir:0',
    childNodeIds: [],
    kind: 'text',
    text: 'Child',
    visible: true,
  });
  input.payload.sourceNodeIds.push('dom:1');
  const inference = {
    ...input,
    artifactKind: 'inference' as const,
    payload: {
      sourceNodeIds: input.payload.sourceNodeIds,
      decisions: [
        {
          decisionId: 'decision:0',
          sourceNodeIds: ['dom:0', 'dom:1'],
          kind: 'layout' as const,
          confidence: 0.5,
          evidence: ['display=block'],
          fallback: 'geometry' as const,
        },
      ],
    },
  };
  const scene = compileScene(input, inference);
  expect(scene.payload.nodes.every((n) => n.layoutMode === undefined)).toBe(
    true,
  );
});
it('preserves shape kinds and valid geometry while omitting invisible leaves', () => {
  const input = structuredClone(ir);
  const root = input.payload.nodes[0];
  if (!root) throw new Error('fixture');
  root.kind = 'frame';
  root.childNodeIds = ['ir:1', 'ir:2'];
  input.payload.nodes.push(
    {
      nodeId: 'ir:1',
      sourceNodeId: 'dom:1',
      parentNodeId: 'ir:0',
      childNodeIds: [],
      kind: 'ellipse',
      styles: { opacity: 'invalid', 'border-radius': 'invalid' },
    },
    {
      nodeId: 'ir:2',
      sourceNodeId: 'dom:2',
      parentNodeId: 'ir:0',
      childNodeIds: [],
      kind: 'group',
      visible: false,
    },
  );
  input.payload.sourceNodeIds.push('dom:1', 'dom:2');
  const scene = compileScene(input);
  expect(scene.payload.nodes).toHaveLength(2);
  expect(scene.payload.nodes[1]?.kind).toBe('ellipse');
  expect(scene.payload.nodes[1]?.opacity).toBeUndefined();
  expect(scene.payload.nodes[0]?.childNodeIds).toEqual(['scene:1']);
});
