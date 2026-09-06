import type { Diagnostic } from '@website-to-figma/contracts';
import type {
  CandidateHistory,
  InferenceUsage,
} from '@website-to-figma/inference';
import type { InferenceMode } from './agentic-options.js';

export interface RunReportInput {
  runId: string;
  sourceUrl: string;
  outputDir: string;
  status: string;
  inferenceMode: InferenceMode;
  providerId?: string;
  counts: { created: number; skipped: number; failed: number; assets: number };
  diagnostics: Diagnostic[];
  metrics: { ssim: number; changedPixelRatio: number };
  usage?: InferenceUsage;
  history?: CandidateHistory;
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
    `- **Inference:** ${input.inferenceMode}`,
    ...(input.providerId === undefined
      ? []
      : [`- **Provider:** ${input.providerId}`]),
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
    '## Agentic inference',
    '',
    ...(input.inferenceMode === 'deterministic'
      ? ['Deterministic inference ran without a model provider.', '']
      : [
          `- Candidate passes: **${input.history?.passes.length ?? 0}**`,
          `- Selected revision: **${input.history?.selectedRevision ?? 'none'}**`,
          `- Stop reason: **${input.history?.stopReason ?? 'capture-only'}**`,
          `- Input tokens: **${input.usage?.inputTokens ?? 'unavailable'}**`,
          `- Output tokens: **${input.usage?.outputTokens ?? 'unavailable'}**`,
          `- Total tokens: **${input.usage?.totalTokens ?? 'unavailable'}**`,
          '',
        ]),
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
      : recoveryGuidance(input),
    '',
  );
  return `${lines.join('\n')}\n`;
}

function recoveryGuidance(input: RunReportInput): string {
  if (input.inferenceMode === 'agentic') {
    if (
      input.history?.stopReason === 'provider-failure' ||
      input.diagnostics.some((item) => item.code.startsWith('CODEX_'))
    )
      return 'The best completed candidate was retained. Verify the local Codex installation and authentication, then start a new CLI run and reconnect the plugin.';
    if (input.history?.stopReason === 'budget-exhausted')
      return 'The best completed candidate was retained. Review `correction-history.json` before starting a new run with an approved budget.';
    return 'Review `correction-history.json` and the selected candidate artifacts, then address the highest-priority structural diagnostic.';
  }
  return 'Open `import-result.json` for source node IDs, then fix the highest-count error or warning before comparing the next run.';
}
