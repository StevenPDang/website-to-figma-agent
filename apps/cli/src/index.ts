#!/usr/bin/env node
import { runImport } from './pipeline.js';
const [, , command, url, ...rest] = process.argv;
if (command !== 'import' || !url) {
  console.error('Usage: website-to-figma import <url> [--output <dir>]');
  process.exitCode = 2;
} else {
  const outputIndex = rest.indexOf('--output');
  const outputDir = outputIndex >= 0 ? rest[outputIndex + 1] : undefined;
  runImport({ url, ...(outputDir ? { outputDir } : {}) })
    .then((result) => {
      console.log(JSON.stringify(result));
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
