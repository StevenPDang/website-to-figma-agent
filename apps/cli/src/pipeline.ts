import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  captureAssets,
  captureDom,
  captureScreenshot,
  openBrowserSession,
  preparePageForCapture,
} from '@website-to-figma/browser-extractor';
import {
  LIVE_PROTOCOL_VERSION,
  validateArtifact,
  type AgenticInferenceArtifact,
  type Artifact,
  type Diagnostic,
  type ImportResultArtifact,
  type InferenceArtifact,
  type QaReportArtifact,
  type RawCaptureArtifact,
  type WebsiteIrArtifact,
} from '@website-to-figma/contracts';
import { compileScene } from '@website-to-figma/figma-scene';
import {
  buildAgentInferenceRequests,
  createCodexInferenceProvider,
  inferLayout,
  mergeAgentInference,
  runCorrectionLoop,
  type AgentInferenceRequest,
  type CandidateHistory,
  type InferenceProvider,
  type InferenceUsage,
} from '@website-to-figma/inference';
import {
  createLiveSession,
  type ConnectionDescriptor,
} from '@website-to-figma/transport';
import {
  classifyQaDiscrepancies,
  compareImages,
  decodePng,
  type QaCandidate,
} from '@website-to-figma/visual-qa';
import { normalizeRawCapture } from '@website-to-figma/website-ir';

import type { InferenceMode } from './agentic-options.js';
import { formatRunReport } from './run-report.js';

export interface ImportOptions {
  url: string;
  outputDir?: string;
  viewport?: { width: number; height: number };
  allowLoopback?: boolean;
  captureOnly?: boolean;
  pluginTimeoutMs?: number;
  pluginPort?: number;
  inferenceMode?: InferenceMode;
  providerId?: 'local-codex';
  provider?: InferenceProvider;
  providerTimeoutMs?: number;
  maxProviderOutputBytes?: number;
  maxRenders?: number;
  onConnection?: (descriptor: ConnectionDescriptor) => void;
  onProgress?: (message: string) => void;
}

interface RenderedRevision {
  response: Awaited<
    ReturnType<Awaited<ReturnType<typeof createLiveSession>>['renderCandidate']>
  >;
  scene: ReturnType<typeof compileScene>;
  qa: QaReportArtifact;
  candidate: QaCandidate;
}

export async function runImport(options: ImportOptions) {
  const runId = `run:${randomUUID()}`;
  const viewport = options.viewport ?? { width: 1440, height: 900 };
  const outputDir = options.outputDir ?? `.artifacts/${runId.slice(4)}`;
  const inferenceMode = options.inferenceMode ?? 'deterministic';
  const progress = options.onProgress ?? (() => {});
  await mkdir(`${outputDir}/assets`, { recursive: true });
  await mkdir('.artifacts', { recursive: true });
  const persist = async (
    artifact: Artifact,
    filename: string = artifact.artifactKind,
  ) => {
    const validation = validateArtifact(artifact);
    if (!validation.ok) throw new Error(JSON.stringify(validation.issues));
    await writeJson(`${outputDir}/${filename}.json`, artifact);
  };
  let transport: Awaited<ReturnType<typeof createLiveSession>> | undefined;
  let session: Awaited<ReturnType<typeof openBrowserSession>> | undefined;
  try {
    if (!options.captureOnly) {
      progress('Waiting for the Figma plugin connection…');
      transport = await createLiveSession(
        runId,
        options.pluginTimeoutMs ?? 120_000,
        options.pluginPort ?? 3847,
      );
      options.onConnection?.(transport.descriptor);
      await transport.waitForConnection();
      progress('Figma plugin connected. Capturing the page…');
    } else progress('Capture-only mode. Capturing the page…');

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
    const capturedSourceIds = new Set(
      captured.nodes.map((node) => node.sourceNodeId),
    );
    const capturedMediaAssets = media.assets.filter((asset) =>
      capturedSourceIds.has(asset.sourceNodeId),
    );
    const orphanAssetDiagnostics: Diagnostic[] = media.assets
      .filter((asset) => !capturedSourceIds.has(asset.sourceNodeId))
      .map((asset) => ({
        code: 'ASSET_SOURCE_NOT_CAPTURED',
        severity: 'warning',
        sourceNodeId: asset.sourceNodeId,
        message:
          'A dynamic asset source disappeared before DOM capture and was omitted.',
      }));
    const screenshot = await captureScreenshot(session.page);
    await writeFile(`${outputDir}/reference.png`, screenshot.bytes);
    for (const asset of media.assets)
      await writeFile(`${outputDir}/assets/${asset.contentHash}`, asset.bytes);

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
        assets: capturedMediaAssets.map((asset) => {
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
    const deterministic = inferLayout(ir);
    if (inferenceMode === 'agentic')
      await persist(deterministic, 'deterministic-inference');

    const fallbackSources = new Set(
      capturedMediaAssets
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
      ...orphanAssetDiagnostics,
      ...screenshot.diagnostics,
    ];

    const provider =
      inferenceMode === 'agentic'
        ? (options.provider ??
          createCodexInferenceProvider({
            cwd: process.cwd(),
            timeoutMs: options.providerTimeoutMs ?? 120_000,
            maxOutputBytes: options.maxProviderOutputBytes ?? 2_000_000,
          }))
        : undefined;
    let selectedInference: InferenceArtifact | AgenticInferenceArtifact =
      deterministic;
    let initialRequest: AgentInferenceRequest | undefined;
    let initialUsage: InferenceUsage | undefined;
    let agentAvailable = provider !== undefined;
    if (provider !== undefined) {
      progress(`Running initial inference with ${provider.providerId}…`);
      try {
        initialRequest = buildPipelineAgentRequest(
          ir,
          deterministic,
          'initial',
          1,
          (options.maxRenders ?? 3) - 1,
          diagnostics,
          { referenceImagePath: resolve(outputDir, 'reference.png') },
        );
        const inferred = await provider.infer(initialRequest);
        if (inferred.ok) {
          initialUsage = inferred.usage;
          if (inferred.diagnostic !== undefined)
            diagnostics.push(inferred.diagnostic);
          try {
            selectedInference = mergeAgentInference(
              ir,
              deterministic,
              inferred.proposal,
              { maxDecisions: initialRequest.invariants.maxDecisions },
            );
          } catch (error) {
            diagnostics.push({
              code: 'AGENT_PROPOSAL_INVALID',
              severity: 'error',
              message:
                error instanceof Error
                  ? error.message
                  : 'Agent proposal could not be merged.',
            });
            agentAvailable = false;
          }
        } else {
          diagnostics.push(inferred.diagnostic);
          agentAvailable = false;
        }
      } catch (error) {
        diagnostics.push({
          code: 'AGENT_PROVIDER_FAILED',
          severity: 'error',
          message:
            error instanceof Error ? error.message : 'Agent provider failed.',
        });
        agentAvailable = false;
      }
      if (!agentAvailable)
        selectedInference = mergeAgentInference(
          ir,
          deterministic,
          { decisions: [] },
          {
            maxDecisions: initialRequest?.invariants.maxDecisions ?? 100,
          },
        );
    }

    if (options.captureOnly) {
      diagnostics.push({
        code: 'CAPTURE_ONLY',
        severity: 'warning',
        message: 'Capture-only mode; Figma import and visual QA were not run.',
      });
      const scene = compileScene(ir, selectedInference);
      await persist(selectedInference);
      await persist(scene);
      const result = placeholderImport(raw, scene, diagnostics);
      const qa = placeholderQa(raw, scene.payload.sourceNodeIds);
      await persist(result);
      await persist(qa);
      if (inferenceMode === 'agentic')
        await writeJson(`${outputDir}/correction-history.json`, {
          providerId: provider?.providerId,
          stopReason: 'capture-only',
          initialRequest,
          initialUsage,
          diagnostics,
          passes: [],
        });
      return await finishRun({
        runId,
        raw,
        outputDir,
        inferenceMode,
        ...(provider === undefined ? {} : { providerId: provider.providerId }),
        result,
        qa,
        diagnostics,
        ...(initialUsage === undefined ? {} : { usage: initialUsage }),
      });
    }

    if (transport === undefined) throw new Error('Live session unavailable');
    const liveTransport = transport;
    const revisions = new Map<number, RenderedRevision>();
    let history: CandidateHistory | undefined;
    let usage = initialUsage;
    try {
      const renderRevision = async (
        inference: AgenticInferenceArtifact | InferenceArtifact,
        revision: number,
      ) => {
        progress(`Rendering candidate ${revision + 1}…`);
        const scene = compileScene(ir, inference);
        const response = await liveTransport.renderCandidate({
          type: 'candidate-request',
          revision,
          protocolVersion: LIVE_PROTOCOL_VERSION,
          runId,
          scene,
          assets: uniqueWireAssets(capturedMediaAssets),
          width: screenshot.width,
          height: screenshot.height,
        });
        const qa = response.png
          ? measuredQa(
              raw,
              screenshot,
              response.png,
              scene.payload.sourceNodeIds,
            )
          : placeholderQa(raw, scene.payload.sourceNodeIds);
        const bytes = response.png
          ? Buffer.from(response.png, 'base64')
          : undefined;
        if (bytes !== undefined)
          await writeFile(`${outputDir}/candidate-${revision}.png`, bytes);
        await persist(scene, `candidate-${revision}-figma-scene`);
        await persist(response.result, `candidate-${revision}-import-result`);
        await persist(qa, `candidate-${revision}-qa-report`);
        const classifications = classifyQaDiscrepancies(
          qa,
          ir,
          response.result.payload.diagnostics,
        );
        const candidate: QaCandidate = {
          revision,
          report: qa,
          classifications,
          editabilityViolations: countEditabilityViolations(
            ir,
            scene,
            response.result,
          ),
        };
        revisions.set(revision, { response, scene, qa, candidate });
        progress(
          `Candidate ${revision + 1}: SSIM ${qa.payload.metrics.ssim.toFixed(4)}, changed pixels ${(qa.payload.metrics.changedPixelRatio * 100).toFixed(2)}%.`,
        );
        return {
          qa: candidate,
          diagnostics: response.result.payload.diagnostics,
        };
      };

      let selectedRevision = 0;
      if (inferenceMode === 'agentic' && provider !== undefined) {
        const baselineInference = selectedInference as AgenticInferenceArtifact;
        const correction = await runCorrectionLoop({
          provider,
          baselineInference,
          maxRenders: agentAvailable ? (options.maxRenders ?? 3) : 1,
          ...(initialRequest === undefined
            ? {}
            : { baselineRequest: initialRequest }),
          ...(initialUsage === undefined
            ? {}
            : { baselineUsage: initialUsage }),
          baselineDiagnostics: diagnostics,
          renderCandidate: renderRevision,
          buildRequest(revision, currentHistory) {
            const previous = currentHistory.passes.at(-1);
            const previousRender =
              previous === undefined
                ? undefined
                : revisions.get(previous.revision);
            return buildPipelineAgentRequest(
              ir,
              deterministic,
              'correction',
              revision + 1,
              Math.max(0, (options.maxRenders ?? 3) - revision - 1),
              previous?.qa.report.payload.diagnostics ?? diagnostics,
              {
                referenceImagePath: resolve(outputDir, 'reference.png'),
                ...(previousRender?.response.png
                  ? {
                      candidateImagePath: resolve(
                        outputDir,
                        `candidate-${previousRender.candidate.revision}.png`,
                      ),
                    }
                  : {}),
              },
            );
          },
          mergeProposal(proposal, previous) {
            return mergeAgentInference(ir, previous, proposal, {
              maxDecisions: 100,
            });
          },
        });
        history = correction.history;
        selectedRevision = correction.selected.revision;
        selectedInference = correction.selected.inference;
        usage = sumUsage(correction.history.passes.map((pass) => pass.usage));
        await writeJson(
          `${outputDir}/correction-history.json`,
          correction.history,
        );
      } else {
        await renderRevision(selectedInference, 0);
      }
      progress(`Finalizing candidate ${selectedRevision + 1}…`);
      await liveTransport.finalize(selectedRevision);
      const selected = revisions.get(selectedRevision);
      if (selected === undefined)
        throw new Error('Selected candidate is missing.');
      diagnostics.push(...selected.response.result.payload.diagnostics);
      await persist(selectedInference);
      await persist(selected.scene);
      await persist(selected.response.result);
      await persist(selected.qa);
      if (selected.response.png) {
        const bytes = Buffer.from(selected.response.png, 'base64');
        await writeFile(`${outputDir}/figma.png`, bytes);
      }
      progress('Candidate finalized. Writing the run report…');
      return await finishRun({
        runId,
        raw,
        outputDir,
        inferenceMode,
        ...(provider === undefined ? {} : { providerId: provider.providerId }),
        result: selected.response.result,
        qa: selected.qa,
        diagnostics,
        ...(usage === undefined ? {} : { usage }),
        destination: selected.response.destination,
        ...(history === undefined ? {} : { history }),
      });
    } catch (error) {
      diagnostics.push({
        code: 'IMPORT_OR_QA_FAILED',
        severity: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Import or visual QA failed.',
      });
      const retained = revisions.get(history?.selectedRevision ?? 0);
      const scene = retained?.scene ?? compileScene(ir, selectedInference);
      const result =
        retained?.response.result ?? placeholderImport(raw, scene, diagnostics);
      const qa =
        retained?.qa ?? placeholderQa(raw, scene.payload.sourceNodeIds);
      await persist(selectedInference);
      await persist(scene);
      await persist({
        ...result,
        payload: {
          ...result.payload,
          status: 'partial',
          diagnostics: [
            ...result.payload.diagnostics,
            ...diagnostics.filter(
              (diagnostic) =>
                !result.payload.diagnostics.some(
                  (existing) =>
                    existing.code === diagnostic.code &&
                    existing.message === diagnostic.message,
                ),
            ),
          ],
        },
      });
      await persist(qa);
      if (inferenceMode === 'agentic')
        await writeJson(
          `${outputDir}/correction-history.json`,
          history ?? {
            passes: [],
            stopReason: 'invalid-output',
            diagnostics,
          },
        );
      return await finishRun({
        runId,
        raw,
        outputDir,
        inferenceMode,
        ...(provider === undefined ? {} : { providerId: provider.providerId }),
        result,
        qa,
        diagnostics,
        ...(usage === undefined ? {} : { usage }),
        ...(history === undefined ? {} : { history }),
      });
    }
  } finally {
    await session?.close();
    await transport?.close();
  }
}

function buildPipelineAgentRequest(
  ir: WebsiteIrArtifact,
  deterministic: InferenceArtifact,
  stage: 'initial' | 'correction',
  pass: number,
  remainingPasses: number,
  diagnostics: Diagnostic[],
  visualEvidence?: AgentInferenceRequest['visualEvidence'],
): AgentInferenceRequest {
  const batch = buildAgentInferenceRequests(ir, deterministic, {
    maxNodesPerRequest: 15_000,
    maxTextCharactersPerNode: 4_000,
    maxRequestBytes: 16_000_000,
    maxDecisionsPerRequest: 100,
    stage,
    pass,
    remainingPasses,
    diagnostics,
  });
  const first = batch.requests[0];
  if (first === undefined) throw new Error('Agent inference request is empty.');
  const nodes = new Map(
    batch.requests
      .flatMap((request) => request.section.nodes)
      .map((node) => [node.sourceNodeId, node]),
  );
  const request: AgentInferenceRequest = {
    ...first,
    section: {
      sectionId:
        ir.payload.nodes.find((node) => node.nodeId === ir.payload.rootNodeId)
          ?.sourceNodeId ?? first.section.sectionId,
      nodes: [...nodes.values()],
    },
    ...(visualEvidence === undefined ? {} : { visualEvidence }),
  };
  if (
    nodes.size > 15_000 ||
    Buffer.byteLength(JSON.stringify(request), 'utf8') > 16_000_000
  )
    throw new Error('Combined agent evidence exceeds the node or byte budget.');
  return request;
}

function uniqueWireAssets(
  assets: Array<{ contentHash?: string; bytes: Buffer }>,
) {
  return [
    ...new Map(
      assets.map((asset) => [
        asset.contentHash,
        {
          contentHash: asset.contentHash ?? '',
          base64: asset.bytes.toString('base64'),
        },
      ]),
    ).values(),
  ];
}

function measuredQa(
  raw: RawCaptureArtifact,
  screenshot: { bytes: Buffer; width: number; height: number },
  encoded: string,
  sourceNodeIds: string[],
): QaReportArtifact {
  const bytes = Buffer.from(encoded, 'base64');
  const candidate = decodePng(bytes);
  const qa = compareImages(
    screenshot,
    { bytes, width: candidate.width, height: candidate.height },
    { runId: raw.runId, sourceUrl: raw.sourceUrl, capturedAt: raw.capturedAt },
  );
  qa.viewport = raw.viewport;
  qa.payload.sourceNodeIds = sourceNodeIds;
  return qa;
}

function placeholderImport(
  raw: RawCaptureArtifact,
  scene: ReturnType<typeof compileScene>,
  diagnostics: Diagnostic[],
): ImportResultArtifact {
  return {
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
}

function placeholderQa(
  raw: RawCaptureArtifact,
  sourceNodeIds: string[],
): QaReportArtifact {
  return {
    ...raw,
    artifactKind: 'qa-report',
    payload: {
      status: 'partial',
      sourceNodeIds,
      reference: { width: raw.viewport.width, height: raw.viewport.height },
      candidate: { width: raw.viewport.width, height: raw.viewport.height },
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
}

function countEditabilityViolations(
  ir: WebsiteIrArtifact,
  scene: ReturnType<typeof compileScene>,
  result: ImportResultArtifact,
): number {
  const sceneById = new Map(
    scene.payload.nodes.map((node) => [node.sceneNodeId, node]),
  );
  const sourceById = new Map(
    ir.payload.nodes.map((node) => [node.sourceNodeId, node]),
  );
  return result.payload.nodes.filter((node) => {
    const sceneNode = sceneById.get(node.sceneNodeId);
    const source = sceneNode
      ? sourceById.get(sceneNode.sourceNodeId)
      : undefined;
    return source?.kind === 'text' && node.status !== 'created';
  }).length;
}

function sumUsage(
  values: Array<InferenceUsage | undefined>,
): InferenceUsage | undefined {
  const present = values.filter(
    (value): value is InferenceUsage => value !== undefined,
  );
  if (present.length === 0) return undefined;
  const inputTokens = present.reduce(
    (sum, value) => sum + (value.inputTokens ?? 0),
    0,
  );
  const outputTokens = present.reduce(
    (sum, value) => sum + (value.outputTokens ?? 0),
    0,
  );
  const totalTokens = present.reduce(
    (sum, value) => sum + (value.totalTokens ?? 0),
    0,
  );
  return { inputTokens, outputTokens, totalTokens };
}

async function finishRun(input: {
  runId: string;
  raw: RawCaptureArtifact;
  outputDir: string;
  inferenceMode: InferenceMode;
  providerId?: string;
  result: ImportResultArtifact;
  qa: QaReportArtifact;
  diagnostics: Diagnostic[];
  usage?: InferenceUsage;
  destination?: unknown;
  history?: CandidateHistory;
}) {
  const status =
    input.result.payload.status === 'success' &&
    input.qa.payload.status === 'pass' &&
    input.diagnostics.length === 0
      ? ('success' as const)
      : ('partial' as const);
  const counts = {
    created: input.result.payload.nodes.filter(
      (node) => node.status === 'created',
    ).length,
    skipped: input.result.payload.nodes.filter(
      (node) => node.status === 'skipped',
    ).length,
    failed: input.result.payload.nodes.filter(
      (node) => node.status === 'failed',
    ).length,
    assets: input.raw.payload.assets.length,
  };
  const report = formatRunReport({
    runId: input.runId,
    sourceUrl: input.raw.sourceUrl,
    outputDir: input.outputDir,
    status,
    inferenceMode: input.inferenceMode,
    ...(input.providerId === undefined ? {} : { providerId: input.providerId }),
    counts,
    diagnostics: input.diagnostics,
    metrics: input.qa.payload.metrics,
    ...(input.usage === undefined ? {} : { usage: input.usage }),
    ...(input.history === undefined ? {} : { history: input.history }),
  });
  await writeFile(`${input.outputDir}/run-report.md`, report);
  await writeFile('.artifacts/latest-run.md', report);
  return {
    runId: input.runId,
    status,
    outputDir: input.outputDir,
    destination: input.destination,
    diagnostics: input.diagnostics,
    metrics: input.qa.payload.metrics,
    counts,
    inferenceMode: input.inferenceMode,
    providerId: input.providerId,
    usage: input.usage,
    selectedRevision: input.history?.selectedRevision,
    stopReason: input.history?.stopReason,
  };
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, JSON.stringify(value, null, 2));
}
