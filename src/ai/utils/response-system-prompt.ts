import type { AiContentMode } from '../ai.service';
import type { TimeContext } from '../types';
import { IMAGE_GENERATION_INSTRUCTIONS } from '../media/image-generation.policy';
import { buildNemoryCapabilitiesPrompt } from './nemory-capabilities';
import {
  NEMORY_COMMON_INSTRUCTIONS,
  buildJournalTask,
} from './journal-response-instructions';

type ContextProtocol = 'memory_capsules_v2' | undefined;

type BuildResponseSystemPromptParams = {
  identity?: 'conversation';
  mode: AiContentMode;
  visibleResponseTokens?: number;
  imageGeneration?: boolean;
  task?: { instructions: string; output: string; compact?: boolean };
  capabilities?: { exactReminders: boolean };
  sharedBlocks?: { developerMarker?: boolean; appCapabilities?: boolean };
  userName?: string | null;
  timeContext: TimeContext;
  contextProtocol?: ContextProtocol;
  aboutMe: string;
  metricsBlock: string;
  /** Compatibility input; the response adapter sends plans as user context. */
  goalsPrompt: string;
  stylesBlock: string;
  languageBlock: string;
  /** Accepted for existing internal adapters; the task owns its current limits. */
  dialogResponseDiscipline?: string;
  isFirstEntry: boolean;
  generateShortReflection: boolean;
};

export type ResponseSystemPromptParts = {
  /** Common instructions and preferences, identical across a source/dialog pair. */
  stablePrefix: string;
  /** Current mode's task; placed after shared context, and after the source in dialogs. */
  dynamicSuffix: string;
  /** Source metrics are context, not global instructions. */
  contextInstructions?: string;
};
const joinPromptBlocks = (blocks: string[]): string =>
  blocks
    .map((block) => block.trim())
    .filter(Boolean)
    .join('\n\n');
const isDialogMode = (mode: AiContentMode): boolean =>
  mode === 'dialog' || mode === 'checkin_dialog';

/** Shared service data. Mutable request time stays outside the cached prefix. */
export function buildResponseServiceBlock(
  params: BuildResponseSystemPromptParams,
): string {
  return joinPromptBlocks([
    params.sharedBlocks?.appCapabilities === false
      ? ''
      : buildNemoryCapabilitiesPrompt(params.capabilities),
    'REQUEST DATA',
    params.languageBlock,
    `User name: ${params.userName?.trim() || '[not provided]'}.\nTimezone: ${params.timeContext.timeZone}; locale: ${params.timeContext.locale}.`,
    params.aboutMe ? 'ABOUT THE USER\n' + params.aboutMe : '',
    params.stylesBlock,
  ]);
}

/** Receives a resolved display language, never model/provider-specific instructions. */
export function buildResponseLanguageBlock(
  languageName?: string | null,
): string {
  return languageName
    ? `Configured response language: ${languageName}. Change only on explicit user request; preserve necessary names, quotations, code and JSON keys.`
    : 'No response language configured: use the latest message language; for Russian input use Ukrainian.';
}

export function buildResponseSystemPromptParts(
  params: BuildResponseSystemPromptParams,
): ResponseSystemPromptParts {
  return {
    stablePrefix: joinPromptBlocks([
      NEMORY_COMMON_INSTRUCTIONS,
      buildResponseServiceBlock(params),
    ]),
    contextInstructions: params.metricsBlock,
    dynamicSuffix: joinPromptBlocks([
      // Journal adapters already attach request time to their user message.
      // Periods need asOf here; conversation messages carry their original time.
      params.task && !isDialogMode(params.mode)
        ? `Request time: ${params.timeContext.nowLocalText}.`
        : '',
      params.task ? params.task.instructions : buildJournalTask(params),
      params.task?.output ?? '',
      params.imageGeneration ? IMAGE_GENERATION_INSTRUCTIONS : '',
    ]),
  };
}
export function buildResponseSystemPrompt(
  params: BuildResponseSystemPromptParams,
): string {
  const parts = buildResponseSystemPromptParts(params);
  return joinPromptBlocks([
    parts.stablePrefix,
    parts.contextInstructions ?? '',
    parts.dynamicSuffix,
  ]);
}
