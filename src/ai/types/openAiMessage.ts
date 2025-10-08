export type OpenAiMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type Request = {
  messages: OpenAiMessage[];
  model: string;
  temperature: number;
  max_tokens: number;
};
