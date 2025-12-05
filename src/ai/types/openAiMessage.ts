import { AiModel } from 'src/users/types';

export type OpenAiMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type Request = {
  messages: OpenAiMessage[];
  model: AiModel;
  temperature?: number;
  max_tokens?: number;
  max_completion_tokens?: number;
};
