import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import {
  captureDom,
  openBrowserSession,
} from '@website-to-figma/browser-extractor';
import type { RawCaptureArtifact } from '@website-to-figma/contracts';
import { normalizeRawCapture } from '@website-to-figma/website-ir';
import { inferLayout } from '@website-to-figma/inference';
import { compileScene } from '@website-to-figma/figma-scene';

export interface ImportOptions {
  url: string;
  outputDir?: string;
  viewport?: { width: number; height: number };
  allowLoopback?: boolean;
}
export async function runImport(options: ImportOptions) {
  const runId = `run:${randomUUID()}`;
  const viewport = options.viewport ?? { width: 1440, height: 900 };
  const session = await openBrowserSession({
    url: options.url,
    viewport,
    ...(options.allowLoopback === undefined
      ? {}
      : { allowLoopback: options.allowLoopback }),
  });
  try {
    const captured = await captureDom(session.page);
    const raw: RawCaptureArtifact = {
      schemaVersion: '1.0.0',
      artifactKind: 'raw-capture',
      runId,
      sourceUrl: session.finalUrl,
      capturedAt: new Date().toISOString(),
      viewport: { ...viewport, deviceScaleFactor: 1 },
      payload: {
        rootNodeId: captured.rootNodeId,
        nodes: captured.nodes,
        assets: [],
      },
    };
    const ir = normalizeRawCapture(raw);
    const inference = inferLayout(ir);
    const scene = compileScene(ir, inference);
    const outputDir = options.outputDir ?? `.artifacts/${runId.slice(4)}`;
    await mkdir(outputDir, { recursive: true });
    await Promise.all([
      writeFile(`${outputDir}/raw-capture.json`, JSON.stringify(raw, null, 2)),
      writeFile(`${outputDir}/website-ir.json`, JSON.stringify(ir, null, 2)),
      writeFile(
        `${outputDir}/inference.json`,
        JSON.stringify(inference, null, 2),
      ),
      writeFile(
        `${outputDir}/figma-scene.json`,
        JSON.stringify(scene, null, 2),
      ),
    ]);
    return {
      runId,
      status: captured.diagnostics.some((item) => item.severity === 'error')
        ? ('partial' as const)
        : ('success' as const),
      outputDir,
      diagnostics: captured.diagnostics,
    };
  } finally {
    await session.close();
  }
}
