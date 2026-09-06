import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { startFixtureServer } from '@website-to-figma/browser-extractor';
import {
  validateArtifact,
  type RawCaptureArtifact,
} from '@website-to-figma/contracts';
import { runImport } from './pipeline.js';
import { createFakeInferenceProvider } from '@website-to-figma/inference';

describe('runImport', () => {
  it('retains valid capture artifacts and reports missing import as partial', async () => {
    const fixture = await startFixtureServer(
      '<main><h1>Pipeline</h1><svg width="10" height="10"><rect width="10" height="10"/></svg></main>',
    );
    const outputDir = await mkdtemp(join(tmpdir(), 'figma-pipeline-'));
    try {
      const result = await runImport({
        url: fixture.url,
        allowLoopback: true,
        captureOnly: true,
        outputDir,
      });
      expect(result.status).toBe('partial');
      for (const name of [
        'raw-capture',
        'website-ir',
        'inference',
        'figma-scene',
        'import-result',
        'qa-report',
      ]) {
        const artifact: unknown = JSON.parse(
          await readFile(join(outputDir, `${name}.json`), 'utf8'),
        );
        expect(validateArtifact(artifact).ok, name).toBe(true);
      }
      const raw = JSON.parse(
        await readFile(join(outputDir, 'raw-capture.json'), 'utf8'),
      ) as RawCaptureArtifact;
      expect(raw.payload.assets).toHaveLength(1);
      expect(
        (await readFile(join(outputDir, 'reference.png'))).length,
      ).toBeGreaterThan(0);
      const hash = raw.payload.assets[0]?.contentHash ?? '';
      expect(
        (await readFile(join(outputDir, 'assets', hash))).toString(),
      ).toContain('<svg');
    } finally {
      await fixture.close();
      await rm(outputDir, { recursive: true, force: true });
    }
  }, 20_000);
});

it('runs capture-only agentic inference through the provider-neutral adapter', async () => {
  const fixture = await startFixtureServer(
    '<main><h1>Agentic pipeline</h1><section><p>Editable</p></section></main>',
  );
  const outputDir = await mkdtemp(join(tmpdir(), 'figma-agentic-pipeline-'));
  const provider = createFakeInferenceProvider('fixture-provider', [
    {
      ok: true,
      proposal: { decisions: [] },
      usage: { inputTokens: 20, outputTokens: 4, totalTokens: 24 },
    },
  ]);
  try {
    const result = await runImport({
      url: fixture.url,
      allowLoopback: true,
      captureOnly: true,
      outputDir,
      inferenceMode: 'agentic',
      provider,
      maxRenders: 1,
    });
    expect(result).toMatchObject({
      status: 'partial',
      inferenceMode: 'agentic',
      providerId: 'fixture-provider',
      usage: { totalTokens: 24 },
    });
    expect(provider.requests).toHaveLength(1);
    expect(provider.requests[0]).toMatchObject({
      stage: 'initial',
      invariants: { ordinaryTextMustRemainEditable: true },
    });
    const inference: unknown = JSON.parse(
      await readFile(join(outputDir, 'inference.json'), 'utf8'),
    );
    expect(validateArtifact(inference)).toMatchObject({
      ok: true,
      value: { schemaVersion: '1.1.0' },
    });
    const history = JSON.parse(
      await readFile(join(outputDir, 'correction-history.json'), 'utf8'),
    ) as Record<string, unknown>;
    expect(history).toMatchObject({
      providerId: 'fixture-provider',
      stopReason: 'capture-only',
      initialUsage: { totalTokens: 24 },
    });
  } finally {
    await fixture.close();
    await rm(outputDir, { recursive: true, force: true });
  }
}, 20_000);

it('persists deterministic fallback artifacts when the agent provider fails', async () => {
  const fixture = await startFixtureServer('<main><p>Fallback</p></main>');
  const outputDir = await mkdtemp(join(tmpdir(), 'figma-agent-fallback-'));
  const provider = createFakeInferenceProvider('failed-provider', []);
  try {
    const result = await runImport({
      url: fixture.url,
      allowLoopback: true,
      captureOnly: true,
      outputDir,
      inferenceMode: 'agentic',
      provider,
    });
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'FAKE_PROVIDER_EXHAUSTED' }),
      ]),
    );
    const fallback: unknown = JSON.parse(
      await readFile(join(outputDir, 'inference.json'), 'utf8'),
    );
    expect(validateArtifact(fallback).ok).toBe(true);
    expect(
      JSON.parse(
        await readFile(join(outputDir, 'deterministic-inference.json'), 'utf8'),
      ),
    ).toMatchObject({ schemaVersion: '1.0.0' });
  } finally {
    await fixture.close();
    await rm(outputDir, { recursive: true, force: true });
  }
}, 20_000);
