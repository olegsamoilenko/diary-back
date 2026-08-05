import { AiModel } from 'src/users/types';
import { getModelPriceCredits } from '../types/credits';

export function tokensToCredits(
  model: AiModel,
  inTokens: number,
  outTokens: number,
): { inputUsedCredits: number; outputUsedCredits: number } {
  const p = getModelPriceCredits(model);

  const inT = BigInt(inTokens);
  const outT = BigInt(outTokens);
  const inPer1M = BigInt(p.inPer1M);
  const outPer1M = BigInt(p.outPer1M);

  const inCredits = inT * inPer1M;
  const outCredits = outT * outPer1M;

  const denom = 1_000_000n;
  const inputUsedCredits = (inCredits + denom - 1n) / denom;
  const outputUsedCredits = (outCredits + denom - 1n) / denom;

  return {
    inputUsedCredits: Number(inputUsedCredits),
    outputUsedCredits: Number(outputUsedCredits),
  };
}
