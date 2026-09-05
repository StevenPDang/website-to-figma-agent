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
