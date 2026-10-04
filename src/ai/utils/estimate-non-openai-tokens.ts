export const NON_OPENAI_APPROX_CHARS_PER_TOKEN = 3;

/**
 * Deterministic offline estimate used for non-OpenAI models.
 * Keep this in sync with the frontend Anthropic and Qwen tokenizers.
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
