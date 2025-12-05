import { AiModel } from 'src/users/types';
import { COAST_TOKEN } from '../constants/coast';

export const calculateTokensCoast = (
  aiModel: AiModel,
  input: number,
  output: number,
) => {
  const coastToken = COAST_TOKEN(aiModel);
  const inputCoastToken = (input * coastToken.input) / 1000000;
  const outputCoastToken = (output * coastToken.output) / 1000000;
  const totalCoastToken = inputCoastToken + outputCoastToken;

  return {
    inputCoastToken: inputCoastToken,
    outputCoastToken: outputCoastToken,
    totalCoastToken: totalCoastToken,
  };
};
