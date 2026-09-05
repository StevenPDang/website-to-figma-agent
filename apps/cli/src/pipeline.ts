import {
  createLiveSession,
  type ConnectionDescriptor,
} from '@website-to-figma/transport';
import { compareImages, decodePng } from '@website-to-figma/visual-qa';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import {
  captureDom,
  captureAssets,
  captureScreenshot,
  openBrowserSession,
  preparePageForCapture,
} from '@website-to-figma/browser-extractor';
import {
  validateArtifact,
  LIVE_PROTOCOL_VERSION,
  type Diagnostic,
  type Artifact,
  type ImportResultArtifact,
  type QaReportArtifact,
  type RawCaptureArtifact,
} from '@website-to-figma/contracts';
import { normalizeRawCapture } from '@website-to-figma/website-ir';
import { inferLayout } from '@website-to-figma/inference';
import { compileScene } from '@website-to-figma/figma-scene';
import { formatRunReport } from './run-report.js';

export interface ImportOptions {
  url: string;
  outputDir?: string;
  viewport?: { width: number; height: number };
  allowLoopback?: boolean;
  captureOnly?: boolean;
  pluginTimeoutMs?: number;
  pluginPort?: number;
  onConnection?: (descriptor: ConnectionDescriptor) => void;
}
export async function runImport(options: ImportOptions) {
  const runId = `run:${randomUUID()}`;
  const viewport = options.viewport ?? { width: 1440, height: 900 };
  const outputDir = options.outputDir ?? `.artifacts/${runId.slice(4)}`;
  await mkdir(`${outputDir}/assets`, { recursive: true });
  await mkdir('.artifacts', { recursive: true });
  const persist = async (artifact: Artifact) => {
    const validation = validateArtifact(artifact);
    if (!validation.ok) throw new Error(JSON.stringify(validation.issues));
    await writeFile(
      `${outputDir}/${artifact.artifactKind}.json`,
      JSON.stringify(artifact, null, 2),
    );
  };
  let transport: Awaited<ReturnType<typeof createLiveSession>> | undefined;
  let session: Awaited<ReturnType<typeof openBrowserSession>> | undefined;
  try {
    if (!options.captureOnly) {
      transport = await createLiveSession(
        runId,
        options.pluginTimeoutMs ?? 120_000,
        options.pluginPort ?? 3847,
      );
      options.onConnection?.(transport.descriptor);
      await transport.waitForConnection();
    }
    session = await openBrowserSession({
      url: options.url,
      viewport,
      ...(options.allowLoopback === undefined
        ? {}
        : { allowLoopback: options.allowLoopback }),
    });
    const preparation = await preparePageForCapture(session.page);
    const media = await captureAssets(session.page, {
      allowLoopback: options.allowLoopback ?? false,
    });
    const captured = await captureDom(session.page);
    const screenshot = await captureScreenshot(session.page);
    await writeFile(`${outputDir}/reference.png`, screenshot.bytes);
    for (const asset of media.assets) {
      await writeFile(`${outputDir}/assets/${asset.contentHash}`, asset.bytes);
    }
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
        assets: media.assets.map((asset) => {
          const { bytes, ...reference } = asset;
          if (bytes.byteLength !== reference.byteLength)
            throw new Error('Captured asset byte length mismatch');
          return reference;
        }),
      },
    };
    await persist(raw);
    const ir = normalizeRawCapture(raw);
    await persist(ir);
    const inference = inferLayout(ir);
    await persist(inference);
    const scene = compileScene(ir, inference);
    await persist(scene);
    const fallbackSources = new Set(
      media.assets
        .filter((asset) => asset.kind === 'image')
        .map((asset) => asset.sourceNodeId),
    );
    const captureDiagnostics = captured.diagnostics.map((diagnostic) =>
      diagnostic.code === 'UNSUPPORTED_MEDIA' &&
      diagnostic.sourceNodeId &&
      fallbackSources.has(diagnostic.sourceNodeId)
        ? {
            ...diagnostic,
            code: 'MEDIA_RASTER_FALLBACK',
            message: 'Media represented by a captured raster fallback.',
          }
        : diagnostic,
    );
    const diagnostics: Diagnostic[] = [
      ...preparation.diagnostics,
      ...captureDiagnostics,
      ...media.diagnostics,
      ...screenshot.diagnostics,
    ];
    let result: ImportResultArtifact = {
      ...raw,
      artifactKind: 'import-result',
      payload: {
        status: 'partial',
        sceneNodeIds: scene.payload.nodes.map((node) => node.sceneNodeId),
        nodes: scene.payload.nodes.map((node) => ({
          sceneNodeId: node.sceneNodeId,
          status: 'skipped',
        })),
        diagnostics,
      },
    };
    let qa: QaReportArtifact = {
      ...raw,
      artifactKind: 'qa-report',
      payload: {
        status: 'partial',
        sourceNodeIds: scene.payload.sourceNodeIds,
        reference: { width: screenshot.width, height: screenshot.height },
        candidate: { width: screenshot.width, height: screenshot.height },
        metrics: { ssim: 0, changedPixelRatio: 1 },
        discrepancyRegions: [],
        diagnostics: [
          {
            code: 'QA_NOT_RUN',
            severity: 'warning',
            message:
              'No Figma render available. Candidate dimensions and metrics are placeholders, not measurements.',
          },
        ],
      },
    };
    let destination: unknown;
    if (options.captureOnly)
      diagnostics.push({
        code: 'CAPTURE_ONLY',
        severity: 'warning',
        message: 'Capture-only mode; Figma import and visual QA were not run.',
      });
    else {
      try {
        if (!transport) throw new Error('Live session unavailable');
        const response = await transport.importScene({
          type: 'candidate-request',
          revision: 0,
          protocolVersion: LIVE_PROTOCOL_VERSION,
          runId,
          scene,
          assets: [
            ...new Map(
              media.assets.map((asset) => [
                asset.contentHash,
                {
                  contentHash: asset.contentHash ?? '',
                  base64: asset.bytes.toString('base64'),
                },
              ]),
            ).values(),
          ],
          width: screenshot.width,
          height: screenshot.height,
        });
        result = response.result;
        destination = response.destination;
        await persist(result);
        if (response.png) {
          const bytes = Buffer.from(response.png, 'base64');
          const candidate = decodePng(bytes);
          await writeFile(`${outputDir}/figma.png`, bytes);
          qa = compareImages(
            {
              bytes: screenshot.bytes,
              width: screenshot.width,
              height: screenshot.height,
            },
            { bytes, width: candidate.width, height: candidate.height },
            { runId, sourceUrl: raw.sourceUrl, capturedAt: raw.capturedAt },
          );
          qa.viewport = raw.viewport;
          qa.payload.sourceNodeIds = scene.payload.sourceNodeIds;
        }
        diagnostics.push(...result.payload.diagnostics);
      } catch (error) {
        diagnostics.push({
          code: 'IMPORT_OR_QA_FAILED',
          severity: 'error',
          message: error instanceof Error ? error.message : 'Import failed',
        });
      }
    }
    if (diagnostics.length)
      result = {
        ...result,
        payload: {
          ...result.payload,
          status: 'partial',
          diagnostics: [...diagnostics],
        },
      };
    await persist(result);
    await persist(qa);
    const status =
      result.payload.status === 'success' &&
      qa.payload.status === 'pass' &&
      !diagnostics.length
        ? ('success' as const)
        : ('partial' as const);
    const summary = {
      created: result.payload.nodes.filter((n) => n.status === 'created')
        .length,
      skipped: result.payload.nodes.filter((n) => n.status === 'skipped')
        .length,
      failed: result.payload.nodes.filter((n) => n.status === 'failed').length,
      assets: raw.payload.assets.length,
    };
    const report = formatRunReport({
      runId,
      sourceUrl: raw.sourceUrl,
      outputDir,
      status,
      counts: summary,
      diagnostics,
      metrics: qa.payload.metrics,
    });
    await writeFile(`${outputDir}/run-report.md`, report);
    await writeFile('.artifacts/latest-run.md', report);
    return {
      runId,
      status,
      outputDir,
      destination,
      diagnostics,
      metrics: qa.payload.metrics,
      counts: summary,
    };
  } finally {
    await session?.close();
    await transport?.close();
  }
}
