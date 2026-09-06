import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  createAgentInferenceProposalSchema,
  INFERENCE_SCHEMA_VERSION,
  validateArtifact,
} from '@website-to-figma/contracts';

import { buildCodexPrompt } from './codex-prompt.js';
import type {
  AgentInferenceRequest,
  AgentInferenceResult,
  InferenceProvider,
  InferenceUsage,
} from './provider.js';

export interface CodexInferenceProviderOptions {
  executable?: string;
  cwd: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
  tempRoot?: string;
  environment?: NodeJS.ProcessEnv;
}

interface ProcessResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  error?: NodeJS.ErrnoException;
  timedOut: boolean;
  outputTooLarge: boolean;
}

export function createCodexInferenceProvider(
  options: CodexInferenceProviderOptions,
): InferenceProvider {
  const executable = options.executable ?? 'codex';
  const timeoutMs = options.timeoutMs ?? 120_000;
  const maxOutputBytes = options.maxOutputBytes ?? 2_000_000;
  return {
    providerId: 'local-codex',
    async infer(request) {
      const temporaryDirectory = await mkdtemp(
        join(options.tempRoot ?? tmpdir(), 'website-to-figma-codex-'),
      );
      try {
        const schemaPath = join(temporaryDirectory, 'proposal.schema.json');
        const outputPath = join(temporaryDirectory, 'proposal.json');
        await writeFile(
          schemaPath,
          JSON.stringify(createAgentInferenceProposalSchema()),
          'utf8',
        );
        const result = await runCodex({
          executable,
          cwd: options.cwd,
          schemaPath,
          outputPath,
          prompt: buildCodexPrompt(request),
          imagePaths: [
            ...(request.visualEvidence === undefined
              ? []
              : [request.visualEvidence.referenceImagePath]),
            ...(request.visualEvidence?.candidateImagePath === undefined
              ? []
              : [request.visualEvidence.candidateImagePath]),
          ],
          timeoutMs,
          maxOutputBytes,
          environment: options.environment ?? minimalEnvironment(),
        });
        const failure = processFailure(result, executable, timeoutMs);
        if (failure !== undefined) return failure;
        const proposal = await readProposal(
          outputPath,
          maxOutputBytes,
          request,
        );
        if (!proposal.ok) return proposal;
        const usage = parseUsage(result.stdout);
        return {
          ok: true,
          proposal: proposal.proposal,
          ...(usage === undefined ? {} : { usage }),
        };
      } finally {
        await rm(temporaryDirectory, { recursive: true, force: true });
      }
    },
  };
}

async function runCodex(options: {
  executable: string;
  cwd: string;
  schemaPath: string;
  outputPath: string;
  prompt: string;
  imagePaths: string[];
  timeoutMs: number;
  maxOutputBytes: number;
  environment: NodeJS.ProcessEnv;
}): Promise<ProcessResult> {
  return new Promise((resolve) => {
    const child = spawn(
      options.executable,
      [
        '-C',
        options.cwd,
        'exec',
        '--ephemeral',
        '--sandbox',
        'read-only',
        '--color',
        'never',
        '--json',
        '--output-schema',
        options.schemaPath,
        '--output-last-message',
        options.outputPath,
        ...options.imagePaths.flatMap((path) => ['--image', path]),
        '-',
      ],
      {
        cwd: options.cwd,
        env: options.environment,
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );
    let stdout = '';
    let stderr = '';
    let outputBytes = 0;
    let outputTooLarge = false;
    let timedOut = false;
    let spawnError: NodeJS.ErrnoException | undefined;
    const append = (current: string, chunk: Buffer): string => {
      outputBytes += chunk.byteLength;
      if (outputBytes > options.maxOutputBytes) {
        outputTooLarge = true;
        child.kill('SIGKILL');
        return current;
      }
      return current + chunk.toString('utf8');
    };
    child.stdout.on('data', (chunk: Buffer) => {
      stdout = append(stdout, chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = append(stderr, chunk);
    });
    child.on('error', (error: NodeJS.ErrnoException) => {
      spawnError = error;
    });
    child.stdin.on('error', () => undefined);
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, options.timeoutMs);
    child.on('close', (exitCode) => {
      clearTimeout(timer);
      resolve({
        exitCode,
        stdout,
        stderr,
        ...(spawnError === undefined ? {} : { error: spawnError }),
        timedOut,
        outputTooLarge,
      });
    });
    child.stdin.end(options.prompt);
  });
}

function processFailure(
  result: ProcessResult,
  executable: string,
  timeoutMs: number,
): AgentInferenceResult | undefined {
  if (result.error?.code === 'ENOENT') {
    return failure(
      'CODEX_NOT_FOUND',
      `Codex executable ${executable} was not found.`,
    );
  }
  if (result.timedOut) {
    return failure('CODEX_TIMEOUT', `Codex inference exceeded ${timeoutMs}ms.`);
  }
  if (result.outputTooLarge) {
    return failure(
      'CODEX_OUTPUT_TOO_LARGE',
      'Codex process output exceeded its byte budget.',
    );
  }
  if (result.error !== undefined) {
    return failure('CODEX_PROCESS_FAILED', result.error.message);
  }
  if (result.exitCode !== 0) {
    const detail = (
      result.stderr.trim() ||
      extractProcessError(result.stdout) ||
      ''
    ).slice(0, 512);
    return failure(
      'CODEX_EXIT_FAILED',
      `Codex exited with status ${result.exitCode}.${detail.length === 0 ? '' : ` ${detail}`}`,
    );
  }
  return undefined;
}

function extractProcessError(stdout: string): string | undefined {
  for (const line of stdout.trim().split('\n').reverse()) {
    try {
      const event: unknown = JSON.parse(line);
      if (typeof event !== 'object' || event === null) continue;
      for (const key of ['message', 'error']) {
        const value = readUnknownProperty(event, key);
        if (typeof value === 'string' && value.length > 0) return value;
        if (typeof value === 'object' && value !== null) {
          const nestedMessage = readUnknownProperty(value, 'message');
          if (typeof nestedMessage === 'string' && nestedMessage.length > 0) {
            return nestedMessage;
          }
        }
      }
    } catch {
      // Ignore non-JSON process output while looking for a structured error event.
    }
  }
  return undefined;
}

async function readProposal(
  outputPath: string,
  maxOutputBytes: number,
  request: AgentInferenceRequest,
): Promise<AgentInferenceResult> {
  try {
    const outputStat = await stat(outputPath);
    if (outputStat.size > maxOutputBytes) {
      return failure(
        'CODEX_OUTPUT_TOO_LARGE',
        'Codex proposal exceeded its byte budget.',
      );
    }
    const parsed: unknown = JSON.parse(await readFile(outputPath, 'utf8'));
    const wrapped = wrapProposal(parsed, request);
    const validated = validateArtifact(wrapped);
    if (
      !validated.ok ||
      validated.value.schemaVersion !== INFERENCE_SCHEMA_VERSION
    ) {
      return failure(
        'CODEX_INVALID_OUTPUT',
        'Codex returned a proposal that does not match the inference schema.',
      );
    }
    return {
      ok: true,
      proposal: { decisions: validated.value.payload.proposedDecisions },
    };
  } catch (error) {
    return failure(
      'CODEX_INVALID_OUTPUT',
      error instanceof Error
        ? error.message
        : 'Codex proposal could not be read.',
    );
  }
}

function wrapProposal(
  parsed: unknown,
  request: AgentInferenceRequest,
): unknown {
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    Array.isArray(parsed) ||
    Object.keys(parsed).length !== 1 ||
    !Object.hasOwn(parsed, 'decisions')
  ) {
    return undefined;
  }
  const decisions = readUnknownProperty(parsed, 'decisions');
  return {
    schemaVersion: INFERENCE_SCHEMA_VERSION,
    artifactKind: 'inference',
    runId: request.runId,
    sourceUrl: 'https://local-inference.invalid/',
    capturedAt: '1970-01-01T00:00:00.000Z',
    viewport: request.viewport,
    payload: {
      sourceNodeIds: request.invariants.sourceNodeIds,
      decisions: Array.isArray(decisions) ? decisions : [],
      deterministicDecisions: request.shared.deterministicDecisions,
      proposedDecisions: decisions,
      rejectedDecisions: [],
      mergeOutcomes: Array.isArray(decisions)
        ? decisions.map((decision: unknown) => ({
            decisionId:
              typeof decision === 'object' && decision !== null
                ? readUnknownProperty(decision, 'decisionId')
                : undefined,
            status: 'accepted',
          }))
        : [],
    },
  };
}

function parseUsage(stdout: string): InferenceUsage | undefined {
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;
  for (const line of stdout.split('\n')) {
    try {
      const event: unknown = JSON.parse(line);
      const usage = findUsage(event);
      inputTokens = usage?.inputTokens ?? inputTokens;
      outputTokens = usage?.outputTokens ?? outputTokens;
    } catch {
      // Process output is diagnostic only; the schema-validated result file is authoritative.
    }
  }
  if (inputTokens === undefined && outputTokens === undefined) return undefined;
  return {
    ...(inputTokens === undefined ? {} : { inputTokens }),
    ...(outputTokens === undefined ? {} : { outputTokens }),
    ...(inputTokens === undefined || outputTokens === undefined
      ? {}
      : { totalTokens: inputTokens + outputTokens }),
  };
}

function findUsage(
  value: unknown,
): { inputTokens?: number; outputTokens?: number } | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const input = readUnknownProperty(value, 'input_tokens');
  const output = readUnknownProperty(value, 'output_tokens');
  if (typeof input === 'number' || typeof output === 'number') {
    return {
      ...(typeof input === 'number' ? { inputTokens: input } : {}),
      ...(typeof output === 'number' ? { outputTokens: output } : {}),
    };
  }
  for (const nested of Object.values(value as Record<string, unknown>)) {
    const usage = findUsage(nested);
    if (usage !== undefined) return usage;
  }
  return undefined;
}

function readUnknownProperty(value: object, key: string): unknown {
  return (value as Record<string, unknown>)[key];
}

function minimalEnvironment(): NodeJS.ProcessEnv {
  return Object.fromEntries(
    [
      'PATH',
      'HOME',
      'CODEX_HOME',
      'LANG',
      'LC_ALL',
      'SSL_CERT_FILE',
      'SSL_CERT_DIR',
    ]
      .map((name) => [name, process.env[name]])
      .filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
}

function failure(code: string, message: string): AgentInferenceResult {
  return {
    ok: false,
    diagnostic: { code, severity: 'error', message },
  };
}
