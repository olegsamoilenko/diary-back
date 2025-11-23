export type MemoryKind =
  | 'fact'
  | 'preference'
  | 'goal'
  | 'pattern'
  | 'value'
  | 'strength'
  | 'vulnerability'
  | 'trigger'
  | 'coping_strategy'
  | 'boundary'
  | 'meta'
  | 'other';

export type MemoryTopic =
  | 'self'
  | 'work'
  | 'study'
  | 'relationships'
  | 'family'
  | 'health'
  | 'mental_health'
  | 'sleep'
  | 'habits'
  | 'productivity'
  | 'money'
  | 'creativity'
  | 'lifestyle'
  | 'values'
  | 'goals'
  | 'other';

export interface ProposedMemoryItem {
  kind: MemoryKind;
  topic: MemoryTopic;
  content: string;
  importance: number; // 1..5
}

export type ExtractMemoryResponse = {
  items: ProposedMemoryItem[];
};
