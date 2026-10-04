import { AiModel } from 'src/users/types';
import { getModelPriceCredits } from '../types/credits';

export function tokensToCredits(
  model: AiModel,
  inTokens: number,
  outTokens: number,
  cachedInTokens: number = 0,
  cacheWriteInTokens: number = 0,
): { inputUsedCredits: number; outputUsedCredits: number } {
  const p = getModelPriceCredits(model, inTokens);

  const normalizedInputTokens = Math.max(0, Math.trunc(inTokens));
  const normalizedCachedTokens = Math.min(
    normalizedInputTokens,
    Math.max(0, Math.trunc(cachedInTokens)),
  );
  const normalizedCacheWriteTokens = Math.min(
    normalizedInputTokens - normalizedCachedTokens,
    Math.max(0, Math.trunc(cacheWriteInTokens)),
  );
  const uncachedInT = BigInt(
    normalizedInputTokens - normalizedCachedTokens - normalizedCacheWriteTokens,
  );
  const cachedInT = BigInt(normalizedCachedTokens);
  const cacheWriteInT = BigInt(normalizedCacheWriteTokens);
  const outT = BigInt(outTokens);
  const inPer1M = BigInt(p.inPer1M);
  const cachedInPer1M = BigInt(p.cachedInPer1M);
  const cacheWriteInPer1M = BigInt(p.cacheWriteInPer1M);
  const outPer1M = BigInt(p.outPer1M);

  const inCredits =
    uncachedInT * inPer1M +
    cachedInT * cachedInPer1M +
    cacheWriteInT * cacheWriteInPer1M;
  const outCredits = outT * outPer1M;

  const denom = 1_000_000n;
  const inputUsedCredits = (inCredits + denom - 1n) / denom;
  const outputUsedCredits = (outCredits + denom - 1n) / denom;

  return {
    inputUsedCredits: Number(inputUsedCredits),
    outputUsedCredits: Number(outputUsedCredits),
  };
}
