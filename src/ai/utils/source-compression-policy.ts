/** Compare prose with prose, excluding dates/metrics/envelope and using one tokenizer. */
export const SOURCE_COMPRESSION_MIN_TOKENS = 500;

export function sourceCompressionInstruction(tokens: number): string {
  return tokens <= SOURCE_COMPRESSION_MIN_TOKENS
    ? 'This source is already short. Return an empty userDigest; the application preserves its ORIGINAL text. Still extract supported durable memory. Do not spend output tokens copying or paraphrasing the original.'
    : `Source prose is ${tokens} tokens. Aim for 50–65% of its original token size using block-by-block compact clauses. This is a wording target, never permission to omit distinct meanings. If faithful compression is impossible, return an empty userDigest so the application uses the original. Do not copy the original.`;
}

export function selectSourceCompression(
  original: string,
  candidate: string,
  count: (text: string) => number,
) {
  const originalTokens = count(original);
  const candidateTokens = count(candidate);
  // Size is diagnostic, not a reason to discard an already generated capsule.
  const compressed = !!candidate.trim();
  return {
    text: compressed ? candidate.trim() : original,
    representation: compressed ? ('digest' as const) : ('verbatim' as const),
    originalTokens,
    candidateTokens,
    reason: compressed
      ? 'compressed'
      : originalTokens <= SOURCE_COMPRESSION_MIN_TOKENS
        ? 'short_original'
        : 'empty_candidate',
  };
}
