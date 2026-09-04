import { describe, expect, it } from 'vitest';

import { validateArtifact } from './validation.js';

const metadata = {
  schemaVersion: '1.0.0',
  runId: 'run:fixture',
  sourceUrl: 'https://example.com/',
  capturedAt: '2026-09-04T19:30:00.000Z',
  viewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
};

const artifacts = [
  {
    ...metadata,
    artifactKind: 'raw-capture',
    payload: {
      rootNodeId: 'source:root',
      nodes: [
        {
          sourceNodeId: 'source:root',
          parentSourceNodeId: null,
          childSourceNodeIds: [],
          kind: 'element',
        },
      ],
      assets: [],
    },
  },
  {
    ...metadata,
    artifactKind: 'website-ir',
    payload: {
      rootNodeId: 'ir:root',
      sourceNodeIds: ['source:root'],
      nodes: [
        {
          nodeId: 'ir:root',
          sourceNodeId: 'source:root',
          parentNodeId: null,
          childNodeIds: [],
          kind: 'frame',
        },
      ],
      assets: [],
    },
  },
  {
    ...metadata,
    artifactKind: 'inference',
    payload: {
      sourceNodeIds: ['source:root'],
      decisions: [
        {
          decisionId: 'decision:root-layout',
          sourceNodeIds: ['source:root'],
          kind: 'layout',
          confidence: 1,
          evidence: ['display:flex'],
          fallback: 'geometry',
        },
      ],
    },
  },
  {
    ...metadata,
    artifactKind: 'figma-scene',
    payload: {
      sourceNodeIds: ['source:root'],
      rootNodeIds: ['scene:root'],
      nodes: [
        {
          sceneNodeId: 'scene:root',
          sourceNodeId: 'source:root',
          parentNodeId: null,
          childNodeIds: [],
          kind: 'frame',
          name: 'Page',
        },
      ],
      assets: [],
    },
  },
  {
    ...metadata,
    artifactKind: 'import-result',
    payload: {
      status: 'success',
      sceneNodeIds: ['scene:root'],
      nodes: [
        {
          sceneNodeId: 'scene:root',
          figmaNodeId: '1:2',
          status: 'created',
        },
      ],
      diagnostics: [],
    },
  },
  {
    ...metadata,
    artifactKind: 'qa-report',
    payload: {
      status: 'pass',
      sourceNodeIds: ['source:root'],
      reference: { width: 1440, height: 900 },
      candidate: { width: 1440, height: 900 },
      metrics: { ssim: 0.99, changedPixelRatio: 0.01 },
      discrepancyRegions: [],
      diagnostics: [],
    },
  },
] as const;

describe('validateArtifact', () => {
  it('rejects non-object input at the schema boundary', () => {
    const result = validateArtifact(null);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toContainEqual(
        expect.objectContaining({ code: 'SCHEMA_VALIDATION', path: '/' }),
      );
    }
  });

  it.each(artifacts)('accepts a valid $artifactKind artifact', (artifact) => {
    expect(validateArtifact(artifact)).toEqual({ ok: true, value: artifact });
  });

  it('rejects an unsupported schema version with a structured issue', () => {
    const artifact = { ...artifacts[0], schemaVersion: '2.0.0' };

    expect(validateArtifact(artifact)).toEqual({
      ok: false,
      issues: [
        expect.objectContaining({
          code: 'SCHEMA_VALIDATION',
          path: '/schemaVersion',
        }),
      ],
    });
  });

  it('reports schema issues only for the selected artifact kind', () => {
    const artifact = { ...artifacts[0], sourceUrl: 'not a URL' };

    expect(validateArtifact(artifact)).toEqual({
      ok: false,
      issues: [
        {
          code: 'SCHEMA_VALIDATION',
          message: 'must match format "uri"',
          path: '/sourceUrl',
        },
      ],
    });
  });

  it('rejects a dangling root node reference', () => {
    const artifact = {
      ...artifacts[0],
      payload: { ...artifacts[0].payload, rootNodeId: 'source:missing' },
    };

    expect(validateArtifact(artifact)).toEqual({
      ok: false,
      issues: [
        {
          code: 'DANGLING_REFERENCE',
          message: 'Root node source:missing does not exist',
          path: '/payload/rootNodeId',
        },
      ],
    });
  });

  it('rejects duplicate stable identifiers', () => {
    const root = artifacts[0].payload.nodes[0];
    const artifact = {
      ...artifacts[0],
      payload: { ...artifacts[0].payload, nodes: [root, root] },
    };

    expect(validateArtifact(artifact)).toEqual({
      ok: false,
      issues: [
        {
          code: 'DUPLICATE_ID',
          message: 'Duplicate source node ID source:root',
          path: '/payload/nodes/1/sourceNodeId',
        },
      ],
    });
  });

  it('rejects dangling parent, child, and asset source references', () => {
    const artifact = {
      ...artifacts[0],
      payload: {
        ...artifacts[0].payload,
        nodes: [
          {
            ...artifacts[0].payload.nodes[0],
            parentSourceNodeId: 'source:missing-parent',
            childSourceNodeIds: ['source:missing-child'],
          },
        ],
        assets: [
          {
            assetId: 'asset:logo',
            sourceNodeId: 'source:missing-asset-owner',
            kind: 'image',
          },
        ],
      },
    };

    expect(validateArtifact(artifact)).toEqual({
      ok: false,
      issues: [
        expect.objectContaining({
          code: 'DANGLING_REFERENCE',
          path: '/payload/nodes/0/parentSourceNodeId',
        }),
        expect.objectContaining({
          code: 'DANGLING_REFERENCE',
          path: '/payload/nodes/0/childSourceNodeIds/0',
        }),
        expect.objectContaining({
          code: 'DANGLING_REFERENCE',
          path: '/payload/assets/0/sourceNodeId',
        }),
      ],
    });
  });
});
