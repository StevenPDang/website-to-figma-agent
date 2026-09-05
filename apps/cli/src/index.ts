#!/usr/bin/env node
import { runImport } from './pipeline.js';
const [, , command, url, ...rest] = process.argv;
if (command !== 'import' || !url) {
  console.error(
    'Usage: website-to-figma import <url> [--output <dir>] [--capture-only] [--plugin-timeout <seconds>]',
  );
  process.exitCode = 2;
} else {
  const outputIndex = rest.indexOf('--output');
  const outputDir = outputIndex >= 0 ? rest[outputIndex + 1] : undefined;
  const timeoutIndex = rest.indexOf('--plugin-timeout');
  const seconds = timeoutIndex >= 0 ? Number(rest[timeoutIndex + 1]) : 120;
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 540)
    throw new Error('Plugin timeout must be between 1 and 540 seconds');
  runImport({
    url,
    ...(outputDir ? { outputDir } : {}),
    captureOnly: rest.includes('--capture-only'),
    pluginTimeoutMs: seconds * 1000,
    onConnection: (descriptor) => {
      console.error(
        'Open the Website to Figma development plugin in your destination page. Paste this short-lived connection JSON; capture will wait until the plugin connects:',
      );
      console.error(JSON.stringify(descriptor));
    },
  })
    .then((result) => {
      console.error(`Human-readable report: ${result.outputDir}/run-report.md`);
      console.error('Latest report: .artifacts/latest-run.md');
      console.log(JSON.stringify(result));
      process.exitCode = result.status === 'success' ? 0 : 2;
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
