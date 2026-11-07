import { randomUUID } from 'crypto';
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
  plannerCreation?: boolean;
  reminderRecurrence?: boolean;
  /** Actual app UI language, independent of the preferred response language. */
  uiLocale?: string | null;
  task?: { instructions: string; output: string; compact?: boolean };
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
      : buildNemoryCapabilitiesPrompt(params.plannerCreation, params.reminderRecurrence, params.uiLocale),
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
    ? `Configured response language: ${languageName}. Use it unless explicitly requested otherwise, within requested scope/subsequent turns; message language alone changes nothing. Preserve names/quotes/code/JSON keys.`
    : 'No response language configured: use the latest message language, not earlier history. Explicit language requests override for their stated scope/subsequent turns. Preserve necessary names/quotes/code/JSON keys.';
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
  // The full policy is already in RESPONSE_TASK; repeat its language choice,
  // preserving custom/older blocks for compatibility.
  const configured = /^Configured response language: ([^.]+)\./.exec(
    languageBlock,
  );
  const reminder = configured
    ? `Reply in ${configured[1]}; only explicit language requests override, within their scope.`
    : languageBlock.startsWith('No response language configured:')
      ? 'Reply in the latest message language; honor explicit language requests and their scope.'
      : languageBlock;
  const suffix = `\n\n[RESPONSE LANGUAGE]\n${reminder}\n[/RESPONSE LANGUAGE]`;
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
      params.plannerCreation === true ? plannerCreationResponseInstruction() : '',
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

/** Refresh recognized shared blocks in a saved report at request time only.
 * Preserve its task, preferences, source data and stored historical document.
 * Older unrecognized formats still use the existing compatibility override.
 */
export function plannerCreationResponseInstruction(): string {
  return `PLANNER EXECUTION\nAuthorized planner/reminder creation only: append [[NEMORY_CREATE:${randomUUID()}]] to nonempty answer fields/plain text; otherwise omit.\nEND PLANNER EXECUTION`;
}

export function refreshSavedResponseInstructions(content: string, plannerCreation = false, reminderRecurrence = false, uiLocale?: string | null): string {
  // Only the recognized instruction prefix may be refreshed; user profile text
  // after REQUEST DATA must never become a replacement target.
  const boundary = content.indexOf('\n\nREQUEST DATA');
  const prefix = boundary < 0 ? content : content.slice(0, boundary);
  const suffix = boundary < 0 ? '' : content.slice(boundary);
  return (prefix
    .replace(
      /NEMORY RESPONSE RULES v3[\s\S]*?(?=\n\n(?:NEMORY SHARED CAPABILITIES|APP CAPABILITIES|REQUEST DATA))/g,
      () => NEMORY_COMMON_INSTRUCTIONS,
    )
    .replace(
      /(?:NEMORY SHARED CAPABILITIES|APP CAPABILITIES)\n[\s\S]*?(?=\n\nREQUEST DATA|$)/g,
      () => buildNemoryCapabilitiesPrompt(plannerCreation, reminderRecurrence, uiLocale),
    ) + suffix).replace(/PLANNER EXECUTION\n[\s\S]*?\nEND PLANNER EXECUTION\n*/g, '');
}
