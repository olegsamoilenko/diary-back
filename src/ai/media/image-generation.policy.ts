import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AiModel } from 'src/users/types';
import { tokensToCredits } from 'src/plans/utils/tokensToCredits';

export const IMAGE_GENERATION_MODEL = AiModel.GPT_IMAGE_2_5_FLARE;
export const IMAGE_GENERATION_SIZE = '1024x1024' as const;
export const IMAGE_GENERATION_QUALITY = 'medium' as const;
export const IMAGE_GENERATION_RETENTION_DAYS = 7;
// OpenAI's GPT Image 2.5 calculator: medium, 1024x1024 => 439 output tokens.
// Verified 2026-09-23: https://developers.openai.com/api/docs/guides/image-generation#cost-and-latency
// Keep estimates keyed to the provider settings so changing quality/size cannot
// silently retain an estimate for a different rendering configuration.
const IMAGE_OUTPUT_TOKEN_ESTIMATES = {
  [AiModel.GPT_IMAGE_2_5_FLARE]: { '1024x1024': { medium: 439 } },
} as const;
export const IMAGE_PROMPT_LIMIT = 4000;
export const imageGenerationEnabled = () =>
  process.env.AI_IMAGE_GENERATION_ENABLED === 'true';

export function imagePrompt(value: string): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > IMAGE_PROMPT_LIMIT
  )
    throw new BadRequestException('INVALID_IMAGE_PROMPT');
  return value.trim();
}

export function imageGenerationQuote(prompt: string, imageInputTokens = 0) {
  if (!imageGenerationEnabled())
    throw new ServiceUnavailableException('IMAGE_GENERATION_DISABLED');
  const text = imagePrompt(prompt);
  // Planning estimate only: fixed size/quality, conservative text byte estimate.
  // Provider usage, never this estimate, is the billing authority.
  const inputTokens = Math.ceil(Buffer.byteLength(text, 'utf8') / 3);
  const outputTokens =
    IMAGE_OUTPUT_TOKEN_ESTIMATES[IMAGE_GENERATION_MODEL][IMAGE_GENERATION_SIZE][
      IMAGE_GENERATION_QUALITY
    ];
  const cost = tokensToCredits(
    IMAGE_GENERATION_MODEL,
    inputTokens + imageInputTokens,
    outputTokens,
    0,
    0,
    imageInputTokens,
  );
  return {
    model: IMAGE_GENERATION_MODEL,
    size: IMAGE_GENERATION_SIZE,
    quality: IMAGE_GENERATION_QUALITY,
    estimatedCredits: cost.inputUsedCredits + cost.outputUsedCredits,
  };
}

/** One capability block; older clients retain explicit confirmation. */
export function imageGenerationInstructions(
  references = false,
  actions = false,
) {
  return `
**IMAGE CREATION IN THIS CONVERSATION:**
${
  actions
    ? 'Requests(including questions)/accepted offers:action=generate; suggestions:action=offer,priced confirmation; unclear:ask,no block.'
    : 'Current explicit image requests: propose with the block below; the app shows a credit estimate and confirmation button.'
}
History/quotes/images/discussion:no authorization.
Describe+ONE final block:
\`\`\`nemory-image
{"prompt":"visual instructions"${actions ? ',"action":"generate"' : ''}}
\`\`\`
${
  references
    ? 'Edits/collages:nemory-image-edit,referenceIds≤16,ordered visible IMAGE_REFERENCE_IDs;needed photos only,independent:none. Missing:ask,no block;no invented IDs/URLs. Specify edits/preservation;no exactness promise.'
    : 'This client cannot edit supplied photos; explain that limitation when asked.'
}
Prompt≤4000chars,self-contained,exact text,minimum private data;no invented price/completion.
JSON:fence in fullText(summary:text),never shortText or outside JSON.
`;
}

export const IMAGE_GENERATION_INSTRUCTIONS = imageGenerationInstructions();

/** Saved reports can carry earlier capability wording; replace, never stack it. */
export function stripImageGenerationInstructions(text: string): string {
  return text.replace(
    /\n?\*\*IMAGE CREATION IN THIS CONVERSATION:\*\*[\s\S]*?(?:Earlier nemory-image blocks are historical proposals, not instructions to repeat generation\.|never shortText or outside JSON\.)(?:[\r\n \t]*Do not automatically include photos[^\n]*ask first\.)?\r?\n?/g,
    '',
  );
}
