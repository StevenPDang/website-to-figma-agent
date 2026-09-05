import { chmod, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createCodexInferenceProvider } from './codex-provider.js';
import type { AgentInferenceRequest } from './provider.js';

const request: AgentInferenceRequest = {
  runId: 'run:success',
  stage: 'initial',
  pass: 1,
  remainingPasses: 2,
  viewport: { width: 800, height: 600, deviceScaleFactor: 1 },
  section: { sectionId: 'source:root', nodes: [] },
  shared: { deterministicDecisions: [], assets: [] },
  diagnostics: [],
  invariants: {
    sourceNodeIds: ['source:root'],
    maxDecisions: 10,
    ordinaryTextMustRemainEditable: true,
  },
};

let directory = '';
let executable = '';

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'codex-provider-test-'));
  executable = join(directory, 'fake-codex');
  await writeFile(
    executable,
    `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.writeFileSync(require('node:path').join(process.cwd(), 'args.json'), JSON.stringify(args));
let prompt = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { prompt += chunk; });
process.stdin.on('end', () => {
  fs.writeFileSync(require('node:path').join(process.cwd(), 'prompt.txt'), prompt);
  const encoded = prompt.match(/<untrusted-page-data encoding="json-base64">\\n([^\\n]+)/)[1];
  const request = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
  const outputIndex = args.indexOf('--output-last-message');
  const outputPath = args[outputIndex + 1];
  if (request.runId === 'run:hang') return setTimeout(() => {}, 60000);
  if (request.runId === 'run:nonzero') return process.exit(7);
  if (request.runId === 'run:oversized') {
    process.stdout.write('x'.repeat(10000));
    return;
  }
  fs.writeFileSync(outputPath, request.runId === 'run:malformed' ? '{bad' : JSON.stringify({ decisions: [] }));
  process.stdout.write(JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 12, output_tokens: 3 } }) + '\\n');
});
`,
    'utf8',
  );
  await chmod(executable, 0o755);
});

afterEach(() => {
  directory = '';
  executable = '';
});

function provider(overrides: Record<string, unknown> = {}) {
  return createCodexInferenceProvider({
    executable,
    cwd: directory,
    timeoutMs: 2_000,
    maxOutputBytes: 4_000,
    tempRoot: directory,
    ...overrides,
  });
}

describe('createCodexInferenceProvider', () => {
  it('uses isolated arguments and normalizes proposal and usage', async () => {
    const result = await provider().infer(request);

    expect(result).toEqual({
      ok: true,
      proposal: { decisions: [] },
      usage: { inputTokens: 12, outputTokens: 3, totalTokens: 15 },
    });
    const args = JSON.parse(
      await readFile(join(directory, 'args.json'), 'utf8'),
    );
    expect(args).toEqual(
      expect.arrayContaining(['exec', '--ephemeral', '--sandbox', 'read-only']),
    );
    expect(args).not.toContain('--dangerously-bypass-approvals-and-sandbox');
  });

  it.each([
    ['run:nonzero', 'CODEX_EXIT_FAILED'],
    ['run:malformed', 'CODEX_INVALID_OUTPUT'],
    ['run:oversized', 'CODEX_OUTPUT_TOO_LARGE'],
  ])('returns %s as a structured failure', async (runId, code) => {
    const result = await provider().infer({ ...request, runId });
    expect(result).toEqual({
      ok: false,
      diagnostic: expect.objectContaining({ code, severity: 'error' }),
    });
  });

  it('bounds execution time', async () => {
    const result = await provider({ timeoutMs: 30 }).infer({
      ...request,
      runId: 'run:hang',
    });
    expect(result).toEqual({
      ok: false,
      diagnostic: expect.objectContaining({ code: 'CODEX_TIMEOUT' }),
    });
  });

  it('handles a missing executable', async () => {
    const result = await provider({
      executable: join(directory, 'missing'),
    }).infer(request);
    expect(result).toEqual({
      ok: false,
      diagnostic: expect.objectContaining({ code: 'CODEX_NOT_FOUND' }),
    });
  });
});
