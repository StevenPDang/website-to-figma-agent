import { describe, expect, it } from 'vitest';
import { startFixtureServer } from '@website-to-figma/browser-extractor';
import { runImport } from './pipeline.js';

describe('runImport', () => {
  it('runs stages in order and persists artifacts', async () => {
    const fixture = await startFixtureServer('<main><h1>Pipeline</h1></main>');
    const result = await runImport({
      url: fixture.url,
      allowLoopback: true,
      outputDir: '.tmp-pipeline-test',
    });
    expect(result.status).toBe('success');
    expect(result.outputDir).toBe('.tmp-pipeline-test');
    await fixture.close();
  }, 20_000);
});
