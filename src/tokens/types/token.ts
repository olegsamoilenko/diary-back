export enum TokenType {
  ENTRY = 'entry',
  DIALOG = 'dialog',
  EMBEDDING = 'embedding',
  USER_MEMORY = 'user_memory',
  ASSISTANT_MEMORY = 'assistant_memory',
}

export type TokenUsageItem = {
  userUuid: string;
  userName: string | null;
  userEmail: string | null;
  input: number;
  output: number;
  inputCredits: number;
  outputCredits: number;
  finishReason: string | null;
};

export type TokenUsageStat = Record<TokenType, TokenUsageItem[]>;
