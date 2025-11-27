export type ExtractAssistantMemoryResponse = {
  assistant_long_term: AssistantItemDraft[];
  assistant_commitments: AssistantCommitmentItemDraft[];
};

type AssistantCommitmentItemDraft = {
  kind: AssistantCommitmentKind;
  topic: string;
  content: string;
  importance: number;
};

type AssistantCommitmentKind =
  | 'promise'
  | 'ritual'
  | 'plan'
  | 'follow_up'
  | 'style_rule'
  | 'other';

export type AssistantItemDraft = {
  kind: AssistantLongTermKind;
  topic: string;
  content: string;
  importance: number;
};

export type AssistantLongTermKind =
  | 'insight'
  | 'focus_area'
  | 'agreed_direction'
  | 'style_rule'
  | 'other';
