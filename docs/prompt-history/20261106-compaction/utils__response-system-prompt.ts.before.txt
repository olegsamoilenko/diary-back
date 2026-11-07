import type { AiContentMode } from '../ai.service';
import type { TimeContext, OpenAiMessage } from '../types';
import { AiProvider } from '../types/providers';
import { imageGenerationInstructions } from '../media/image-generation.policy';
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
  imageReferences?: boolean;
  imageActions?: boolean;
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
    ? `Configured response language: ${languageName}. Write the entire response in ${languageName}, even when the latest message and earlier conversation are in another language. A message written in another language is not a request to switch. Override only when the user explicitly asks you to communicate in another language; follow that explicit request for its stated scope, including subsequent turns if requested. Preserve necessary names, quotations, code and JSON keys.`
    : 'No response language configured: respond in the language of the latest user message, not the earlier conversation. If the user explicitly asks you to communicate in another language, follow that request for its stated scope. Preserve necessary names, quotations, code and JSON keys.';
}

/** Request-only Qwen reminder; never mutate source messages or persisted history. */
export function withResponseLanguageReminder(
  messages: OpenAiMessage[],
  provider: AiProvider,
  languageBlock?: string,
): OpenAiMessage[] {
  if (provider !== AiProvider.QWEN || !languageBlock) return messages;
  const index = messages.findLastIndex((message) => message.role === 'user');
  if (index < 0) return messages;
  const suffix = `\n\n[RESPONSE LANGUAGE]\n${languageBlock}\n[/RESPONSE LANGUAGE]`;
  if (messages[index].content.endsWith(suffix)) return messages;
  return messages.map((message, i) =>
    i === index ? { ...message, content: message.content + suffix } : message,
  );
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
      params.imageGeneration
        ? imageGenerationInstructions(
            params.imageReferences,
            params.imageActions,
          )
        : '',
      params.languageBlock,
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
