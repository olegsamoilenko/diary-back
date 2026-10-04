import { AiModel } from 'src/users/types';
import type { TimeContext } from './date';

export type OpenAiMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
  /** Explicit opt-in references to private, owner-checked prepared media. */
  mediaIds?: string[];
  /** Server-only resolved images. Client values are discarded before dispatch. */
  images?: Array<{
    base64: string;
    width: number;
    height: number;
    label: string;
  }>;
  /** Optional client history metadata; rendered as text before provider dispatch. */
  timeContext?: TimeContext;
};

export type Request = {
  messages: OpenAiMessage[];
  model: AiModel;
  temperature?: number;
  max_tokens?: number;
  max_completion_tokens?: number;
};
