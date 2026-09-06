import { describe, expect, it } from 'vitest';

import { parseAgenticCliOptions } from './agentic-options.js';

describe('parseAgenticCliOptions', () => {
  it('keeps the guarded deterministic default', () => {
    expect(parseAgenticCliOptions([])).toEqual({
      inferenceMode: 'deterministic',
      providerId: 'local-codex',
      maxRenders: 3,
      providerTimeoutMs: 120_000,
      maxProviderOutputBytes: 2_000_000,
    });
  });

  it('parses bounded agentic provider options', () => {
    expect(
      parseAgenticCliOptions([
        '--inference',
        'agentic',
        '--provider',
        'local-codex',
        '--max-renders',
        '2',
        '--provider-timeout',
        '30',
        '--max-provider-output-bytes',
        '4096',
      ]),
    ).toMatchObject({
      inferenceMode: 'agentic',
      maxRenders: 2,
      providerTimeoutMs: 30_000,
      maxProviderOutputBytes: 4096,
    });
  });

  it.each([
    [['--inference', 'unknown'], 'Inference'],
    [['--provider', 'hosted'], 'Provider'],
    [['--max-renders', '4'], 'Max renders'],
    [['--provider-timeout', '0'], 'Provider timeout'],
    [['--max-provider-output-bytes', '10'], 'Provider output budget'],
    [['--inference'], 'requires a value'],
  ])('rejects invalid options', (args, message) => {
    expect(() => parseAgenticCliOptions(args)).toThrow(message);
  });
});
