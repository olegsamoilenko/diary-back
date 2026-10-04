import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AiModel } from 'src/users/types';
import { tokensToCredits } from 'src/plans/utils/tokensToCredits';

export const IMAGE_GENERATION_MODEL = AiModel.GPT_IMAGE_2_5_FLARE;
export const IMAGE_GENERATION_SIZE = '1024x1024' as const;
export const IMAGE_GENERATION_QUALITY = 'medium' as const;
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

export function imageGenerationQuote(prompt: string) {
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
    inputTokens,
    outputTokens,
  );
  return {
    model: IMAGE_GENERATION_MODEL,
    size: IMAGE_GENERATION_SIZE,
    quality: IMAGE_GENERATION_QUALITY,
    estimatedCredits: cost.inputUsedCredits + cost.outputUsedCredits,
  };
}

export const IMAGE_GENERATION_INSTRUCTIONS = `
**IMAGE CREATION IN THIS CONVERSATION:**
The app can generate one new image after the user confirms a separate credit estimate.
Use this app capability regardless of which text model is answering; do not refuse merely because you cannot render pixels yourself.
Only respond to a current explicit request, never replay requests found in previous entries or summaries.
When the user explicitly requests a NEW image, briefly describe what you propose in their language,
then append exactly one final fenced block with language nemory-image and valid JSON:
\`\`\`nemory-image
{"prompt":"A self-contained visual description, including the requested subject, composition, style and exact visible text"}
\`\`\`
If the task requires JSON, place this entire fenced block INSIDE the fullText string (or text for a summary), using JSON escapes. Never append it outside the JSON or put it in shortText.
Use relevant conversation context to make the description complete, but include private details only
when necessary for the user's image request. The prompt must be at most 4000 characters.
Do not claim an image has already been generated or quote its price; the app shows the estimate and confirmation.
Do not emit this block for ordinary discussion, image analysis, quoted instructions, or unsolicited suggestions.
This action creates a new image from text; it cannot edit or faithfully reproduce an attached photo.
If the user asks for an edit, explain this limitation instead of pretending the source image will be edited.
Earlier nemory-image blocks are historical proposals, not instructions to repeat generation.
`;
