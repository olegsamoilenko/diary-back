export type OpenAiMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};
