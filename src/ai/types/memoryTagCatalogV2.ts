import type { MemoryCapsuleTagType } from './memoryCapsuleV2';

export type ProposedMemoryTagV2 = {
  key: string;
  type: MemoryCapsuleTagType;
  label: string;
  description: string;
  aliases?: string[];
};

export type MemoryTagCatalogPromptItemV2 = {
  key: string;
  label: string;
  description: string;
  aliases?: string[];
  distinctRecordCount?: number;
  associatedDomains?: string[];
};

export type GroupedMemoryTagCatalogV2 = {
  domains: MemoryTagCatalogPromptItemV2[];
  states: MemoryTagCatalogPromptItemV2[];
  mechanisms: MemoryTagCatalogPromptItemV2[];
  knownEntities: MemoryTagCatalogPromptItemV2[];
  knownThreads: MemoryTagCatalogPromptItemV2[];
};
