import type {
  Diagnostic,
  WebsiteIrArtifact,
} from '@website-to-figma/contracts';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';

import { classifyQaDiscrepancies } from './classify.js';
import { compareImages } from './compare.js';

const ir: WebsiteIrArtifact = {
  schemaVersion: '1.0.0',
  artifactKind: 'website-ir',
  runId: 'run:qa',
  sourceUrl: 'https://example.com',
  capturedAt: '2026-01-01T00:00:00.000Z',
  viewport: { width: 4, height: 4, deviceScaleFactor: 1 },
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
        rect: { x: 0, y: 0, width: 4, height: 4 },
      },
      {
        nodeId: 'ir:child',
        sourceNodeId: 'source:child',
        parentNodeId: 'ir:root',
        childNodeIds: [],
        kind: 'image',
        rect: { x: 0, y: 0, width: 2, height: 2 },
      },
    ],
  },
};

function image(value: number) {
  const data = Buffer.alloc(64);
  for (let index = 0; index < data.length; index += 4) {
    data[index] = value;
    data[index + 1] = value;
    data[index + 2] = value;
    data[index + 3] = 255;
  }
  return {
    bytes: PNG.sync.write(
      Object.assign(new PNG({ width: 4, height: 4 }), {
        data,
      }),
    ),
    width: 4,
    height: 4,
  };
}

describe('classifyQaDiscrepancies', () => {
  it('classifies structural defects and lowers known rendering noise', () => {
    const report = compareImages(image(0), image(255), { runId: ir.runId });
    const diagnostics: Diagnostic[] = [
      { code: 'MISSING_ASSET', severity: 'error', message: 'missing' },
      { code: 'OVERLAP_DETECTED', severity: 'error', message: 'overlap' },
      { code: 'CLIPPING_ERROR', severity: 'error', message: 'clip' },
      { code: 'Z_INDEX_ORDER', severity: 'error', message: 'order' },
      { code: 'GEOMETRY_DRIFT', severity: 'error', message: 'drift' },
      { code: 'FONT_RASTER_NOISE', severity: 'warning', message: 'noise' },
    ];
    const classified = classifyQaDiscrepancies(report, ir, diagnostics);
    expect(classified.map((item) => item.category)).toEqual([
      'missing-content',
      'overlap',
      'clipping',
      'ordering',
      'geometry',
      'rendering-noise',
    ]);
    expect(classified.at(-1)?.priority).toBe('low');
    expect(classified[0]?.sourceNodeId).toBe('source:child');
  });
});
