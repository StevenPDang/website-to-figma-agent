export type InferenceMode = 'deterministic' | 'agentic';

export interface AgenticCliOptions {
  inferenceMode: InferenceMode;
  providerId: 'local-codex';
  maxRenders: number;
  providerTimeoutMs: number;
  maxProviderOutputBytes: number;
}

export function parseAgenticCliOptions(
  args: readonly string[],
): AgenticCliOptions {
  const inferenceMode = valueAfter(args, '--inference') ?? 'deterministic';
  if (inferenceMode !== 'deterministic' && inferenceMode !== 'agentic')
    throw new Error('Inference must be deterministic or agentic.');
  const providerId = valueAfter(args, '--provider') ?? 'local-codex';
  if (providerId !== 'local-codex')
    throw new Error('Provider must be local-codex.');
  const maxRenders = integerOption(args, '--max-renders', 3);
  if (maxRenders < 1 || maxRenders > 3)
    throw new Error('Max renders must be between 1 and 3.');
  const providerTimeoutSeconds = numberOption(args, '--provider-timeout', 120);
  if (providerTimeoutSeconds < 1 || providerTimeoutSeconds > 540)
    throw new Error('Provider timeout must be between 1 and 540 seconds.');
  const maxProviderOutputBytes = integerOption(
    args,
    '--max-provider-output-bytes',
    2_000_000,
  );
  if (maxProviderOutputBytes < 1024 || maxProviderOutputBytes > 10_000_000)
    throw new Error(
      'Provider output budget must be between 1024 and 10000000 bytes.',
    );
  return {
    inferenceMode,
    providerId,
    maxRenders,
    providerTimeoutMs: providerTimeoutSeconds * 1000,
    maxProviderOutputBytes,
  };
}

function valueAfter(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (value === undefined || value.startsWith('--'))
    throw new Error(`${name} requires a value.`);
  return value;
}

function numberOption(
  args: readonly string[],
  name: string,
  fallback: number,
): number {
  const raw = valueAfter(args, name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${name} must be a number.`);
  return value;
}

function integerOption(
  args: readonly string[],
  name: string,
  fallback: number,
): number {
  const value = numberOption(args, name, fallback);
  if (!Number.isInteger(value)) throw new Error(`${name} must be an integer.`);
  return value;
}
