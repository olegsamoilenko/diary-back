export const NON_OPENAI_APPROX_CHARS_PER_TOKEN = 3;

/**
 * Deterministic offline estimate used for non-OpenAI models.
 * Keep this algorithm in sync with diary-front/tokenizers/anthropicTokenizer.ts.
 * Actual provider usage remains authoritative for billing.
 */
export function estimateNonOpenAiTokens(texts: string[]): number {
  return texts.reduce((total, text) => {
    const codePoints = Array.from(text).length;
    return (
      total +
      (codePoints > 0
        ? Math.max(1, Math.ceil(codePoints / NON_OPENAI_APPROX_CHARS_PER_TOKEN))
        : 0)
    );
  }, 0);
}
