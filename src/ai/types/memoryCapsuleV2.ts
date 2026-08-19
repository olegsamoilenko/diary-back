import type { ProposedMemoryItem } from './userMemory';

export type MemoryCapsuleTagType =
  | 'domain'
  | 'entity'
  | 'state'
  | 'mechanism'
  | 'thread';

export type MemoryCapsuleTag = {
  key: string;
  type: MemoryCapsuleTagType;
  confidence: number;
};

export type MemoryCapsuleAiUsageV2 = {
  model: string;
  estimated: boolean;
  finishReason: string | null;
  tokensFromProvider: {
    inputTotal: number;
    standardInput: number;
    cacheReadInput: number;
    cacheWriteInput: number;
    output: number;
    total: number;
  };
  chargedCredits: {
    input: number;
    output: number;
    total: number;
  };
};

export type MemoryCapsuleNewTagV2 = {
  key: string;
  type: MemoryCapsuleTagType;
  label: string;
  description: string;
  aliases: string[];
};

export type ExtractUserMemoryCapsuleV2Response = {
  schemaVersion: 2;
  tags: MemoryCapsuleTag[];
  newTags: MemoryCapsuleNewTagV2[];
  importance: number;
  userDigest: string;
  userMemory: ProposedMemoryItem[];
};

export type RetrievalIndexV2Response = Pick<
  ExtractUserMemoryCapsuleV2Response,
  'schemaVersion' | 'tags' | 'newTags' | 'importance' | 'userDigest'
> & { usage?: MemoryCapsuleAiUsageV2 };

export type ExtractUserMemoryDetailsV2Response = Pick<
  ExtractUserMemoryCapsuleV2Response,
  'schemaVersion' | 'importance' | 'userDigest' | 'userMemory'
> & {
  usage?: MemoryCapsuleAiUsageV2;
};

export type MemoryCapsulePromiseKind =
  | 'promise'
  | 'ritual'
  | 'plan'
  | 'follow_up'
  | 'reminder'
  | 'monitoring'
  | 'style_rule'
  | 'other';

export type MemoryCapsulePromiseItem = {
  kind: 'promise';
  promiseKey: string;
  promiseKind: MemoryCapsulePromiseKind;
  topic: string;
  content: string;
  importance: number;
  duration: 'ongoing' | 'one_time';
  status: 'open';
  triggerTags: string[];
};

export type MemoryCapsulePromiseUpdateItem = {
  kind: 'promise_update';
  promiseKey: string;
  status: 'fulfilled' | 'cancelled' | 'expired';
  content?: string;
};

export type MemoryCapsuleScheduledReminderItem = {
  reminderKey: string;
  text: string;
  localDate: string;
  localTime: string;
};

export type MemoryCapsuleScheduledReminderUpdateItem = {
  reminderKey: string;
  status: 'cancelled';
};

export type MemoryCapsuleAssistantMemoryKind =
  | 'insight'
  | 'focus_area'
  | 'agreed_direction'
  | 'strategy'
  | 'style_rule'
  | 'meta'
  | 'other';

export type MemoryCapsuleAssistantMemoryItem = {
  kind: MemoryCapsuleAssistantMemoryKind;
  topic: string;
  content: string;
  importance: number;
};

export type ExtractAssistantMemoryCapsuleV2Response = {
  schemaVersion: 2;
  assistantMemory: MemoryCapsuleAssistantMemoryItem[];
  commitments: MemoryCapsulePromiseItem[];
  commitmentUpdates: MemoryCapsulePromiseUpdateItem[];
  scheduledReminders: MemoryCapsuleScheduledReminderItem[];
  scheduledReminderUpdates: MemoryCapsuleScheduledReminderUpdateItem[];
  usage?: MemoryCapsuleAiUsageV2;
};

export type DialogUserMemoryCapsuleV2 = {
  representation: 'digest' | 'verbatim';
  text: string;
  tags: MemoryCapsuleTag[];
  newTags: MemoryCapsuleNewTagV2[];
  importance: number;
  userMemory: string[];
};

export type DialogAssistantMemoryCapsuleV2 = {
  text: string;
  assistantMemory: string[];
  continuationSummary: string;
  reflectionSummary: string;
};

export type ExtractDialogMemoryCapsuleV2Response = {
  schemaVersion: 2;
  user: DialogUserMemoryCapsuleV2;
  assistant: DialogAssistantMemoryCapsuleV2;
  commitments: MemoryCapsulePromiseItem[];
  commitmentUpdates: MemoryCapsulePromiseUpdateItem[];
  scheduledReminders: MemoryCapsuleScheduledReminderItem[];
  scheduledReminderUpdates: MemoryCapsuleScheduledReminderUpdateItem[];
};

export type UserMemoryConsolidationModeV2 =
  | 'same_episode'
  | 'repeated_pattern';

export type UserMemoryConsolidationGroupV2 = ProposedMemoryItem & {
  sourceMemoryIds: string[];
  compressionMode: UserMemoryConsolidationModeV2;
  firstSeenAt: number;
  lastSeenAt: number;
  occurrenceCount: number;
  evidenceCount: number;
  confidence: number;
  rationale: string;
};

export type UserMemoryDiscardedItemV2 = {
  memoryId: string;
  confidence: number;
  reason: string;
};

export type PreviewUserMemoryConsolidationV2Response = {
  schemaVersion: 2;
  previewOnly: true;
  inputCount: number;
  resultOutputCount: number;
  achievedReductionCount: number;
  batching?: {
    enabled: true;
    batchSize: number;
    mergeBatches: number;
    cleanupBatches: number;
    modelCalls: number;
    failedBatches: Array<{
      phase: 'merge' | 'cleanup';
      batchNumber: number;
      itemCount: number;
      reason: string;
    }>;
  };
  groups: UserMemoryConsolidationGroupV2[];
  discardedItems: UserMemoryDiscardedItemV2[];
  ungroupedMemoryIds: string[];
};
