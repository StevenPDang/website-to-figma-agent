import type { Diagnostic } from '@website-to-figma/contracts';

export interface RunReportInput {
  runId: string;
  sourceUrl: string;
  outputDir: string;
  status: string;
  counts: { created: number; skipped: number; failed: number; assets: number };
  diagnostics: Diagnostic[];
  metrics: { ssim: number; changedPixelRatio: number };
}

export function formatRunReport(input: RunReportInput): string {
  const grouped = new Map<string, Diagnostic[]>();
  for (const diagnostic of input.diagnostics) {
    const list = grouped.get(diagnostic.code) ?? [];
    list.push(diagnostic);
    grouped.set(diagnostic.code, list);
  }
  const lines = [
    '# Website-to-Figma run report',
    '',
    `- **Status:** ${input.status}`,
    `- **Run:** \`${input.runId}\``,
    `- **Source:** ${input.sourceUrl}`,
    `- **Artifacts:** \`${input.outputDir}\``,
    '',
    '## Import counts',
    '',
    `- Created nodes: **${input.counts.created}**`,
    `- Skipped nodes: **${input.counts.skipped}**`,
    `- Failed nodes: **${input.counts.failed}**`,
    `- Captured assets: **${input.counts.assets}**`,
    '',
    '## Visual QA',
    '',
    `- SSIM: **${input.metrics.ssim.toFixed(4)}**`,
    `- Changed pixels: **${(input.metrics.changedPixelRatio * 100).toFixed(2)}%**`,
    '',
    '## Diagnostics by type',
    '',
  ];
  if (!grouped.size) lines.push('No diagnostics reported.');
  for (const [code, diagnostics] of grouped) {
    const errors = diagnostics.filter(
      (item) => item.severity === 'error',
    ).length;
    lines.push(
      `### ${code} (${diagnostics.length}${errors ? `; ${errors} errors` : ''})`,
    );
    const messages = [...new Set(diagnostics.map((item) => item.message))];
    for (const message of messages) lines.push(`- ${message}`);
    lines.push('');
  }
  lines.push(
    '## Suggested next step',
    '',
    input.status === 'success' && input.diagnostics.length === 0
      ? 'Review the generated Figma frame and QA report.'
      : 'Open `import-result.json` for source node IDs, then fix the highest-count error or warning before comparing the next run.',
    '',
  );
  return `${lines.join('\n')}\n`;
}
