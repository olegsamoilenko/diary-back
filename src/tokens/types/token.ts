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
  inputCoast: number;
  outputCoast: number;
};

export type TokenUsageStat = Record<TokenType, TokenUsageItem[]>;
