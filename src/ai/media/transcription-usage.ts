/** SDK versions may lag the provider's JSON usage contract. Validate at runtime. */
export function readTranscriptionUsage(result: unknown): {
  inputTokens: number;
  outputTokens: number;
} {
  if (!result || typeof result !== 'object')
    throw new Error('TRANSCRIPTION_USAGE_MISSING');
  const usage = (result as { usage?: unknown }).usage;
  if (!usage || typeof usage !== 'object')
    throw new Error('TRANSCRIPTION_USAGE_MISSING');
  const value = usage as {
    type?: unknown;
    input_tokens?: unknown;
    output_tokens?: unknown;
  };
  if (
    value.type !== 'tokens' ||
    typeof value.input_tokens !== 'number' ||
    typeof value.output_tokens !== 'number' ||
    !Number.isSafeInteger(value.input_tokens) ||
    !Number.isSafeInteger(value.output_tokens) ||
    value.input_tokens < 0 ||
    value.output_tokens < 0
  )
    throw new Error('TRANSCRIPTION_USAGE_MISSING');
  return { inputTokens: value.input_tokens, outputTokens: value.output_tokens };
}
