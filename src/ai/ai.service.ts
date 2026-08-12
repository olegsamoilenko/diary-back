import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { encoding_for_model, TiktokenModel } from 'tiktoken';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import type {
  ExtractMemoryResponse,
  MemoryKind,
  MemoryTopic,
  OpenAiMessage,
  ProposedMemoryItem,
  Request,
  TimeContext,
} from './types';
import { UsersService } from 'src/users/users.service';
import { CryptoService } from 'src/kms/crypto.service';
import { throwError } from '../common/utils';
import { HttpStatus } from '../common/utils/http-status';
import { ConfigService } from '@nestjs/config';
import {
  formatDateForPrompt,
  formatWeekdayForPrompt,
} from '../common/utils/formatDateForPrompt';
import { TokensService } from 'src/tokens/tokens.service';
import { TokenType } from '../tokens/types';
import { ExtractAssistantMemoryResponse } from './types/assistantMemory';
import { AiModel, normalizeAiModel } from 'src/users/types';
import { AddAiModelAnswerReviewDto } from './dto/add-ai-model-answer-review.dto';
import { AiModelAnswerReview } from './entities/ai-model-answer-review.entity';
import { PositiveNegativeAiModelAnswer } from './entities/positive-negative-ai-model-answer.entity';
import { RegenerateAiModelAnswer } from './entities/regenerate-ai-model-answer.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CONVERSATION_LANGUAGE_LABELS_EN } from 'src/users/constants/conversation-language';
import { ConversationLanguage } from 'src/users/types/settings';
import { AddPositiveNegativeAiModelAnswerDto } from './dto/add-positive-negative-ai-model-answer.dto';
import { AiProvider, MODEL_REGISTRY } from './types/providers';
import { AiPreferencesService } from './ai-preferences.service';
import { buildAiPreferencesInstruction } from './utils/ai-preferences.prompt';
import { EntryMetrics } from '../common/types/metrics';
import { SubscriptionUsageService } from 'src/subscriptions/subscription-usage.service';
import { AiErrorReporterService } from 'src/ai-errors/ai-error-reporter.service';
import { BackendAiTimingContext, markBackendAiTiming } from './ai-timing';
import { createStructuredReflectionProgress } from './utils/structured-reflection-progress';
import { buildLongitudinalResponseGuidance } from './utils/longitudinal-response-guidance';
import { estimateNonOpenAiTokens } from './utils/estimate-non-openai-tokens';
import {
  buildResponseSystemPrompt,
  buildResponseSystemPromptParts,
} from './utils/response-system-prompt';
import type { ExtractUserMemoryCapsuleV2Dto } from './dto/extract-user-memory-capsule-v2.dto';
import type { ExtractAssistantMemoryCapsuleV2Dto } from './dto/extract-assistant-memory-capsule-v2.dto';
import type { ExtractDialogMemoryCapsuleV2Dto } from './dto/extract-dialog-memory-capsule-v2.dto';
import type {
  PreviewUserMemoryConsolidationV2Dto,
  UserMemoryConsolidationCandidateV2Dto,
} from './dto/preview-user-memory-consolidation-v2.dto';
import type {
  ExtractAssistantMemoryCapsuleV2Response,
  ExtractDialogMemoryCapsuleV2Response,
  ExtractUserMemoryDetailsV2Response,
  ExtractUserMemoryIndexV2Response,
  ExtractUserMemoryCapsuleV2Response,
  MemoryCapsulePromiseItem,
  MemoryCapsulePromiseKind,
  MemoryCapsulePromiseUpdateItem,
  MemoryCapsuleScheduledReminderItem,
  MemoryCapsuleScheduledReminderUpdateItem,
  MemoryCapsuleAssistantMemoryItem,
  MemoryCapsuleNewTagV2,
  MemoryCapsuleTag,
  MemoryCapsuleTagType,
  PreviewUserMemoryConsolidationV2Response,
  UserMemoryConsolidationGroupV2,
  UserMemoryConsolidationModeV2,
} from './types/memoryCapsuleV2';
import { MemoryTagCatalogV2Service } from './memory-tag-catalog-v2.service';
import { tokensToCredits } from 'src/plans/utils/tokensToCredits';
import { getModelPriceCredits } from 'src/plans/types/credits';
import {
  addExplicitPromptCacheBreakpoint,
  buildOpenAiPromptCacheKey,
  buildOpenAiPromptCacheResourceHash,
  getCacheWriteInputTokens,
  getCachedInputTokens,
  getOpenAiPromptCacheOptions,
  shouldUseResponsePromptCache,
  supportsExplicitPromptCaching,
} from './utils/openai-prompt-cache';
import {
  buildAnthropicPromptCachePayload,
  getAnthropicTokenUsage,
} from './utils/anthropic-prompt-cache';
import {
  logServerMemoryReview,
  scheduleServerDebugTask,
  writeFullServerDebugLog,
} from './entry-flow-debug';
import { rememberMemoryReviewProviderUsage } from './memory-review-file-log';

export type AiContentMode = 'entry' | 'dialog' | 'checkin' | 'checkin_dialog';

type MemoryCapsuleSourceType = 'entry' | 'checkin' | 'dialog';

type MemoryCapsuleExtractionPrompt =
  | string
  | {
      staticPrompt: string;
      dynamicPrompt: string;
    };

type StreamUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  prompt_tokens_details?: {
    cached_tokens?: number;
    cache_write_tokens?: number;
  } | null;
};

type ChunkWithUsage = { usage?: StreamUsage };

type GenerateCommentResult = {
  content: string;
  tags: string[];
  shortText?: string | null;
  fullText?: string;
};

type ChatGenerationResult = {
  fullText: string;
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteInputTokens: number;
  outputTokens: number;
  totalTokens?: number;
  finishReason?: string;
  estimated: boolean;
};

type AiPromptUsageOperation = {
  operation: string;
  model: string;
  pricingModel: AiModel;
  estimated: boolean;
  inputTokens: number;
  providerReportedCachedInputTokens: number;
  providerReportedCacheWriteInputTokens: number;
  cachePricingSource: 'provider_usage' | 'estimated_standard_input';
  standardInputTokens: number;
  cachedInputTokens: number;
  cacheWriteInputTokens: number;
  outputTokens: number;
  totalTokens: number;
  inputCredits: number;
  outputCredits: number;
  totalCredits: number;
  finishReason?: string | null;
};

type AiPromptUsageCycle = {
  createdAt: number;
  inputTokens: number;
  providerReportedCachedInputTokens: number;
  providerReportedCacheWriteInputTokens: number;
  standardInputTokens: number;
  cachedInputTokens: number;
  cacheWriteInputTokens: number;
  outputTokens: number;
  inputCredits: number;
  outputCredits: number;
  operations: AiPromptUsageOperation[];
};

type AiPromptDebugSnapshot = {
  marker: 'NEMORY_AI_PROMPT_DEBUG_SNAPSHOT';
  createdAt: string;
  traceId: string | null;
  mode: AiContentMode;
  model: string;
  tokenizerModel: AiModel;
  pricing: {
    inputCreditsPer1MTokens: number;
    cachedInputCreditsPer1MTokens: number;
    cacheWriteInputCreditsPer1MTokens: number;
    outputCreditsPer1MTokens: number;
  };
  promptCache: {
    key: string | null;
    mode: 'explicit' | 'implicit' | 'anthropic_ephemeral_5m' | 'disabled';
    stablePrefixTokens: number;
    dialogBaseMessageIndex?: number;
    dialogBasePrefixTokens?: number;
    dialogBaseFingerprint?: string;
  };
  estimatedPromptTokens: number;
  estimatedPromptCredits: number;
  contentTokens: number;
  contentCreditsUnrounded: number;
  messageEnvelopeTokens: number;
  messageEnvelopeCreditsUnrounded: number;
  messages: Array<{
    index: number;
    label: string;
    role: OpenAiMessage['role'];
    characters: number;
    contentTokens: number;
    estimatedTokensWithEnvelope: number;
    inputCreditsUnrounded: number;
    estimatedInputCredits: number;
    billingClass: 'standard_input' | 'provider_cache_usage_decides';
    content: string;
  }>;
  actualUsage?: {
    promptTokens: number;
    providerReportedCachedPromptTokens: number;
    providerReportedCacheWritePromptTokens: number;
    cachePricingSource: 'provider_usage' | 'estimated_standard_input';
    standardPromptTokens: number;
    cachedPromptTokens: number;
    cacheWritePromptTokens: number;
    completionTokens: number;
    promptCredits: number;
    completionCredits: number;
    totalCredits: number;
    estimated: boolean;
    finishReason?: string;
  };
};

type ClaudeTextDeltaEvent = {
  type: 'content_block_delta';
  delta: { type: 'text_delta'; text?: string };
};

type ClaudeMessageDeltaWithStopEvent = {
  type: 'message_delta';
  delta?: { stop_reason?: string | null };
  usage?: ClaudeUsage;
};

type ClaudeMessageStartEvent = {
  type: 'message_start';
  message?: { usage?: ClaudeUsage };
};

type ClaudeUsage = {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
};

function extractPromptSection(content: string, tag: string): string {
  const open = `[${tag}]`;
  const close = `[/${tag}]`;
  const start = content.indexOf(open);
  const end = content.indexOf(close, start + open.length);
  if (start < 0 || end < 0) return '';
  return content.slice(start, end + close.length);
}

function countOccurrences(content: string, marker: string): number {
  if (!content || !marker) return 0;
  let count = 0;
  let offset = 0;
  while (true) {
    const index = content.indexOf(marker, offset);
    if (index < 0) return count;
    count += 1;
    offset = index + marker.length;
  }
}

function countPromptListItems(content: string): number {
  return content
    .split(/\r?\n/)
    .filter((line) => line.trimStart().startsWith('- [')).length;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly openai: OpenAI;
  private readonly anthropic: Anthropic;
  private readonly aiPromptUsageCycles = new Map<string, AiPromptUsageCycle>();
  private promptDebugSnapshotWriteQueue: Promise<void> = Promise.resolve();

  constructor(
    @InjectRepository(AiModelAnswerReview)
    private aiModelAnswerReviewRepository: Repository<AiModelAnswerReview>,
    @InjectRepository(PositiveNegativeAiModelAnswer)
    private positiveNegativeAiModelAnswerRepository: Repository<PositiveNegativeAiModelAnswer>,
    @InjectRepository(RegenerateAiModelAnswer)
    private regenerateAiModelAnswerRepository: Repository<RegenerateAiModelAnswer>,
    private readonly subscriptionUsageService: SubscriptionUsageService,
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
    private readonly crypto: CryptoService,
    private readonly configService: ConfigService,
    private readonly tokensService: TokensService,
    private readonly aiPreferencesService: AiPreferencesService,
    private readonly memoryTagCatalogV2Service: MemoryTagCatalogV2Service,
    @Optional()
    private readonly aiErrorReporter?: AiErrorReporterService,
  ) {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  private mapToTiktokenModel(model: AiModel | TiktokenModel): TiktokenModel {
    switch (model) {
      case AiModel.GPT_5_6_TERRA:
      case AiModel.GPT_5_6_LUNA:
      case AiModel.GPT_5_4:
      case AiModel.GPT_5_2:
        return 'gpt-5';
      case AiModel.GPT_5_MINI:
        return 'gpt-5-mini';
      default:
        return model as TiktokenModel;
    }
  }

  hasUsage(x: unknown): x is ChunkWithUsage {
    return (
      typeof x === 'object' &&
      x !== null &&
      'usage' in x &&
      typeof (x as Record<string, unknown>).usage === 'object' &&
      (x as Record<string, unknown>).usage !== null
    );
  }

  isOpenAiUsage(u: unknown): u is StreamUsage {
    if (!u || typeof u !== 'object') return false;
    const o = u as Record<string, unknown>;
    return (
      typeof o.prompt_tokens === 'number' &&
      typeof o.completion_tokens === 'number' &&
      typeof o.total_tokens === 'number'
    );
  }

  assertNever(x: never, msg?: string): never {
    throwError(
      HttpStatus.INTERNAL_SERVER_ERROR,
      'Unexpected AI provider',
      msg ?? 'Unexpected AI provider value.',
      'UNEXPECTED_AI_PROVIDER',
      { value: x },
    );
  }

  isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null;
  }

  isClaudeTextDeltaEvent(e: unknown): e is ClaudeTextDeltaEvent {
    if (!this.isRecord(e)) return false;
    if (e.type !== 'content_block_delta') return false;
    const delta = e.delta;
    if (!this.isRecord(delta)) return false;
    if (delta.type !== 'text_delta') return false;
    return delta.text == null || typeof delta.text === 'string';
  }

  isClaudeMessageStartEvent(e: unknown): e is ClaudeMessageStartEvent {
    if (!this.isRecord(e)) return false;
    if (e.type !== 'message_start') return false;
    const msg = e.message;
    if (msg == null) return true;
    if (!this.isRecord(msg)) return false;
    const usage = msg.usage;
    if (usage == null) return true;
    if (!this.isRecord(usage)) return false;
    return (
      (usage.input_tokens == null || typeof usage.input_tokens === 'number') &&
      (usage.output_tokens == null || typeof usage.output_tokens === 'number')
    );
  }

  isClaudeMessageDeltaWithStopEvent(
    e: unknown,
  ): e is ClaudeMessageDeltaWithStopEvent {
    if (!this.isRecord(e)) return false;
    if (e.type !== 'message_delta') return false;

    if (e.delta != null) {
      if (!this.isRecord(e.delta)) return false;
      const sr = e.delta.stop_reason;
      if (sr != null && typeof sr !== 'string') return false;
    }

    if (e.usage != null) {
      if (!this.isRecord(e.usage)) return false;
      const u = e.usage;
      if (u.input_tokens != null && typeof u.input_tokens !== 'number')
        return false;
      if (u.output_tokens != null && typeof u.output_tokens !== 'number')
        return false;
    }

    return true;
  }

  getMaxOutTokens(_mode: AiContentMode): number {
    return 2500;
  }

  private buildDialogResponseDiscipline(mode: AiContentMode): string {
    const maxCharacters = mode === 'checkin_dialog' ? 1500 : 2000;
    const safeTarget = mode === 'checkin_dialog' ? '1100-1350' : '1500-1800';
    return `
          **DIALOG RESPONSE LENGTH AND ENDING (HARD RULES):**
          - maximum ${maxCharacters} characters for the COMPLETE final answer, including Markdown markers and whitespace; this is an absolute ceiling
          - the normal average-length target is ${safeTarget} characters, leaving a safety margin below the hard ceiling
          - if the topic genuinely needs fuller explanation, you may expand beyond the average target up to ${maxCharacters} characters, but never exceed that maximum
          - before sending, silently count or conservatively estimate the characters in the complete answer; if it may exceed ${maxCharacters}, rewrite it shorter before emitting any part of it
          - never rely on the client or server to truncate the answer; finish the thought naturally within the limit
          - plan the answer before writing and keep only reasoning that changes the conclusion or next step
          - if the answer is simple, use 2-5 sentences
          - do not add filler, generic validation, or a long psychology article just to look complete
          - end immediately after the useful answer, conclusion, concrete wording, or next step
          - do not routinely offer additional help, more examples, another template, a plan, or alternative wording
          - never append "If you want, I can...", "If you'd like, I can...", "Якщо хочеш, можу..." or an equivalent phrase in any language
    `.trim();
  }

  private writePromptDebugSnapshot(snapshot: AiPromptDebugSnapshot): void {
    if (process.env.NODE_ENV === 'production') return;
    scheduleServerDebugTask(() => {
      let serialized: string;
      try {
        serialized = JSON.stringify(snapshot, null, 2);
      } catch (error) {
        this.logger.warn(
          `Unable to serialize AI prompt debug snapshot: ${error instanceof Error ? error.message : String(error)}`,
        );
        return;
      }

      this.promptDebugSnapshotWriteQueue = this.promptDebugSnapshotWriteQueue
        .then(async () => {
          const directory = resolve(process.cwd(), '.tmp');
          await mkdir(directory, { recursive: true });
          await writeFile(
            resolve(directory, 'last-ai-prompt.json'),
            serialized,
            'utf8',
          );
        })
        .catch((error) => {
          this.logger.warn(
            `Unable to write AI prompt debug snapshot: ${error instanceof Error ? error.message : String(error)}`,
          );
        });
    });
  }

  private async countClaudePayloadTokens(
    modelId: string,
    system: string,
    claudeMessages: { role: 'user' | 'assistant'; content: string }[],
  ): Promise<number> {
    const res = await this.anthropic.messages.countTokens({
      model: modelId,
      system,
      messages: claudeMessages,
    });
    return res.input_tokens;
  }

  private async countClaudeTextTokens(
    modelId: string,
    text: string,
  ): Promise<number> {
    const res = await this.anthropic.messages.countTokens({
      model: modelId,
      system: '',
      messages: [{ role: 'user', content: text }],
    });
    return res.input_tokens;
  }

  async generateComment(
    userId: number,
    aboutMe: string,
    userMemory: OpenAiMessage,
    assistantMemory: OpenAiMessage,
    assistantCommitment: OpenAiMessage,
    prompt: OpenAiMessage[],
    goalsPrompt: string,
    text: string,
    timeContext: TimeContext,
    aiModel: AiModel,
    mood: string,
    onToken: (chunk: string) => void,
    mode: AiContentMode = 'entry',
    metrics: EntryMetrics | null,
    diaryContent?: OpenAiMessage,
    aiComment?: OpenAiMessage,
    dialogs: OpenAiMessage[] = [],
    isFirstEntry: boolean = false,
    generateShortReflection: boolean = false,
    timing?: BackendAiTimingContext,
    streamStructuredResponse: boolean = false,
    contextProtocol?: 'memory_capsules_v2',
    itemDateMs?: number,
    title?: string,
  ): Promise<GenerateCommentResult> {
    markBackendAiTiming(this.logger, timing, 'service_started');
    aiModel = normalizeAiModel(aiModel);

    const isDialog = mode === 'dialog';
    const isCheckinDialog = mode === 'checkin_dialog';
    const isCheckin = mode === 'checkin';
    const longitudinalResponseGuidance =
      buildLongitudinalResponseGuidance(mode);
    const dialogResponseDiscipline =
      isDialog || isCheckinDialog
        ? this.buildDialogResponseDiscipline(mode)
        : '';

    const userLookupStartedAt = Date.now();
    const user = await this.usersService.findById(userId, ['settings']);
    markBackendAiTiming(this.logger, timing, 'user_loaded', {
      phaseDurationMs: Date.now() - userLookupStartedAt,
    });

    if (!user) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'User not found',
        'User not found',
        'USER_NOT_FOUND',
      );
      return { content: '', tags: [] };
    }

    if (mode === 'entry' || mode === 'checkin') {
      generateShortReflection = user.settings.shortAiReflectionEnabled ?? true;
    }

    const metricsBlock = this.buildEntryMetricsBlock(metrics);
    markBackendAiTiming(this.logger, timing, 'styles_load_start');
    const stylesBlock = await this.getStylesBlock(userId, mode);
    markBackendAiTiming(this.logger, timing, 'styles_load_done', {
      characters: stylesBlock.length,
    });

    const systemPromptParams = {
      mode,
      userName: user.name,
      timeContext,
      contextProtocol,
      aboutMe,
      metricsBlock,
      goalsPrompt,
      stylesBlock,
      languageBlock: this.buildLanguageBlock(
        user.settings.conversationLanguage,
      ),
      longitudinalResponseGuidance,
      dialogResponseDiscipline,
      isFirstEntry,
      generateShortReflection,
    };
    markBackendAiTiming(this.logger, timing, 'system_prompt_build_start');
    const systemPromptParts =
      buildResponseSystemPromptParts(systemPromptParams);

    const systemMsg: OpenAiMessage = {
      role: 'system',
      content: buildResponseSystemPrompt(systemPromptParams),
    };
    markBackendAiTiming(this.logger, timing, 'system_prompt_build_done', {
      characters: systemMsg.content.length,
    });

    const promptMessageParts: Array<{
      label: string;
      message: OpenAiMessage;
    }> = [
      { label: 'system_prompt', message: systemMsg },
      { label: 'legacy_user_memory', message: userMemory },
      { label: 'legacy_assistant_memory', message: assistantMemory },
      { label: 'legacy_assistant_commitments', message: assistantCommitment },
      ...prompt.map((message, index) => ({
        label:
          contextProtocol === 'memory_capsules_v2'
            ? `memory_capsules_v2_context_${index + 1}`
            : `retrieved_context_${index + 1}`,
        message,
      })),
    ].filter(({ message }) => message.content.trim().length > 0);
    const messages: OpenAiMessage[] = promptMessageParts.map(
      ({ message }) => message,
    );

    let dialogBaseCacheMessageIndex: number | undefined;

    if (diaryContent) {
      messages.push(diaryContent);
      promptMessageParts.push({
        label:
          isCheckin || isCheckinDialog ? 'current_checkin' : 'current_entry',
        message: diaryContent,
      });
      if (
        (isDialog || isCheckinDialog) &&
        contextProtocol === 'memory_capsules_v2'
      ) {
        dialogBaseCacheMessageIndex = messages.length - 1;
      }
    }

    if (aiComment) {
      messages.push(aiComment);
      promptMessageParts.push({
        label: 'initial_ai_reflection',
        message: aiComment,
      });
      if (
        (isDialog || isCheckinDialog) &&
        contextProtocol === 'memory_capsules_v2'
      ) {
        dialogBaseCacheMessageIndex = messages.length - 1;
      }
    }

    const lastDialogs: OpenAiMessage[] = dialogs.flatMap((dialog) => [
      {
        role: dialog.role,
        content: dialog.content,
      },
    ]);

    lastDialogs.forEach((message, index) => {
      messages.push(message);
      promptMessageParts.push({
        label: `previous_dialog_message_${index + 1}`,
        message,
      });
    });

    const cleanedText = text
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .trim();
    const cleanedTitle =
      typeof title === 'string'
        ? title
            .replace(/<[^>]*>/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 1000)
        : '';

    let lastMessageContent: string;
    if (isDialog || isCheckinDialog) {
      lastMessageContent = `Q: ${cleanedText}\n\n[CURRENT_TIME_CONTEXT]\n- timeZone: ${timeContext.timeZone}\n- nowLocalText: ${timeContext.nowLocalText}\n- locale: ${timeContext.locale}`;
    } else if (isCheckin) {
      const currentItemDateMs =
        typeof itemDateMs === 'number' && Number.isFinite(itemDateMs)
          ? itemDateMs
          : Date.now();
      const moodLine = /(?:^|\n)Mood:\s*/u.test(cleanedText)
        ? ''
        : `\nMood: ${mood}`;
      lastMessageContent = `Current check-in (${formatDateForPrompt(currentItemDateMs, timeContext.timeZone)}):\nSaved weekday: ${formatWeekdayForPrompt(currentItemDateMs, timeContext.timeZone)}\n${cleanedText}${moodLine}`;
    } else {
      const currentItemDateMs =
        typeof itemDateMs === 'number' && Number.isFinite(itemDateMs)
          ? itemDateMs
          : Date.now();
      lastMessageContent = this.formatCurrentJournalEntryForPrompt(
        formatDateForPrompt(currentItemDateMs, timeContext.timeZone),
        cleanedText,
        mood,
        cleanedTitle,
        formatWeekdayForPrompt(currentItemDateMs, timeContext.timeZone),
      );
    }

    const lastMessage: OpenAiMessage = {
      role: 'user',
      content: lastMessageContent,
    };

    messages.push(lastMessage);
    promptMessageParts.push({
      label:
        isDialog || isCheckinDialog
          ? 'current_dialog_question'
          : isCheckin
            ? 'current_checkin_text'
            : 'current_entry_text',
      message: lastMessage,
    });

    markBackendAiTiming(this.logger, timing, 'prompt_ready', {
      messages: messages.length,
      similarMessages: prompt.length,
    });

    const spec = MODEL_REGISTRY[aiModel];
    if (!spec) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'Unknown AI model',
        'Selected AI model is not supported.',
        'UNKNOWN_AI_MODEL',
        { aiModel },
      );
    }

    const dialogBaseCacheResource =
      dialogBaseCacheMessageIndex != null
        ? JSON.stringify(
            messages
              .slice(0, dialogBaseCacheMessageIndex + 1)
              .map(({ role, content }) => ({ role, content })),
          )
        : undefined;
    const dialogBaseCacheFingerprint = dialogBaseCacheResource
      ? buildOpenAiPromptCacheResourceHash(dialogBaseCacheResource)
      : undefined;
    const shouldCachePrompt = shouldUseResponsePromptCache(mode);
    const promptCacheKey =
      shouldCachePrompt && spec.provider === AiProvider.OPENAI
        ? buildOpenAiPromptCacheKey({
            modelId: spec.providerModelId,
            scope: mode,
            userId,
            resourceId: dialogBaseCacheResource,
          })
        : undefined;

    const schedulePromptDebugOutput = (
      actualUsage?: AiPromptDebugSnapshot['actualUsage'],
    ) => {
      if (process.env.NODE_ENV === 'production') return;
      scheduleServerDebugTask(() => {
        const pricing = getModelPriceCredits(aiModel);
        const inputCreditsUnrounded = (tokens: number) =>
          Number(((tokens * pricing.inPer1M) / 1_000_000).toFixed(4));
        const debugTokenCounts = this.countIndividualStringTokens(
          [
            ...messages.map((message) => message.content),
            systemPromptParts.stablePrefix,
          ],
          aiModel,
        );
        const debugMessages = messages.map((message, index) => {
          const contentTokens = debugTokenCounts[index] ?? 0;
          return {
            index,
            label: promptMessageParts[index]?.label ?? `message_${index + 1}`,
            role: message.role,
            characters: message.content.length,
            contentTokens,
            estimatedTokensWithEnvelope: contentTokens + 3,
            inputCreditsUnrounded: inputCreditsUnrounded(contentTokens + 3),
            estimatedInputCredits: inputCreditsUnrounded(contentTokens + 3),
            billingClass: 'provider_cache_usage_decides' as const,
            content: message.content,
          };
        });
        const contentTokens = debugMessages.reduce(
          (total, message) => total + message.contentTokens,
          0,
        );
        const estimatedPromptTokens = contentTokens + messages.length * 3 + 3;
        const estimatedPromptCredits = tokensToCredits(
          aiModel,
          estimatedPromptTokens,
          0,
        ).inputUsedCredits;
        const promptDebugSnapshot: AiPromptDebugSnapshot = {
          marker: 'NEMORY_AI_PROMPT_DEBUG_SNAPSHOT',
          createdAt: new Date().toISOString(),
          traceId: timing?.traceId ?? null,
          mode,
          model: spec.providerModelId,
          tokenizerModel: aiModel,
          pricing: {
            inputCreditsPer1MTokens: pricing.inPer1M,
            cachedInputCreditsPer1MTokens: pricing.cachedInPer1M,
            cacheWriteInputCreditsPer1MTokens: pricing.cacheWriteInPer1M,
            outputCreditsPer1MTokens: pricing.outPer1M,
          },
          promptCache: {
            key: promptCacheKey ?? null,
            mode: !shouldCachePrompt
              ? 'disabled'
              : spec.provider === AiProvider.ANTHROPIC
                ? 'anthropic_ephemeral_5m'
                : supportsExplicitPromptCaching(spec.providerModelId)
                  ? 'explicit'
                  : 'implicit',
            stablePrefixTokens: debugTokenCounts[messages.length] ?? 0,
            ...(dialogBaseCacheMessageIndex != null
              ? {
                  dialogBaseMessageIndex: dialogBaseCacheMessageIndex,
                  dialogBaseFingerprint: dialogBaseCacheFingerprint,
                  dialogBasePrefixTokens: debugMessages
                    .slice(0, dialogBaseCacheMessageIndex + 1)
                    .reduce(
                      (total, message) => total + message.contentTokens + 3,
                      3,
                    ),
                }
              : {}),
          },
          estimatedPromptTokens,
          estimatedPromptCredits,
          contentTokens,
          contentCreditsUnrounded: inputCreditsUnrounded(contentTokens),
          messageEnvelopeTokens: estimatedPromptTokens - contentTokens,
          messageEnvelopeCreditsUnrounded: inputCreditsUnrounded(
            estimatedPromptTokens - contentTokens,
          ),
          messages: debugMessages,
          ...(actualUsage ? { actualUsage } : {}),
        };

        if (contextProtocol === 'memory_capsules_v2') {
          const dialogFlow = isDialog || isCheckinDialog;
          const memoryContextMessage = debugMessages.find((message) =>
            message.label.startsWith('memory_capsules_v2_context_'),
          );
          const currentMessageLabel = dialogFlow
            ? 'current_dialog_question'
            : isCheckin
              ? 'current_checkin_text'
              : 'current_entry_text';
          const currentMessage = debugMessages.find(
            (message) => message.label === currentMessageLabel,
          );
          const currentRecordMessage = debugMessages.find((message) =>
            isCheckinDialog
              ? message.label === 'current_checkin'
              : message.label === 'current_entry',
          );
          const initialReflectionMessage = debugMessages.find(
            (message) => message.label === 'initial_ai_reflection',
          );
          const previousDialogMessages = debugMessages.filter((message) =>
            message.label.startsWith('previous_dialog_message_'),
          );
          const systemPromptMessage = debugMessages.find(
            (message) => message.label === 'system_prompt',
          );
          const memoryContextContent = memoryContextMessage?.content ?? '';
          const relevantContent = extractPromptSection(
            memoryContextContent,
            'RELEVANT_PREVIOUS_ENTRIES',
          );
          const commitmentsContent = extractPromptSection(
            memoryContextContent,
            'ACTIVE_NEMORY_COMMITMENTS',
          );
          const userMemoryContent = extractPromptSection(
            memoryContextContent,
            'LONG_TERM_USER_MEMORY',
          );
          const sectionTokenCounts = this.countIndividualStringTokens(
            [relevantContent, commitmentsContent, userMemoryContent],
            aiModel,
          );
          const partUsage = (tokens: number) => {
            return {
              tokens,
              credits: inputCreditsUnrounded(tokens),
            };
          };
          const relevantUsage = partUsage(sectionTokenCounts[0] ?? 0);
          const commitmentsUsage = partUsage(sectionTokenCounts[1] ?? 0);
          const userMemoryUsage = partUsage(sectionTokenCounts[2] ?? 0);
          const memoryContextTokens = memoryContextMessage?.contentTokens ?? 0;
          const wrappersTokens = Math.max(
            0,
            memoryContextTokens -
              relevantUsage.tokens -
              commitmentsUsage.tokens -
              userMemoryUsage.tokens,
          );
          const memoryContextUsage = {
            tokens: memoryContextTokens,
            credits: inputCreditsUnrounded(memoryContextTokens),
          };
          const currentUsage = {
            tokens: currentMessage?.contentTokens ?? 0,
            credits: inputCreditsUnrounded(currentMessage?.contentTokens ?? 0),
          };
          const currentRecordUsage = partUsage(
            currentRecordMessage?.contentTokens ?? 0,
          );
          const initialReflectionUsage = partUsage(
            initialReflectionMessage?.contentTokens ?? 0,
          );
          const previousDialogTokens = previousDialogMessages.reduce(
            (total, message) => total + message.contentTokens,
            0,
          );
          const previousDialogUsage = partUsage(previousDialogTokens);
          const visibleDynamicTokens =
            currentUsage.tokens +
            memoryContextUsage.tokens +
            (dialogFlow
              ? currentRecordUsage.tokens +
                initialReflectionUsage.tokens +
                previousDialogUsage.tokens
              : 0);

          logServerMemoryReview({
            step: 2,
            title: 'КОНТЕКСТ, ВІДПРАВЛЕНИЙ НА АНАЛІЗ',
            sourceType: mode,
            traceId: timing?.traceId,
            userId,
            sections: [
              ...(dialogFlow
                ? [
                    {
                      label: 'ПОТОЧНЕ ПИТАННЯ КОРИСТУВАЧА',
                      value: cleanedText,
                      usage: currentUsage,
                      tokenText: currentMessage?.content ?? '',
                    },
                    {
                      label: isCheckinDialog
                        ? 'ПОТОЧНИЙ ЧЕКІН'
                        : 'ПОТОЧНИЙ ЗАПИС',
                      value: {
                        source: currentRecordMessage?.content ?? '',
                        metrics,
                      },
                      usage: currentRecordUsage,
                      tokenText: currentRecordMessage?.content ?? '',
                    },
                    {
                      label: 'ПОЧАТКОВА AI-РЕФЛЕКСІЯ',
                      value: initialReflectionMessage?.content ?? '',
                      usage: initialReflectionUsage,
                      tokenText: initialReflectionMessage?.content ?? '',
                    },
                    {
                      label: 'ПОПЕРЕДНІ ХОДИ ЦЬОГО ДІАЛОГУ',
                      value: previousDialogMessages.map((message) => ({
                        role: message.role,
                        content: message.content,
                      })),
                      count: previousDialogMessages.length,
                      usage: previousDialogUsage,
                      tokenText: previousDialogMessages
                        .map((message) => message.content)
                        .join('\n'),
                    },
                  ]
                : [
                    {
                      label: isCheckin ? 'ПОТОЧНИЙ ЧЕКІН' : 'ПОТОЧНИЙ ЗАПИС',
                      value: {
                        ...(cleanedTitle ? { title: cleanedTitle } : {}),
                        mood,
                        metrics,
                        text: cleanedText,
                      },
                      usage: currentUsage,
                      tokenText: currentMessage?.content ?? '',
                    },
                  ]),
              {
                label: 'РЕЛЕВАНТНІ ПОПЕРЕДНІ ЗАПИСИ ТА ЧЕКІНИ',
                value: relevantContent,
                count: countOccurrences(
                  relevantContent,
                  '[RELEVANT_ENTRY_DIGEST]',
                ),
                usage: relevantUsage,
                tokenText: relevantContent,
              },
              {
                label: 'АКТИВНІ ОБІЦЯНКИ NEMORY',
                value: commitmentsContent,
                count: countPromptListItems(commitmentsContent),
                usage: commitmentsUsage,
                tokenText: commitmentsContent,
              },
              {
                label: "ДОВГОТРИВАЛА ПАМ'ЯТЬ КОРИСТУВАЧА",
                value: userMemoryContent,
                count: countPromptListItems(userMemoryContent),
                usage: userMemoryUsage,
                tokenText: userMemoryContent,
              },
              {
                label: 'СЛУЖБОВІ ІНСТРУКЦІЇ ТА ОБГОРТКИ MEMORY V2',
                value: null,
                usage: {
                  tokens: wrappersTokens,
                  credits: inputCreditsUnrounded(wrappersTokens),
                },
              },
              {
                label:
                  isCheckin || isCheckinDialog
                    ? 'ПІДСУМОК MEMORY V2 (БЕЗ ПОТОЧНОГО ЧЕКІНУ)'
                    : 'ПІДСУМОК MEMORY V2 (БЕЗ ПОТОЧНОГО ЗАПИСУ)',
                value: null,
                usage: memoryContextUsage,
                tokenText: memoryContextContent,
              },
              {
                label: dialogFlow
                  ? 'РАЗОМ КОНТЕКСТ ДІАЛОГУ + MEMORY V2'
                  : 'РАЗОМ ПОТОЧНИЙ ТЕКСТ + MEMORY V2',
                value: null,
                usage: {
                  tokens: visibleDynamicTokens,
                  credits: inputCreditsUnrounded(visibleDynamicTokens),
                },
              },
              {
                label: 'УСЬОГО ПРОМПТУ ДО МОДЕЛІ (ОЦІНКА ДО ВІДПРАВКИ)',
                value: {
                  messages: messages.length,
                  includesSystemPrompt: true,
                  includesGoalsAndSettings: true,
                },
                usage: {
                  tokens: estimatedPromptTokens,
                  credits: estimatedPromptCredits,
                },
              },
              ...(dialogFlow
                ? [
                    {
                      label: 'СИСТЕМНИЙ ПРОМПТ',
                      value: null,
                      tokenText: systemPromptMessage?.content ?? '',
                    },
                    {
                      label: 'ПРО КОРИСТУВАЧА',
                      value: aboutMe,
                      tokenText: aboutMe,
                    },
                    {
                      label: 'ЦІЛІ ТА ПРОГРЕС',
                      value: goalsPrompt,
                      tokenText: goalsPrompt,
                    },
                  ]
                : []),
            ],
          });
        }
        this.writePromptDebugSnapshot(promptDebugSnapshot);
      });
    };

    let fullText = '';
    let inputTokens: number | undefined;
    let cachedInputTokens = 0;
    let cacheWriteInputTokens = 0;
    let outputTokens: number | undefined;
    let finishReason: string | undefined;
    let estimated = false;
    let result: GenerateCommentResult | undefined;
    if ((mode === 'entry' || mode === 'checkin') && generateShortReflection) {
      const modelStartedAt = Date.now();
      markBackendAiTiming(this.logger, timing, 'model_request_start', {
        provider: spec.provider,
        model: spec.providerModelId,
      });
      const structuredProgress = streamStructuredResponse
        ? createStructuredReflectionProgress(onToken)
        : null;
      const res = structuredProgress
        ? spec.provider === AiProvider.OPENAI
          ? await this.streamOpenAiChat(
              aiModel,
              spec.providerModelId,
              messages,
              (chunk) => structuredProgress.push(chunk),
              mode,
              true,
              promptCacheKey,
              systemPromptParts.stablePrefix,
            )
          : await this.streamClaudeChat(
              spec.providerModelId,
              messages,
              (chunk) => structuredProgress.push(chunk),
              mode,
              undefined,
            )
        : spec.provider === AiProvider.OPENAI
          ? await this.generateOpenAiChat(
              aiModel,
              spec.providerModelId,
              messages,
              mode,
              true,
              promptCacheKey,
              systemPromptParts.stablePrefix,
            )
          : await this.generateClaudeChat(
              spec.providerModelId,
              messages,
              mode,
              undefined,
            );

      structuredProgress?.finish(res.fullText);

      markBackendAiTiming(this.logger, timing, 'model_response_received', {
        phaseDurationMs: Date.now() - modelStartedAt,
        inputTokens: res.inputTokens,
        cachedInputTokens: res.cachedInputTokens,
        outputTokens: res.outputTokens,
      });

      fullText = res.fullText;
      inputTokens = res.inputTokens;
      cachedInputTokens = res.cachedInputTokens;
      cacheWriteInputTokens = res.cacheWriteInputTokens;
      outputTokens = res.outputTokens;
      finishReason = res.finishReason;
      estimated = res.estimated;
      result = this.parseShortFullReflection(fullText);
    } else if (spec.provider === AiProvider.OPENAI) {
      const res = await this.streamOpenAiChat(
        aiModel,
        spec.providerModelId,
        messages,
        onToken,
        mode,
        false,
        promptCacheKey,
        systemPromptParts.stablePrefix,
        dialogBaseCacheMessageIndex != null
          ? [dialogBaseCacheMessageIndex]
          : [],
      );
      fullText = res.fullText;
      inputTokens = res.inputTokens;
      cachedInputTokens = res.cachedInputTokens;
      cacheWriteInputTokens = res.cacheWriteInputTokens;
      outputTokens = res.outputTokens;
      finishReason = res.finishReason;
      estimated = res.estimated;
      result = { content: fullText, fullText, tags: [] };
    } else if (spec.provider === AiProvider.ANTHROPIC) {
      const res = await this.streamClaudeChat(
        spec.providerModelId,
        messages,
        onToken,
        mode,
        shouldCachePrompt ? systemPromptParts.stablePrefix : undefined,
        dialogBaseCacheMessageIndex != null
          ? [dialogBaseCacheMessageIndex]
          : [],
      );
      fullText = res.fullText;
      inputTokens = res.inputTokens;
      cachedInputTokens = res.cachedInputTokens;
      cacheWriteInputTokens = res.cacheWriteInputTokens;
      outputTokens = res.outputTokens;
      finishReason = res.finishReason;
      estimated = res.estimated;
      result = { content: fullText, fullText, tags: [] };
    } else {
      this.assertNever(spec.provider, `Unsupported provider`);
    }

    if (inputTokens != null && outputTokens != null) {
      const actualCredits = tokensToCredits(
        aiModel,
        inputTokens,
        outputTokens,
        cachedInputTokens,
        cacheWriteInputTokens,
      );
      schedulePromptDebugOutput({
        promptTokens: inputTokens,
        providerReportedCachedPromptTokens: cachedInputTokens,
        providerReportedCacheWritePromptTokens: cacheWriteInputTokens,
        cachePricingSource:
          cachedInputTokens > 0 || cacheWriteInputTokens > 0 || !estimated
            ? 'provider_usage'
            : 'estimated_standard_input',
        standardPromptTokens: Math.max(
          0,
          inputTokens - cachedInputTokens - cacheWriteInputTokens,
        ),
        cachedPromptTokens: cachedInputTokens,
        cacheWritePromptTokens: cacheWriteInputTokens,
        completionTokens: outputTokens,
        promptCredits: actualCredits.inputUsedCredits,
        completionCredits: actualCredits.outputUsedCredits,
        totalCredits:
          actualCredits.inputUsedCredits + actualCredits.outputUsedCredits,
        estimated,
        ...(finishReason ? { finishReason } : {}),
      });
    } else {
      schedulePromptDebugOutput();
    }

    const tokenType = this.getResponseTokenType(mode);

    if (inputTokens != null && outputTokens != null) {
      const usageStartedAt = Date.now();
      markBackendAiTiming(this.logger, timing, 'usage_persist_start');
      await this.persistAiUsage({
        userId,
        type: tokenType,
        model: aiModel,
        modelLabel: spec.providerModelId,
        inputTokens,
        cachedInputTokens,
        cacheWriteInputTokens,
        outputTokens,
        finishReason,
        estimated,
        traceId: timing?.traceId,
        operation: `generate_${mode}_response`,
        cycleComplete:
          (mode === 'dialog' || mode === 'checkin_dialog') &&
          contextProtocol !== 'memory_capsules_v2',
      });
      markBackendAiTiming(this.logger, timing, 'usage_persist_done', {
        phaseDurationMs: Date.now() - usageStartedAt,
      });
    }

    markBackendAiTiming(this.logger, timing, 'service_done');
    return result ?? { content: fullText, fullText, tags: [] };
  }

  private getResponseTokenType(mode: AiContentMode): TokenType {
    if (mode === 'checkin') return TokenType.CHECKIN;
    if (mode === 'dialog' || mode === 'checkin_dialog') {
      return TokenType.DIALOG;
    }
    return TokenType.ENTRY;
  }

  private buildEntryMetricsBlock(metrics: EntryMetrics | null): string {
    if (!metrics) return '';

    const items: string[] = [];

    const push = (label: string, v: unknown) => {
      if (v === null || v === undefined) return;
      if (typeof v !== 'string' && typeof v !== 'number') return;
      items.push(`- ${label}: ${String(v)}`);
    };

    push('Energy', metrics.energy);
    push('Focus', metrics.focus);
    push('Stress', metrics.stress);
    push('Motivation', metrics.motivation);
    push('Sleep quality', metrics.sleepQuality);

    if (!items.length) return '';

    return `
**Entry metrics (self-reported, 1–5):**
${items.join('\n')}
Use these metrics as additional context about the user's current state (energy/focus/stress/motivation/sleep). Do not overinterpret them, but let them subtly guide tone and suggestions.
Consider the written account, selected mood and metrics together. When they
materially point in different directions, acknowledge the state as mixed or
uneven instead of silently treating one signal as authoritative. Do not invent
an emotion the user did not express.
`;
  }

  private parseShortFullReflection(raw: string): GenerateCommentResult {
    const fallback: GenerateCommentResult = {
      content: raw,
      fullText: raw,
      shortText: null,
      tags: [],
    };

    const trimmed = raw.trim();
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');

    if (start < 0 || end <= start) {
      return fallback;
    }

    try {
      const parsed = JSON.parse(trimmed.slice(start, end + 1)) as {
        shortText?: unknown;
        fullText?: unknown;
        tags?: unknown;
      };
      const fullText =
        typeof parsed.fullText === 'string' ? parsed.fullText.trim() : '';
      const shortText =
        typeof parsed.shortText === 'string' ? parsed.shortText.trim() : '';
      const tags = Array.isArray(parsed.tags)
        ? parsed.tags.filter((tag): tag is string => typeof tag === 'string')
        : [];

      if (!fullText && !shortText) {
        return fallback;
      }

      const normalizedFullText = fullText || shortText;

      return {
        content: normalizedFullText,
        fullText: normalizedFullText,
        shortText: shortText || null,
        tags,
      };
    } catch {
      return fallback;
    }
  }

  async getStylesBlock(userId: number, mode: AiContentMode): Promise<string> {
    const aiPreferences = await this.aiPreferencesService.getForUser(userId);
    let styleBlock = '';
    if (aiPreferences) {
      styleBlock = buildAiPreferencesInstruction({
        prefs: aiPreferences.prefsJson,
        mode,
      });
    }

    if (styleBlock) {
      return `
      **TONE & STYLE PREFERENCES (MUST FOLLOW)**
            ${styleBlock}  
            
            **STYLE EXECUTION RULES (VERY IMPORTANT)**
            - The Tone & Style preferences are REQUIREMENTS. Do not treat them as suggestions.
            - If preferences seem to conflict, DO NOT drop any of them. Combine them by adapting wording, not by removing a preference.
              Examples:
              - short + humor => keep it short, but make the phrasing witty (not longer).
              - practical + playful => give practical steps with playful voice.
              - direct + sensitive => be clear, but never harsh or cruel.
            - Only exception: sensitive/distressed context. In that case reduce humor/sarcasm FIRST, but keep Role/Tone supportive.
            - Never explain these rules to the user. Just follow them.
            
            **HUMOR & SARCASM ENFORCEMENT (ONLY WHEN SAFE)**
            - If Humor is enabled (light/normal) and the topic is not sensitive or tragic:
              - Use humor in the reply.
              - Even for short answers, include 1–2 light witty touches (wording, playful analogy, small joke).
            - If Sarcasm is enabled (light/normal/sarcastic) and the topic is not sensitive:
              - Sarcasm MUST be detectable as gentle teasing/irony.
              - Never be mean, dismissive, or humiliating.
            - If topic is sensitive, scary, grieving, trauma-related, or user seems distressed:
              - Avoid sarcasm and keep humor minimal or off; prioritize safety and warmth.
      `;
    }

    return 'Respond to the user as the user’s best friend would, as if you’ve known each other for a long time: lively, friendly, funny with jokes, and sometimes with a touch of sarcasm or irony (but never crossing the line of respect).';
  }

  buildLanguageBlock(
    conversationLanguage: ConversationLanguage | null,
  ): string {
    if (conversationLanguage) {
      const langName =
        CONVERSATION_LANGUAGE_LABELS_EN[conversationLanguage] ??
        "the user's preferred language";

      return `
            **ABSOLUTE LANGUAGE RULE (HIGHEST PRIORITY):**
            The app has provided the user’s preferred conversation language: ${langName}.
            You MUST answer ONLY in ${langName}.
            Do NOT use any other language –
            not even for a single word, phrase, example or quote.
            If the user’s text is in another language, briefly interpret it in ${langName}
            and continue your answer in ${langName} only.
            Do not switch to any other language without the user’s explicit request.
            Do not explain your language choice.
`.trim();
    }

    return `
            **ABSOLUTE LANGUAGE RULE (HIGHEST PRIORITY):**
            The app has NOT provided a fixed conversation language.
            You MUST answer in the SAME language as the the user’s current journal entry or question.
            Do not mix multiple languages in one answer.
            Do not switch to another language without an explicit request.
            
            Exception:
            If the user’s text is in Russian, you MUST answer in Ukrainian
            and briefly say that you do not know Russian.
`.trim();
  }

  private async buildMemoryCapsuleOutputRules(
    userId: number,
    fallbackText: string,
  ): Promise<string> {
    let configuredLanguage: string | null = null;
    try {
      const user = await this.usersService?.findById?.(userId, ['settings']);
      configuredLanguage =
        user?.settings?.conversationLanguage ?? user?.settings?.lang ?? null;
    } catch (error) {
      this.logger.warn(
        `Memory capsule language lookup failed; using source language: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const languageRule = configuredLanguage
      ? `The user's configured conversation language is ${
          CONVERSATION_LANGUAGE_LABELS_EN[configuredLanguage] ??
          configuredLanguage
        }. Write all human-readable prose JSON values ONLY in that language, even if the source text uses another language.`
      : `No configured conversation language is available. Write all human-readable prose JSON values in the dominant language of the source text below. If it is mixed, use the language of its first complete sentence. Source-language sample: ${JSON.stringify(
          fallbackText.slice(0, 240),
        )}`;

    return `
OUTPUT LANGUAGE AND PRODUCT NAME (CRITICAL):
- ${languageRule}
- Do not mix languages and do not follow the language of these instructions or examples.
- This language rule applies only to human-readable prose. Keep JSON property
  names, enum values, identifiers, keys and other machine-readable fields
  exactly as required by their schema; never translate or transliterate them.
- The assistant/product name is exactly "Nemory". This is a fixed brand name.
- Never translate, transliterate, inflect, misspell or replace "Nemory" (for example, never write "Неморі", "Нейморі" or "Нейтори").
- Prefer summaries that state the substance directly without unnecessarily naming the assistant. If the name is needed, use only the exact Latin spelling "Nemory".
    `.trim();
  }

  private async generateOpenAiChat(
    aiModel: AiModel,
    modelId: string,
    messages: OpenAiMessage[],
    mode: AiContentMode,
    jsonObject: boolean = false,
    promptCacheKey?: string,
    promptCacheStablePrefix?: string,
    promptCacheMessageIndexes: number[] = [],
  ): Promise<ChatGenerationResult> {
    const maxOut = this.getMaxOutTokens(mode);
    const promptCacheOptions = getOpenAiPromptCacheOptions(modelId);
    const useExplicitPromptCache = Boolean(
      promptCacheKey && promptCacheStablePrefix && promptCacheOptions,
    );
    const openAiMessages = useExplicitPromptCache
      ? addExplicitPromptCacheBreakpoint(
          messages,
          promptCacheStablePrefix!,
          promptCacheMessageIndexes,
        )
      : messages;
    const requestParams = {
      model: modelId,
      messages: openAiMessages,
      stream: false,
      store: false,
      max_completion_tokens: maxOut,
      ...(promptCacheKey ? { prompt_cache_key: promptCacheKey } : {}),
      ...(promptCacheOptions
        ? { prompt_cache_options: promptCacheOptions }
        : {}),
      ...(jsonObject
        ? {
            response_format: { type: 'json_object' as const },
          }
        : {}),
    } as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming & {
      prompt_cache_key?: string;
      prompt_cache_options?: { mode: 'explicit' };
    };

    const response = await this.openai.chat.completions.create(requestParams);
    const choice = response.choices[0];
    const fullText = choice?.message?.content?.trim() ?? '';
    const usage = response.usage;

    if (usage?.prompt_tokens != null && usage?.completion_tokens != null) {
      return {
        fullText,
        inputTokens: usage.prompt_tokens,
        cachedInputTokens: getCachedInputTokens(usage),
        cacheWriteInputTokens: getCacheWriteInputTokens(usage),
        outputTokens: usage.completion_tokens,
        totalTokens: usage.total_tokens,
        finishReason: choice?.finish_reason,
        estimated: false,
      };
    }

    const inputTokens = this.countOpenAiTokens(messages, aiModel);
    const tkModel = this.mapToTiktokenModel(aiModel);
    const enc = encoding_for_model(tkModel);
    const outputTokens = enc.encode(fullText).length;

    return {
      fullText,
      inputTokens,
      cachedInputTokens: 0,
      cacheWriteInputTokens: 0,
      outputTokens,
      finishReason: choice?.finish_reason,
      estimated: true,
    };
  }

  private async generateClaudeChat(
    modelId: string,
    messages: OpenAiMessage[],
    mode: AiContentMode,
    promptCacheStablePrefix?: string,
    promptCacheMessageIndexes: number[] = [],
  ): Promise<ChatGenerationResult> {
    const system = messages
      .filter((m) => m.role === 'system')
      .map((m) => (m.content ?? '').trim())
      .filter(Boolean)
      .join('\n\n---\n\n');

    const claudeMessages = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));
    const cachePayload = buildAnthropicPromptCachePayload(
      messages,
      promptCacheStablePrefix,
      promptCacheMessageIndexes,
    );

    const maxOut = this.getMaxOutTokens(mode);
    const response = await this.anthropic.messages.create({
      model: modelId,
      system: cachePayload.system,
      max_tokens: maxOut,
      messages: cachePayload.messages,
      stream: false,
    });

    const fullText = Array.isArray(response.content)
      ? response.content
          .map((part) => (part.type === 'text' ? part.text : ''))
          .join('')
          .trim()
      : '';
    const usage = getAnthropicTokenUsage(response.usage);
    const finishReason =
      typeof response.stop_reason === 'string'
        ? response.stop_reason
        : undefined;

    if (usage) {
      return {
        fullText,
        ...usage,
        finishReason,
        estimated: false,
      };
    }

    const estIn = await this.countClaudePayloadTokens(
      modelId,
      system,
      claudeMessages,
    );
    const estOut = await this.countClaudeTextTokens(modelId, fullText);

    return {
      fullText,
      inputTokens: estIn,
      cachedInputTokens: 0,
      cacheWriteInputTokens: 0,
      outputTokens: estOut,
      finishReason,
      estimated: true,
    };
  }

  private async streamOpenAiChat(
    aiModel: AiModel,
    modelId: string,
    messages: OpenAiMessage[],
    onToken: (chunk: string) => void,
    mode: AiContentMode,
    jsonObject: boolean = false,
    promptCacheKey?: string,
    promptCacheStablePrefix?: string,
    promptCacheMessageIndexes: number[] = [],
  ): Promise<{
    fullText: string;
    inputTokens: number;
    cachedInputTokens: number;
    cacheWriteInputTokens: number;
    outputTokens: number;
    totalTokens?: number;
    finishReason?: string;
    estimated: boolean;
  }> {
    const maxOut = this.getMaxOutTokens(mode);
    const promptCacheOptions = getOpenAiPromptCacheOptions(modelId);
    const useExplicitPromptCache = Boolean(
      promptCacheKey && promptCacheStablePrefix && promptCacheOptions,
    );
    const openAiMessages = useExplicitPromptCache
      ? addExplicitPromptCacheBreakpoint(
          messages,
          promptCacheStablePrefix!,
          promptCacheMessageIndexes,
        )
      : messages;
    const requestParams = {
      model: modelId,
      messages: openAiMessages,
      stream: true,
      store: false,
      stream_options: { include_usage: true },
      max_completion_tokens: maxOut,
      ...(promptCacheKey ? { prompt_cache_key: promptCacheKey } : {}),
      ...(promptCacheOptions
        ? { prompt_cache_options: promptCacheOptions }
        : {}),
      ...(jsonObject
        ? {
            response_format: { type: 'json_object' as const },
          }
        : {}),
    } as OpenAI.Chat.ChatCompletionCreateParamsStreaming & {
      prompt_cache_key?: string;
      prompt_cache_options?: { mode: 'explicit' };
    };

    const stream = (await this.openai.chat.completions.create(
      requestParams,
    )) as AsyncIterable<OpenAI.Chat.ChatCompletionChunk>;

    let fullText = '';
    let usage: StreamUsage | undefined;
    let finishReason: string | undefined;

    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta?.content;
      if (token) {
        fullText += token;
        onToken(token);
      }

      const fr = chunk.choices?.[0]?.finish_reason;
      if (fr) finishReason = fr;

      const u = (chunk as unknown as { usage?: unknown }).usage;
      if (this.isOpenAiUsage(u)) usage = u;
    }

    if (usage?.prompt_tokens != null && usage?.completion_tokens != null) {
      return {
        fullText,
        inputTokens: usage.prompt_tokens,
        cachedInputTokens: getCachedInputTokens(usage),
        cacheWriteInputTokens: getCacheWriteInputTokens(usage),
        outputTokens: usage.completion_tokens,
        finishReason,
        estimated: false,
      };
    }

    const inputTokens = this.countOpenAiTokens(messages, aiModel);
    const tkModel = this.mapToTiktokenModel(aiModel);
    const enc = encoding_for_model(tkModel);
    const outputTokens = enc.encode(fullText).length;

    return {
      fullText,
      inputTokens,
      cachedInputTokens: 0,
      cacheWriteInputTokens: 0,
      outputTokens,
      finishReason,
      estimated: true,
    };
  }

  private async streamClaudeChat(
    modelId: string,
    messages: OpenAiMessage[],
    onToken: (chunk: string) => void,
    mode: AiContentMode,
    promptCacheStablePrefix?: string,
    promptCacheMessageIndexes: number[] = [],
  ): Promise<{
    fullText: string;
    inputTokens: number;
    cachedInputTokens: number;
    cacheWriteInputTokens: number;
    outputTokens: number;
    finishReason?: string;
    estimated: boolean;
  }> {
    const system = messages
      .filter((m) => m.role === 'system')
      .map((m) => (m.content ?? '').trim())
      .filter(Boolean)
      .join('\n\n---\n\n');

    const claudeMessages = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));
    const cachePayload = buildAnthropicPromptCachePayload(
      messages,
      promptCacheStablePrefix,
      promptCacheMessageIndexes,
    );

    const maxOut = this.getMaxOutTokens(mode);

    const stream = await this.anthropic.messages.create({
      model: modelId,
      system: cachePayload.system,
      max_tokens: maxOut,
      messages: cachePayload.messages,
      stream: true,
    });

    let fullText = '';
    let usage: ClaudeUsage | undefined;
    let finishReason: string | undefined;

    for await (const raw of stream as AsyncIterable<unknown>) {
      if (this.isClaudeTextDeltaEvent(raw)) {
        const t = raw.delta.text ?? '';
        if (t) {
          fullText += t;
          onToken(t);
        }
        continue;
      }

      if (this.isClaudeMessageDeltaWithStopEvent(raw)) {
        if (raw.usage) {
          usage = {
            input_tokens: raw.usage.input_tokens ?? usage?.input_tokens,
            output_tokens: raw.usage.output_tokens ?? usage?.output_tokens,
            cache_creation_input_tokens:
              raw.usage.cache_creation_input_tokens ??
              usage?.cache_creation_input_tokens,
            cache_read_input_tokens:
              raw.usage.cache_read_input_tokens ??
              usage?.cache_read_input_tokens,
          };
        }
        const sr = raw.delta?.stop_reason;
        if (typeof sr === 'string' && sr.length) finishReason = sr;
        continue;
      }

      if (this.isClaudeMessageStartEvent(raw) && raw.message?.usage) {
        usage = {
          input_tokens: raw.message.usage.input_tokens ?? usage?.input_tokens,
          output_tokens:
            raw.message.usage.output_tokens ?? usage?.output_tokens,
          cache_creation_input_tokens:
            raw.message.usage.cache_creation_input_tokens ??
            usage?.cache_creation_input_tokens,
          cache_read_input_tokens:
            raw.message.usage.cache_read_input_tokens ??
            usage?.cache_read_input_tokens,
        };
        continue;
      }
    }
    const parsedUsage = getAnthropicTokenUsage(usage);
    if (parsedUsage) {
      return {
        fullText,
        ...parsedUsage,
        finishReason,
        estimated: false,
      };
    }

    const estIn = await this.countClaudePayloadTokens(
      modelId,
      system,
      claudeMessages,
    );
    const estOut = await this.countClaudeTextTokens(modelId, fullText);

    return {
      fullText,
      inputTokens: estIn,
      cachedInputTokens: 0,
      cacheWriteInputTokens: 0,
      outputTokens: estOut,
      finishReason,
      estimated: true,
    };
  }

  async extractUserMemoryFromText(
    userId: number,
    text: string,
    maxLength: number = 10,
    maxTextChars: number = 20000,
  ): Promise<ProposedMemoryItem[]> {
    const cleaned = text
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .trim();

    if (!cleaned) {
      return [];
    }

    const MAX_TEXT_CHARS = maxTextChars;
    const sliced =
      cleaned.length > MAX_TEXT_CHARS
        ? cleaned.slice(0, MAX_TEXT_CHARS)
        : cleaned;

    const kinds =
      ' "fact", "preference", "goal", "pattern", "value", "strength", "vulnerability", "trigger", "coping_strategy", "boundary", "meta", "other" ';

    const topics =
      ' "self", "work", "study", "relationships", "family", "health", "mental_health", "sleep", "habits", "productivity", "money", "creativity", "lifestyle", "values", "goals", "other" ';

    const systemMsg = {
      role: 'system' as const,
      content: `
You help build long-term memory about the user for a personal AI-powered journal.

Analyze the provided user text and extract only long-term insights about the user.

Types of insights (the "kind" field):

- "fact": a stable fact about the user (circumstances, role, persistent characteristics).
- "preference": preferences, style, what they like or dislike (for example, preferred advice format, communication style).
- "goal": long-term goals or directions of development.
- "pattern": a stable pattern of behavior or thinking. USE "pattern" ONLY if the text EXPLICITLY describes repetitiveness (words like: "always", "constantly", "every time", "regularly", "usually"). If you are not sure — use "fact" instead.
- "value": deep values and principles (what is truly important for the user).
- "strength": strengths, resources, sources of support (things they can rely on).
- "vulnerability": weak points, sensitivities, typical difficulties.
- "trigger": situations or factors that often trigger strong emotional or behavioral reactions.
- "coping_strategy": ways the user deals with stress or emotions (both helpful and harmful).
- "boundary": boundaries the user wants to maintain (in relationships, work, topics of conversation, etc.).
- "meta": settings for interaction with the assistant (how to talk to them, what to avoid in replies).
- "other": an important insight that does not fit any of the categories above.

The "topic" field is the main life area the insight belongs to. POSSIBLE VALUES:
${topics}

Use "other" only if the insight clearly does not fit any of the other topics.

The "importance" field is an integer from 1 to 5:
- 5 — a key point that strongly characterizes the user and is important for most replies.
- 4 — very important, strongly influences advice.
- 3 — useful to know, but not critical for every reply.
- 2 — a weak or local insight.
- 1 — an almost insignificant detail (such insights are better not to include without a good reason).

The "content" field is a short, concrete description of the insight (1–2 sentences, without unnecessary fluff).

REQUIRED RULES FOR "content":
- It is always a description of the user, not their direct speech.
- Do NOT use "I", "me", "my", "mine", "we", etc.
- Do not phrase it as the user’s answer or desire in the first person.
  ❌ "I want to have a lot of money"
  ✅ "Wants to have a lot of money"
  ❌ "I love my car"
  ✅ "Loves their car"
- Do not use the word "User" or similar references in the third person.
- Do not start the sentence with "User ..." or "The user ...".
- Do not put a period at the end.
- Formulate it neutrally, like a line from a personal dossier.

LANGUAGE RULE (CRITICAL):
- You MUST write every "content" value in the SAME LANGUAGE as the user text you are analyzing.
- Do NOT translate the content into any other language.
- Do NOT mix several languages inside one "content" string.
- Ignore the language of these instructions and any examples: they are ONLY about the format and logic, not about the output language.
- Look at the user text and:
  - Identify the main language (the language used in the majority of full sentences).
  - If the text is strongly mixed and you cannot clearly decide, use the language of the FIRST full sentence of the user text.
- Keep the same writing system (script) as in the user text:
  - If the user text is written in a Cyrillic alphabet, your "content" must also be in Cyrillic.
  - If the user text is written in a Latin alphabet, your "content" must also be in Latin.
- NEVER switch to English just because these instructions are in English.

ADDITIONAL RULES:
- Do not invent insights that are not present in the text.
- If the text does not provide enough information — return fewer insights.

Return ONE JSON object in the following format (no Markdown, no comments):

{
  "items": [
    {
      "kind": ${kinds},
      "topic": ${topics},
      "content": "Short description of the insight",
      "importance": 1 | 2 | 3 | 4 | 5
    }
  ]
}

Maximum ${maxLength} items in the "items" array.

Here is the user’s text for analysis:
"""${sliced}"""
      `.trim(),
    };

    const messages = [systemMsg];
    const model = normalizeAiModel(
      this.configService.get<AiModel>('AI_MODEL_FOR_MEMORY') ??
        AiModel.GPT_5_MINI,
    );
    const promptCacheOptions = getOpenAiPromptCacheOptions(model);

    const requestParams = {
      model,
      messages,
      store: false,
      max_completion_tokens: 10048,
      ...(promptCacheOptions
        ? { prompt_cache_options: promptCacheOptions }
        : {}),
    } as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming & {
      prompt_cache_options?: { mode: 'explicit' };
    };

    const resp = await this.openai.chat.completions.create(requestParams);

    const choice = resp.choices?.[0];
    const aiResp = resp.choices[0].message.content?.trim() ?? '';
    const finishReason = choice?.finish_reason ?? null;

    if (!aiResp) {
      return [];
    }

    let inputTokens: number;
    let cachedInputTokens = 0;
    let cacheWriteInputTokens = 0;
    let outputTokens: number;
    let estimated = false;

    if (
      resp.usage?.prompt_tokens != null &&
      resp.usage?.completion_tokens != null
    ) {
      inputTokens = resp.usage.prompt_tokens;
      cachedInputTokens = getCachedInputTokens(resp.usage);
      cacheWriteInputTokens = getCacheWriteInputTokens(resp.usage);
      outputTokens = resp.usage.completion_tokens;
      estimated = false;
    } else {
      const tkModel = this.mapToTiktokenModel(model);
      const enc = encoding_for_model(tkModel);

      outputTokens = enc.encode(aiResp).length;
      inputTokens = this.countOpenAiTokens(messages, model);

      estimated = true;
    }

    await this.persistAiUsage({
      userId,
      type: TokenType.USER_MEMORY,
      model,
      modelLabel: model,
      inputTokens,
      cachedInputTokens,
      cacheWriteInputTokens,
      outputTokens,
      finishReason,
      estimated,
      operation: 'extract_user_memory_legacy',
      cycleComplete: true,
    });

    let parsed: ExtractMemoryResponse;

    try {
      parsed = JSON.parse(aiResp) as ExtractMemoryResponse;

      if (!parsed || !Array.isArray(parsed.items)) {
        throwError(
          HttpStatus.INTERNAL_SERVER_ERROR,
          'Invalid memory response',
          'AI memory response has invalid format.',
          'INVALID_USER_MEMORY_RESPONSE',
        );
      }
    } catch (err) {
      this.aiErrorReporter?.report({
        operation: 'parse_user_memory_response',
        transport: 'background',
        error: err,
        userId,
        model,
      });
      throwError(
        HttpStatus.BAD_REQUEST,
        'Extract User Memory From Text failed',
        'Extract User Memory From Text.',
        'EXTRACT_USER_MEMORY_FROM_TEXT_FAILED',
        err,
      );
    }

    const items = parsed.items.filter((item) => this.isValidMemoryItem(item));

    for (const item of items) {
      if (item.importance < 1) item.importance = 1;
      if (item.importance > 5) item.importance = 5;
    }

    return items;
  }

  async extractAssistantMemoryFromText(
    userId: number,
    text: string,
    maxLongTerm: number = 10,
    maxCommitments: number = 10,
    maxTextChars: number = 20000,
  ): Promise<ExtractAssistantMemoryResponse> {
    const cleaned = text
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .trim();

    if (!cleaned) {
      return { assistant_long_term: [], assistant_commitments: [] };
    }

    const MAX_TEXT_CHARS = maxTextChars;
    const sliced =
      cleaned.length > MAX_TEXT_CHARS
        ? cleaned.slice(0, MAX_TEXT_CHARS)
        : cleaned;

    const topics =
      ' "self", "work", "study", "relationships", "family", "health", "mental_health", "sleep", "habits", "productivity", "money", "creativity", "lifestyle", "values", "goals", "other" ';

    const longTermKinds =
      ' "insight", "focus_area", "agreed_direction", "strategy", "style_rule", "meta", "other" ';

    const commitmentKinds =
      ' "promise", "ritual", "plan", "follow_up", "reminder", "monitoring", "style_rule", "other" ';

    const systemMsg = {
      role: 'system' as const,
      content: `
You help build long-term memory about the interaction between the AI assistant and the user for a personal AI-powered journal.

As input you receive ONE assistant (AI) message — its reply / comment / utterance in a dialog with the user.

Your task is to extract from THIS text TWO types of summaries:

1) "assistant_long_term" — the model’s long-term memory:
   - key conclusions or realizations that the assistant helped to reach;
   - important themes that the assistant suggests keeping as a long-term focus;
   - the overall direction of change that the assistant proposes as a course of action;
   - agreed working strategies (for example, working in small steps, first sleep then productivity);
   - stable interaction style rules (how the assistant responds specifically to this user).
   This is what will be useful to remember in future conversations so you don’t have to start from scratch.

2) "assistant_commitments" — the assistant’s promises and agreements:
   - everything the assistant EXPLICITLY promises to do in the future (regular summaries, reminders, support for specific goals);
   - rituals that the assistant proposes to make regular (weekly/monthly summaries, regular check-ins);
   - multi-step plans that the assistant proposes to carry out together;
   - agreements to return to a topic later (follow-up);
   - promises about reminders or tracking progress (monitoring, reminder);
   - important style rules (“not to pressure, but gently nudge”, etc.) if they are presented as obligations.

Important:
- Focus specifically on what the assistant DOES or PROMISES TO DO, as well as on shared long-term conclusions.
- If something sounds like both a style rule and a promise, classify it either as a long_term "style_rule" or as a commitment "style_rule", but not in both lists at the same time.
- Do NOT duplicate personal facts about the user — that belongs to a different memory.
- Do NOT invent anything that does not directly follow from the assistant’s reply text.

Formats:

assistant_long_term[].kind POSSIBLE VALUES:
${longTermKinds}

assistant_commitments[].kind POSSIBLE VALUES:
${commitmentKinds}

topic — one of the topics:
${topics}

importance — an integer from 1 to 5:
- 5 — a very important point that should strongly influence future replies.
- 4 — important and often useful.
- 3 — useful, but not critical.
- 1–2 — weak or local (if you are unsure — better not include it).

The "content" field is a short, concrete description (1–2 sentences) in the third person:
- Do not use "I", "you", "we".
- Do not use the words "User" or "Assistant" in the text itself.
- Do not start the sentence with "User ..." or "Assistant ...".
- Do not put a period at the end.
- Describe it neutrally, like a line from a dossier.

Examples for commitments:
  ❌ "I will summarize the dynamics every week"
  ✅ "Promised to summarize mood dynamics and important events every week"

  ❌ "We agreed that I will remind you about your goals"
  ✅ "Agreed to remind about progress on the main goal once a week"

Examples for long_term:
  ✅ "Together concluded that the main problem now is chronic exhaustion due to work"
  ✅ "Focuses on gradual changes instead of radical decisions"

LANGUAGE RULE (CRITICAL):
- You MUST write every "content" value in the SAME LANGUAGE as the user text you are analyzing.
- Do NOT translate the content into any other language.
- Do NOT mix several languages inside one "content" string.
- Ignore the language of these instructions and any examples: they are ONLY about the format and logic, not about the output language.
- Look at the user text and:
  - Identify the main language (the language used in the majority of full sentences).
  - If the text is strongly mixed and you cannot clearly decide, use the language of the FIRST full sentence of the user text.
- Keep the same writing system (script) as in the user text:
  - If the user text is written in a Cyrillic alphabet, your "content" must also be in Cyrillic.
  - If the user text is written in a Latin alphabet, your "content" must also be in Latin.
- NEVER switch to English just because these instructions are in English.

ADDITIONAL RULES:
- If this message contains no explicit promises — "assistant_commitments" may be empty.
- If there are no important long-term conclusions — "assistant_long_term" may be empty.
- It is better to return fewer, but higher-quality items.

Return ONE JSON object without Markdown:

{
  "assistant_long_term": [
    {
      "kind": ${longTermKinds},
      "topic": ${topics},
      "content": "Short description of the conclusion/focus/rule",
      "importance": 1 | 2 | 3 | 4 | 5
    }
  ],
  "assistant_commitments": [
    {
      "kind": ${commitmentKinds},
      "topic": ${topics},
      "content": "Short description of the promise/ritual/plan",
      "importance": 1 | 2 | 3 | 4 | 5
    }
  ]
}

Maximum ${maxLongTerm} items in "assistant_long_term"
and maximum ${maxCommitments} items in "assistant_commitments".

Here is the assistant’s reply text for analysis:
"""${sliced}"""
  `.trim(),
    };

    const messages = [systemMsg];
    const model = normalizeAiModel(
      this.configService.get<AiModel>('AI_MODEL_FOR_MEMORY') ||
        AiModel.GPT_5_MINI,
    );
    const promptCacheOptions = getOpenAiPromptCacheOptions(model);

    const requestParams = {
      model,
      messages,
      store: false,
      max_completion_tokens: 10048,
      ...(promptCacheOptions
        ? { prompt_cache_options: promptCacheOptions }
        : {}),
    } as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming & {
      prompt_cache_options?: { mode: 'explicit' };
    };

    const resp = await this.openai.chat.completions.create(requestParams);

    const choice = resp.choices?.[0];
    const aiResp = resp.choices[0].message.content?.trim() ?? '';
    const finishReason = choice?.finish_reason ?? null;

    if (!aiResp) {
      return { assistant_long_term: [], assistant_commitments: [] };
    }

    let inputTokens: number;
    let cachedInputTokens = 0;
    let cacheWriteInputTokens = 0;
    let outputTokens: number;
    let estimated = false;

    if (
      resp.usage?.prompt_tokens != null &&
      resp.usage?.completion_tokens != null
    ) {
      inputTokens = resp.usage.prompt_tokens;
      cachedInputTokens = getCachedInputTokens(resp.usage);
      cacheWriteInputTokens = getCacheWriteInputTokens(resp.usage);
      outputTokens = resp.usage.completion_tokens;
      estimated = false;
    } else {
      const tkModel = this.mapToTiktokenModel(model);
      const enc = encoding_for_model(tkModel);

      outputTokens = enc.encode(aiResp).length;
      inputTokens = this.countOpenAiTokens(messages, model);

      estimated = true;
    }

    await this.persistAiUsage({
      userId,
      type: TokenType.ASSISTANT_MEMORY,
      model,
      modelLabel: model,
      inputTokens,
      cachedInputTokens,
      cacheWriteInputTokens,
      outputTokens,
      finishReason,
      estimated,
      operation: 'extract_assistant_memory_legacy',
      cycleComplete: true,
    });

    let parsed: ExtractAssistantMemoryResponse;

    try {
      parsed = JSON.parse(aiResp) as ExtractAssistantMemoryResponse;

      if (
        !parsed ||
        !Array.isArray(parsed.assistant_long_term) ||
        !Array.isArray(parsed.assistant_commitments)
      ) {
        throwError(
          HttpStatus.INTERNAL_SERVER_ERROR,
          'Invalid assistant memory response',
          'AI assistant memory response has invalid format.',
          'INVALID_ASSISTANT_MEMORY_RESPONSE',
        );
      }
    } catch (err) {
      this.aiErrorReporter?.report({
        operation: 'parse_assistant_memory_response',
        transport: 'background',
        error: err,
        userId,
        model,
      });
      return { assistant_long_term: [], assistant_commitments: [] };
    }

    for (const item of parsed.assistant_long_term) {
      if (item.importance < 1) item.importance = 1;
      if (item.importance > 5) item.importance = 5;
    }
    for (const item of parsed.assistant_commitments) {
      if (item.importance < 1) item.importance = 1;
      if (item.importance > 5) item.importance = 5;
    }

    return parsed;
  }

  async extractUserMemoryCapsuleV2(
    userId: number,
    dto: ExtractUserMemoryCapsuleV2Dto,
  ): Promise<ExtractUserMemoryCapsuleV2Response> {
    const text = this.cleanMemoryCapsuleText(dto.text, dto.maxTextChars);
    if (!text) return this.emptyUserMemoryCapsuleV2();

    const [globalTagCatalog, outputLanguageRules] = await Promise.all([
      this.memoryTagCatalogV2Service.getGroupedCatalog(),
      this.buildMemoryCapsuleOutputRules(userId, text),
    ]);
    const globalCatalogTagKeys =
      this.getMemoryTagCatalogKeysV2(globalTagCatalog);
    const personalTagCatalog = this.normalizePersonalTagCatalogV2(
      dto.personalTagCatalog,
      globalCatalogTagKeys,
    );
    const catalogTagKeys = this.getMemoryTagCatalogKeysV2(
      globalTagCatalog,
      personalTagCatalog,
    );
    const structuredContext = dto.structuredContext
      ? JSON.stringify(dto.structuredContext).slice(0, 8000)
      : '';
    const userMemoryKinds =
      '"fact", "preference", "goal", "pattern", "value", "strength", "vulnerability", "trigger", "coping_strategy", "boundary", "meta", "other"';
    const userMemoryTopics =
      '"self", "work", "study", "relationships", "family", "health", "mental_health", "sleep", "habits", "productivity", "money", "creativity", "lifestyle", "values", "goals", "other"';

    const currentUserInput = this.formatCurrentMemoryCapsuleInput(
      dto.sourceType,
      text,
      dto.title,
    );
    const prompt = `
You are the memory indexer for a private AI journal. Analyze the CURRENT user
entry or check-in and return a compact, factual memory capsule used to retrieve
relevant past capsules. Do not answer the user.

SOURCE TYPE: ${dto.sourceType}
${structuredContext ? `STRUCTURED CHECK-IN DATA:\n${structuredContext}` : ''}

TAG RULES:
- Return 3-12 useful tags, never decorative tags.
- Tag keys are language-independent lowercase ASCII identifiers.
- Tag format is exactly one of:
  domain.<key>, entity.<key>, state.<key>, mechanism.<key>, thread.<key>
- First select precise tags from GLOBAL TAG CATALOG and PERSONAL TAG CATALOG.
  Reuse a catalog tag only when it describes the same subject precisely.
- If no catalog tag describes an important concept precisely, create a tag and
  return it both in tags and newTags. Never create a synonym of a catalog tag.
- domain is a broad life area; entity is a person/role/object; state is a
  current emotional or functional state; mechanism is a possible behavioral
  or thinking process; thread is a concrete ongoing situation.
- For a substantial text, normally include one accurate domain and at least
  one specific thread for its concrete project, situation, relationship or
  experiment. A record may have several thread tags when it genuinely belongs
  to several ongoing situations. Omit thread only when there is genuinely no
  ongoing situation.
- Prefer creating a precise new domain or thread over reusing an approximately
  related known tag. For example running/endurance is not strength training.
- A broad domain or a generic mechanism alone is not enough. Tags such as
  mechanism.environment_design or mechanism.load_management are allowed only
  when that mechanism is central to the text, and never replace subject tags.
- Threads identify the same continuing real-world situation, not merely two
  texts from the same broad topic.
- A new phase, deadline, decision, status update or outcome does not by itself
  create a new real-world situation. Do not replace a precisely matching
  established personal thread merely because its phase or status changed.
- If a narrower thread is genuinely useful, keep both the established thread
  and the narrower thread instead of dropping continuity with the established
  one.
- In PERSONAL TAG CATALOG, distinctRecordCount is the number of different
  parent entries/check-ins containing a thread; several dialogs under one
  parent still count as one record. associatedDomains lists domains observed
  with that thread. A thread seen in 2+ records is stronger continuity evidence
  than a provisional 0-1 record thread, but semantic precision always wins.
- Treat explicit continuation language such as "finally returned to", "opened
  the photos again", "continued", "these", or "still" as evidence for an
  existing personal thread when exactly one catalog thread is a strong subject
  match. Reuse that thread even when the current text does not repeat its full
  name. If several personal threads are plausibly the subject, do not guess.
- Before returning JSON, critically re-check all selected and proposed thread
  tags against knownThreads. Remove synonyms and phase-only replacements,
  restore any clearly matching established thread that was omitted, and keep
  multiple legitimate threads when the text belongs to more than one.
- Do not diagnose. Mechanisms and patterns are hypotheses.

GLOBAL TAG CATALOG:
${JSON.stringify(globalTagCatalog)}

PERSONAL TAG CATALOG:
${JSON.stringify(personalTagCatalog)}

USER DIGEST RULES:
- userDigest is one coherent, information-dense summary written as short
  sentences in the user's language. It is not a list of category fields.
- Preserve the parts that can make a future reflection genuinely personal:
  the situation, relevant concrete details, feelings or functional state,
  actions already tried, conclusions, decisions, intentions, important
  thoughts, unresolved questions and possible continuity with future events.
- Do not repeat the same idea under different wording. Remove storytelling
  padding, greetings, rhetorical transitions and details with no future use.
- Do not impose an arbitrary sentence count. Use as much text as needed to
  preserve the useful meaning, while making the digest materially shorter and
  denser than the current user text whenever the text is substantial.
- Do not diagnose and do not turn a single observation into a stable pattern.
- Do not invent information. Empty or test-like content should produce a very
  short factual digest.

LONG-TERM USER MEMORY RULES:
- Analyze the current user text and extract every DISTINCT long-term insight
  about the user that is directly supported by the text and may remain useful
  beyond this single entry.
- userMemory is not another summary of the entry. userDigest already performs
  that role. Each userMemory item must preserve one separate durable fact,
  preference, goal, pattern, value, strength, vulnerability, trigger, coping
  strategy, boundary or interaction instruction.
- Do not collapse several different long-term insights into one vague general
  statement merely because they share the same topic. Return each meaningful
  insight as a separate item.

Types of insights (the "kind" field). POSSIBLE VALUES:
${userMemoryKinds}

- "fact": a stable fact about the user: circumstances, role or persistent
  characteristic.
- "preference": preferences, style, what the user likes or dislikes,
  including preferred advice or communication format.
- "goal": long-term goals or directions of development.
- "pattern": a stable pattern of behavior or thinking. Use "pattern" ONLY
  when the text EXPLICITLY describes repetition with words such as always,
  constantly, every time, regularly or usually. If unsure, use "fact".
- "value": deep values and principles: what is truly important to the user.
- "strength": strengths, resources and sources of support.
- "vulnerability": explicitly experienced problems, difficulties, fears,
  anxieties, pain points, sensitivities, obstacles or recurring weak points.
- "trigger": situations or factors described as repeatedly provoking a
  strong emotional or behavioral reaction.
- "coping_strategy": recurring ways the user deals with stress or emotions,
  whether helpful or harmful.
- "boundary": boundaries the user wants to maintain in relationships, work,
  conversation topics or other areas.
- "meta": stable instructions for interaction with Nemory: how to respond or
  what to avoid.
- "other": an important durable insight that does not fit the categories.

The "topic" field is the main life area. POSSIBLE VALUES:
${userMemoryTopics}

The kind and topic fields are machine-readable enums. Return them exactly as
one of the lowercase English values above; never translate or transliterate
them. The output-language rule applies to human-readable prose fields only.

Use "other" only when the insight clearly fits no other topic.

The "importance" field is an integer from 1 to 5:
- 5: a key point that strongly characterizes the user and matters for most
  future replies.
- 4: very important and likely to influence future guidance.
- 3: useful to know, but not critical for every reply.
- 2: a weak or local insight.
- 1: an almost insignificant detail that should normally be omitted.

The "content" field is a short, concrete description of one insight in 1-2
sentences without unnecessary wording.

REQUIRED CONTENT RULES:
- Always describe the user, not their direct speech.
- Do not use first-person pronouns such as "I", "me", "my" or "we".
- Do not use the word "User" and do not begin with "The user".
- Formulate it neutrally, like one line from a personal dossier.
- Do not put a period at the end.

${outputLanguageRules}

ADDITIONAL USER MEMORY RULES:
- Do not invent insights that are absent from the text.
- Do not infer a stable trait from one isolated event.
- Before returning the JSON, compare every candidate across problems and
  userMemory. The same underlying fact, difficulty, episode or durable insight
  must appear only once in this extraction, even if it could be assigned two
  different kinds. Keep the most concrete, information-rich formulation.
- If a problem overlaps with a broader pattern or vulnerability about the
  same occurrence, keep the concrete problem and omit the redundant broader
  item. Keep separate items only when each adds distinct durable information.
  Recurrence across different dated entries is handled outside this request;
  never manufacture recurrence by duplicating one current occurrence.
- If the text contains many independently useful durable insights, return all
  of them. Do not reduce them to one "main idea" and do not target an
  artificially small number of items.
- If the text genuinely contains little durable information, returning only a
  few items or an empty array is correct.

EXPLICIT PROBLEM EXTRACTION (REQUIRED SEPARATE PASS):
- Independently from userMemory, inspect the current text for every explicitly
  stated or unambiguously demonstrated problem the user experienced: a
  difficulty, fear, anxiety, pain, conflict, exhaustion, obstacle, pressure,
  vulnerability, unresolved struggle or behavior that caused difficulty.
- Return each distinct supported problem in the separate "problems" array.
  This is a dated history, so a problem may be situational or appear only once.
- "Experienced" means the text says the problem actually happened or is
  happening to the user. Do not extract a hypothetical possibility, a general
  warning, a precaution, or something that merely could happen in the future.
- Put problems only in "problems" and do not repeat the same information in
  userMemory. The server will store every returned problem as a dated
  vulnerability item.
- Include the problem itself even when the user already solved it, improved it
  or described a coping strategy. A solution must not replace the difficulty
  that made the solution necessary.
- Also detect solved past problems when the sentence is framed around the
  solution, for example "this routine removed the chaotic decisions I used to
  make when hungry". Extract the actually experienced difficulty, not merely
  the successful solution.
- Phrase each problem contextually and factually, without turning it into a
  permanent personality trait or a diagnosis.
- NEVER invent a problem to fill the array. Do not infer one from a neutral
  activity, an ordinary emotion or missing information. If the current text
  contains no explicit or unambiguous problem, "problems" MUST be empty.
- If an explicit problem exists but only its goal, strength, conclusion or
  coping strategy is returned, the extraction is incomplete.

Return exactly one JSON object, without Markdown:
{
  "schemaVersion": 2,
  "tags": [{"key":"domain.work","type":"domain","confidence":0.9}],
  "newTags": [{"key":"thread.manager_conversation","type":"thread","label":"Conversation with manager","description":"The user's ongoing conversation with their manager","aliases":[]}],
  "importance": 1,
  "userDigest": "...",
  "problems": [{"topic":"work","content":"...","importance":4}],
  "userMemory": [{"kind":"goal","topic":"work","content":"...","importance":4}]
}

${currentUserInput}
    `.trim();

    const raw = await this.runMemoryCapsuleExtraction(
      userId,
      prompt,
      TokenType.USER_MEMORY,
      'extract_user_memory_capsule_v2',
      dto.timingTraceId,
      false,
    );
    const result = this.normalizeUserMemoryCapsuleV2(raw, catalogTagKeys);
    const threadContinuityWarnings = this.buildThreadContinuityWarningsV2(
      result,
      personalTagCatalog,
    );
    this.logThreadContinuityWarningsV2(
      dto.timingTraceId,
      threadContinuityWarnings,
    );
    if (process.env.NODE_ENV !== 'production') {
      scheduleServerDebugTask(() => {
        this.logger.log(
          JSON.stringify({
            marker: 'NEMORY_MEMORY_TAG_EXTRACTION_STATS',
            traceId: dto.timingTraceId ?? null,
            globalCatalogCounts: {
              domains: globalTagCatalog.domains.length,
              states: globalTagCatalog.states.length,
              mechanisms: globalTagCatalog.mechanisms.length,
              entities: globalTagCatalog.knownEntities.length,
              threads: globalTagCatalog.knownThreads.length,
            },
            personalCatalogCounts: {
              domains: personalTagCatalog.domains.length,
              states: personalTagCatalog.states.length,
              mechanisms: personalTagCatalog.mechanisms.length,
              entities: personalTagCatalog.knownEntities.length,
              threads: personalTagCatalog.knownThreads.length,
            },
            selectedTagsCount: result.tags.length,
            newTagsCount: result.newTags.length,
          }),
        );
      });
      writeFullServerDebugLog('NEMORY_MEMORY_TAG_EXTRACTION_DEBUG', {
        traceId: dto.timingTraceId ?? null,
        globalCatalogCounts: {
          domains: globalTagCatalog.domains.length,
          states: globalTagCatalog.states.length,
          mechanisms: globalTagCatalog.mechanisms.length,
          entities: globalTagCatalog.knownEntities.length,
          threads: globalTagCatalog.knownThreads.length,
        },
        personalCatalogCounts: {
          domains: personalTagCatalog.domains.length,
          states: personalTagCatalog.states.length,
          mechanisms: personalTagCatalog.mechanisms.length,
          entities: personalTagCatalog.knownEntities.length,
          threads: personalTagCatalog.knownThreads.length,
        },
        selectedTags: result.tags,
        newTags: result.newTags,
        threadContinuityWarnings,
      });
    }
    await this.memoryTagCatalogV2Service.markUsed(
      result.tags.map((tag) => tag.key),
    );
    return result;
  }

  async extractUserMemoryIndexV2(
    userId: number,
    dto: ExtractUserMemoryCapsuleV2Dto,
  ): Promise<ExtractUserMemoryIndexV2Response> {
    const text = this.cleanMemoryCapsuleText(dto.text, dto.maxTextChars);
    if (!text) {
      return {
        schemaVersion: 2,
        tags: [],
        newTags: [],
        importance: 1,
      };
    }

    const [globalTagCatalog, outputLanguageRules] = await Promise.all([
      this.memoryTagCatalogV2Service.getGroupedCatalog(),
      this.buildMemoryCapsuleOutputRules(userId, text),
    ]);
    const globalCatalogTagKeys =
      this.getMemoryTagCatalogKeysV2(globalTagCatalog);
    const personalTagCatalog = this.normalizePersonalTagCatalogV2(
      dto.personalTagCatalog,
      globalCatalogTagKeys,
    );
    const catalogTagKeys = this.getMemoryTagCatalogKeysV2(
      globalTagCatalog,
      personalTagCatalog,
    );
    const structuredContext = dto.structuredContext
      ? JSON.stringify(dto.structuredContext).slice(0, 8000)
      : '';
    const currentUserInput = this.formatCurrentMemoryCapsuleInput(
      dto.sourceType,
      text,
      dto.title,
    );
    const prompt = `
You are the retrieval indexer for a private AI journal. Analyze only the
CURRENT user entry or check-in. Return tags that let the application retrieve
the most relevant earlier capsules. Do not answer the user and do not summarize
the entry.

SOURCE TYPE: ${dto.sourceType}
${structuredContext ? `STRUCTURED CHECK-IN DATA:\n${structuredContext}` : ''}

TAG RULES:
- Return 3-12 useful tags, never decorative tags.
- Tag keys are language-independent lowercase ASCII identifiers.
- Tag format is exactly one of: domain.<key>, entity.<key>, state.<key>,
  mechanism.<key>, thread.<key>.
- First select precise tags from GLOBAL TAG CATALOG and PERSONAL TAG CATALOG.
  Reuse a catalog tag only when it describes the same subject precisely.
- If no catalog tag describes an important concept precisely, create a tag and
  return it both in tags and newTags. Never create a synonym of a catalog tag.
- domain is a broad life area; entity is a person, role or object; state is a
  current emotional or functional state; mechanism is a possible behavioral or
  thinking process; thread is a concrete ongoing situation.
- For a substantial text, normally include one accurate domain and at least
  one specific thread for its concrete project, situation, relationship or
  experiment. A record may have several thread tags when it genuinely belongs
  to several ongoing situations.
- A broad domain or generic mechanism alone is not enough. Mechanism tags never
  replace precise subject tags.
- Threads identify the same continuing real-world situation, not merely two
  texts from the same broad topic.
- A new phase, deadline, decision, status update or outcome does not by itself
  create a new real-world situation. Do not replace a precisely matching
  established personal thread merely because its phase or status changed.
- If a narrower thread is genuinely useful, keep both the established thread
  and the narrower thread instead of dropping continuity with the established
  one.
- In PERSONAL TAG CATALOG, distinctRecordCount is the number of different
  parent entries/check-ins containing a thread; several dialogs under one
  parent still count as one record. associatedDomains lists domains observed
  with that thread. A thread seen in 2+ records is stronger continuity evidence
  than a provisional 0-1 record thread, but semantic precision always wins.
- Treat explicit continuation language such as "finally returned to", "opened
  the photos again", "continued", "these", or "still" as evidence for an
  existing personal thread when exactly one catalog thread is a strong subject
  match. Reuse that thread even when the current text does not repeat its full
  name. If several personal threads are plausibly the subject, do not guess.
- Before returning JSON, critically re-check all selected and proposed thread
  tags against knownThreads. Remove synonyms and phase-only replacements,
  restore any clearly matching established thread that was omitted, and keep
  multiple legitimate threads when the text belongs to more than one.
- Do not diagnose. Mechanisms and patterns are hypotheses.

GLOBAL TAG CATALOG:
${JSON.stringify(globalTagCatalog)}

PERSONAL TAG CATALOG:
${JSON.stringify(personalTagCatalog)}

${outputLanguageRules}

Return exactly one JSON object, without Markdown:
{
  "schemaVersion": 2,
  "tags": [{"key":"domain.work","type":"domain","confidence":0.9}],
  "newTags": [{"key":"thread.manager_conversation","type":"thread","label":"Conversation with manager","description":"The user's ongoing conversation with their manager","aliases":[]}],
  "importance": 1
}

${currentUserInput}
    `.trim();

    const raw = await this.runMemoryCapsuleExtraction(
      userId,
      prompt,
      TokenType.USER_MEMORY,
      'extract_user_memory_index_v2',
      dto.timingTraceId,
      false,
    );
    const normalized = this.normalizeUserMemoryCapsuleV2(raw, catalogTagKeys);
    this.logThreadContinuityWarningsV2(
      dto.timingTraceId,
      this.buildThreadContinuityWarningsV2(normalized, personalTagCatalog),
    );
    await this.memoryTagCatalogV2Service.markUsed(
      normalized.tags.map((tag) => tag.key),
    );
    return {
      schemaVersion: 2,
      tags: normalized.tags,
      newTags: normalized.newTags,
      importance: normalized.importance,
    };
  }

  async extractUserMemoryDetailsV2(
    userId: number,
    dto: ExtractUserMemoryCapsuleV2Dto,
  ): Promise<ExtractUserMemoryDetailsV2Response> {
    const text = this.cleanMemoryCapsuleText(dto.text, dto.maxTextChars);
    if (!text) {
      return {
        schemaVersion: 2,
        importance: 1,
        userDigest: '',
        userMemory: [],
      };
    }

    const outputLanguageRules = await this.buildMemoryCapsuleOutputRules(
      userId,
      text,
    );
    const structuredContext = dto.structuredContext
      ? JSON.stringify(dto.structuredContext).slice(0, 8000)
      : '';
    const userMemoryKinds =
      '"fact", "preference", "goal", "pattern", "value", "strength", "vulnerability", "trigger", "coping_strategy", "boundary", "meta", "other"';
    const userMemoryTopics =
      '"self", "work", "study", "relationships", "family", "health", "mental_health", "sleep", "habits", "productivity", "money", "creativity", "lifestyle", "values", "goals", "other"';
    const currentUserInput = this.formatCurrentMemoryCapsuleInput(
      dto.sourceType,
      text,
      dto.title,
    );
    const prompt = `
You build the private long-term user memory for an AI journal. Analyze only the
CURRENT user entry or check-in. Do not answer the user. Do not generate tags.

SOURCE TYPE: ${dto.sourceType}
${structuredContext ? `STRUCTURED CHECK-IN DATA:\n${structuredContext}` : ''}

USER DIGEST RULES:
- userDigest is one coherent, information-dense summary written as short
  sentences in the user's language. It is not a list of category fields.
- Preserve the situation, relevant concrete details, feelings or functional
  state, actions already tried, conclusions, decisions, intentions, important
  thoughts, unresolved questions and continuity useful for future reflection.
- Remove storytelling padding and repeated ideas, but do not discard useful
  meaning. Aim for 300-500 characters for a substantive entry and never exceed
  600 characters. Short or simple content should produce a shorter digest.
- Do not diagnose, invent information or turn one observation into a stable
  pattern. Empty or test-like content should produce a very short digest.

LONG-TERM USER MEMORY RULES:
- Extract only DISTINCT durable insights directly supported by the current
  text that are likely to remain useful beyond this single entry.
- userMemory is not another summary. Each item preserves one separate durable
  fact, preference, goal, pattern, value, strength, vulnerability, trigger,
  coping strategy, boundary or interaction instruction.
- A pattern requires explicit repetition such as always, every time,
  regularly, usually or constantly. Otherwise use fact or vulnerability.
- Extract a dated vulnerability for an explicitly experienced significant
  problem only when it is likely to matter in a future reflection. Omit a
  transient inconvenience that is fully explained by this one event.
- Do not infer hypothetical problems, diagnoses or stable traits. If no
  durable information exists, return an empty userMemory array.
- Do not duplicate the same underlying fact or problem under different kinds.
  Keep separate items only when each adds distinct durable information.
- Across problems and userMemory together, return at most 5 high-quality
  items. Merge overlapping formulations and keep the most useful one.

Allowed kind values: ${userMemoryKinds}
Allowed topic values: ${userMemoryTopics}
- kind and topic are machine-readable enum fields. Return them exactly as one
  of the lowercase English values above; never translate or transliterate them.

Each content value is a short, concrete description in 1-2 sentences:
- describe the user, not their direct speech;
- do not use first-person pronouns or begin with "The user";
- use a neutral personal-dossier formulation;
- do not put a period at the end.

importance is an integer from 1 to 5. Omit weak local details that have no
future value, but do not artificially limit the number of distinct useful
items.

${outputLanguageRules}

Return exactly one JSON object, without Markdown:
{
  "schemaVersion": 2,
  "importance": 1,
  "userDigest": "...",
  "problems": [{"topic":"work","content":"...","importance":4}],
  "userMemory": [{"kind":"goal","topic":"work","content":"...","importance":4}]
}

${currentUserInput}
    `.trim();

    let rawProviderResponse = '';
    const raw = await this.runMemoryCapsuleExtraction(
      userId,
      prompt,
      TokenType.USER_MEMORY,
      'extract_user_memory_details_v2',
      dto.timingTraceId,
      false,
      {
        onParsedResponse: ({ content }) => {
          rawProviderResponse = content;
        },
      },
    );
    const normalized = this.normalizeUserMemoryCapsuleV2(raw);
    if (dto.timingTraceId) {
      logServerMemoryReview({
        step: 1,
        title: 'ДІАГНОСТИКА EXTRACT_USER_MEMORY_DETAILS_V2',
        sourceType: dto.sourceType,
        traceId: dto.timingTraceId,
        userId,
        sections: [
          {
            label: 'СИРИЙ JSON ПРОВАЙДЕРА · EXTRACT_USER_MEMORY_DETAILS_V2',
            value: {
              providerText: rawProviderResponse,
              parsedJson: raw,
            },
            excludeFromUsage: true,
          },
          {
            label: 'ДІАГНОСТИКА НОРМАЛІЗАЦІЇ · USER MEMORY',
            value: this.buildUserMemoryNormalizationDiagnostics(
              raw,
              normalized.userMemory.length,
            ),
            excludeFromUsage: true,
          },
        ],
      });
    }
    return {
      schemaVersion: 2,
      importance: normalized.importance,
      userDigest: normalized.userDigest,
      userMemory: normalized.userMemory,
    };
  }

  async extractAssistantMemoryCapsuleV2(
    userId: number,
    dto: ExtractAssistantMemoryCapsuleV2Dto,
  ): Promise<ExtractAssistantMemoryCapsuleV2Response> {
    const text = this.cleanMemoryCapsuleText(dto.text, dto.maxTextChars);
    if (!text) return this.emptyAssistantMemoryCapsuleV2();

    const activeCommitments = dto.activeCommitments ?? [];
    const currentUserText = dto.userText
      ? this.cleanMemoryCapsuleText(dto.userText, dto.maxTextChars)
      : '';
    const outputLanguageRules = await this.buildMemoryCapsuleOutputRules(
      userId,
      text,
    );
    const topics =
      '"self", "work", "study", "relationships", "family", "health", "mental_health", "sleep", "habits", "productivity", "money", "creativity", "lifestyle", "values", "goals", "other"';
    const assistantMemoryKinds =
      '"insight", "focus_area", "agreed_direction", "strategy", "style_rule", "meta", "other"';
    const commitmentKinds =
      '"promise", "ritual", "plan", "follow_up", "reminder", "monitoring", "style_rule", "other"';
    const sourceType: MemoryCapsuleSourceType = dto.sourceType ?? 'entry';
    const prompt = `
You build Nemory's long-term memory about its interaction with the user and
manage Nemory's explicit promises and ongoing agreements in a private
AI-powered journal.

SOURCE TYPE: ${sourceType}

As input you receive ONE assistant (AI) message - its reply, comment or
utterance in a dialog with the user.

Extract ONLY:

0) assistantMemory - Nemory's long-term memory from this response:
- key conclusions or realizations that Nemory helped to reach;
- important themes that Nemory suggests keeping as a long-term focus;
- the overall direction of change that Nemory proposes as a course of action;
- agreed working strategies, for example working in small steps or restoring
  sleep before pushing productivity;
- stable interaction style rules that should influence how Nemory responds to
  this user in the future.

This is not a summary or retelling of the whole response. Extract only durable
conclusions, focus areas, agreed directions, strategies and interaction rules
that will be useful when a future RELEVANT entry is selected. Omit greetings,
validation, jokes, examples, rhetorical flourishes and closing slogans.
Do not store an item merely because the response repeats something already
present in the supplied context. Store it only when this response adds new
evidence, materially refines it, turns it into an agreed working strategy or
changes the prior direction.

1) New explicit promises and agreements made by Nemory:
- everything the assistant EXPLICITLY promises to do in the future;
- include an explicit future personalized obligation initiated by Nemory
  itself, even when the user did not ask for it first;
- rituals that the assistant proposes to make regular;
- multi-step plans that the assistant proposes to carry out together;
- agreements to return to a topic later;
- promises about reminders or tracking progress;
- important style rules if they are presented as obligations.

2) Updates to promises that were made earlier:
- if the current user text explicitly asks to stop a reminder, ritual,
  monitoring or another promise, emit a promise_update with status cancelled;
- use fulfilled only when a one_time promise is actually performed in this
  response;
- one occurrence of an ongoing promise does not close it;
- ongoing promises do not expire automatically;
- use the exact promiseKey from ACTIVE PROMISES.

3) Exact scheduled reminders:
- scheduledReminders are separate from conversational promises. Add one only
  when the user explicitly requests a notification at a concrete date, time,
  or both and Nemory accepts it, or when Nemory unconditionally undertakes that
  exact scheduled reminder in this response. A conditional offer is not enough.
- Resolve relative expressions such as "tomorrow" from CURRENT LOCAL DATE AND
  TIME below. A date without a time means 09:00 local time. A time without a
  date means today when still in the future, otherwise tomorrow.
- Do not schedule vague requests such as "later", "sometime" or "next time".
  Those may remain ordinary commitments instead.
- Do not create recurring reminders in this version.
- Do not duplicate an exact scheduled reminder as an ordinary commitment
  unless the exchange also creates a distinct ongoing future obligation.
- scheduledReminderUpdates cancels an exact reminder only when the user
  explicitly asks to cancel it. Use the stable reminderKey of that reminder.

MANDATORY ACCEPTED-REQUEST RULE:
- Read CURRENT USER TEXT together with the assistant response before deciding
  whether a commitment exists.
- When the user explicitly asks Nemory to remind, ask, revisit, monitor,
  summarize or otherwise do something in a future interaction, and the
  assistant accepts that request (for example: "agreed", "I will remind",
  "I will ask", "we will return to it"), this IS an explicit Nemory promise.
- In that case commitments MUST contain an ongoing promise, even when the
  assistant response is short and mostly confirms the user's wording.
- Do not weaken an accepted reminder into a generic observation, interaction
  preference or user-memory fact.
- Example: user asks "When we discuss overload again, remind me to check
  whether my walks are still in the week" and Nemory replies "Agreed, I will
  remind you". Return an ongoing reminder commitment triggered by overload;
  returning an empty commitments array is incorrect.

Important:
- Extract only what Nemory explicitly undertakes to do later. Advice,
  explanations, insights, observations about the user and suggested actions
  for the user are NOT promises.
- Do not treat Nemory's ordinary product behavior or a generic description of
  its capabilities as a personal promise. Phrases such as "I can help you
  reflect", "I will analyze your entries", "we can explore this together" or
  "I am here to support you" are baseline behavior and MUST be omitted unless
  the response creates a concrete future agreement with this particular user.
- A promise must create a future personalized obligation that can later be
  fulfilled, cancelled or checked. If there is no such obligation, do not emit
  a commitment.
- A routine, protocol, exercise, plan or next step that the USER should perform
  is advice, not Nemory's promise, even if Nemory proposes doing it regularly
  or says "let's". The promised future action must be performed by Nemory
  itself (for example: remind, ask, revisit, monitor or summarize for the user).
- Do NOT duplicate personal facts about the user.
- Do NOT invent anything that does not directly follow from the assistant's
  response text.
- Do not duplicate an already active promise.

assistantMemory[].kind possible values:
${assistantMemoryKinds}

promiseKind possible values for an item with kind "promise":
${commitmentKinds}

topic - one of:
${topics}

importance - an integer from 1 to 5:
- 5 - should strongly influence future replies;
- 4 - important and often useful;
- 3 - useful but not critical;
- 1-2 - weak or local; omit it when uncertain.

The "content" field is a short, concrete description in 1-2 sentences:
- Do not use "I", "you" or "we".
- Do not use the words "User" or "Assistant" in the content itself.
- Do not start the sentence with "User ..." or "Assistant ...".
- Do not put a period at the end.
- Describe it neutrally, like a line from a dossier.

Examples for promise items:
- Bad: "I will summarize the dynamics every week"
- Good: "Promised to summarize mood dynamics and important events every week"

${outputLanguageRules}

ADDITIONAL RULES:
- If there are no important durable conclusions, return an empty
  assistantMemory array.
- Return at most 5 high-quality assistantMemory items.
- If there are no explicit new promises, return an empty commitments array.
- If no active promise changes state, return an empty commitmentUpdates array.
- It is better to return fewer, higher-quality items.
- Promises are ongoing by default. Use duration one_time only for one explicit
  action that should close after it is performed once. Reminders, rituals,
  monitoring, interaction rules and support of an ongoing goal are ongoing.

Promise keys must be stable lowercase ASCII identifiers. triggerTags use
normalized keys such as domain.work, entity.manager or
thread.manager_conversation.

ACTIVE COMMITMENTS:
${activeCommitments.length ? JSON.stringify(activeCommitments) : '[]'}

CURRENT USER TEXT FOR COMMITMENT DECISIONS AND UPDATES:
${currentUserText ? `"""${currentUserText}"""` : '(not provided)'}

CURRENT LOCAL DATE: ${dto.currentLocalDate ?? '(not provided)'}
CURRENT LOCAL TIME: ${dto.currentLocalTime ?? '(not provided)'}
TIMEZONE: ${dto.timezone ?? '(not provided)'}
ACTIVE EXACT REMINDERS:
${JSON.stringify(dto.activeScheduledReminders ?? [])}

Return exactly one JSON object, without Markdown:
{
  "schemaVersion": 2,
  "assistantMemory": [
    {"kind":"strategy","topic":"work","content":"Focuses on checking available capacity before accepting additional work","importance":4}
  ],
  "commitments": [
    {"kind":"promise","promiseKey":"follow_up.example","promiseKind":"follow_up","topic":"work","content":"...","importance":4,"duration":"ongoing","status":"open","triggerTags":[]}
  ],
  "commitmentUpdates": [
    {"kind":"promise_update","promiseKey":"follow_up.example","status":"cancelled","content":"..."}
  ],
  "scheduledReminders": [
    {"reminderKey":"reminder.presentation","text":"Prepare for the presentation","localDate":"2026-08-10","localTime":"09:00"}
  ],
  "scheduledReminderUpdates": [
    {"reminderKey":"reminder.presentation","status":"cancelled"}
  ]
}

ASSISTANT RESPONSE:
"""${text}"""
    `.trim();

    const raw = await this.runMemoryCapsuleExtraction(
      userId,
      prompt,
      TokenType.ASSISTANT_MEMORY,
      'extract_assistant_memory_capsule_v2',
      dto.timingTraceId,
      false,
    );
    let normalized = this.normalizeAssistantMemoryCapsuleV2(raw);
    if (
      normalized.commitments.length === 0 &&
      this.looksLikeFutureNemoryCommitment(currentUserText, text)
    ) {
      try {
        const repairedCommitment = await this.repairMissingCommitmentV2({
          userId,
          userText: currentUserText,
          assistantText: text,
          activeCommitments,
          timingTraceId: dto.timingTraceId,
          operation: 'repair_missing_assistant_commitment_v2',
          outputLanguageRules,
        });
        if (repairedCommitment) {
          normalized = {
            ...normalized,
            commitments: [repairedCommitment],
          };
        }
      } catch (error) {
        this.logger.warn(
          `repair_missing_assistant_commitment_v2 failed after the primary assistant capsule was extracted: ${error instanceof Error ? error.message : String(error)}`,
        );
        this.completeAiPromptUsageCycle(
          dto.timingTraceId,
          'extract_assistant_memory_capsule_v2',
        );
      }
    } else {
      this.completeAiPromptUsageCycle(
        dto.timingTraceId,
        'extract_assistant_memory_capsule_v2',
      );
    }
    const activeByKey = new Map(
      activeCommitments.map((item) => [item.key, item] as const),
    );
    return {
      ...normalized,
      commitments: normalized.commitments.filter(
        (item) => !activeByKey.has(item.promiseKey),
      ),
      commitmentUpdates: normalized.commitmentUpdates.filter((item) => {
        const active = activeByKey.get(item.promiseKey);
        if (!active) return false;
        const duration = active.duration ?? 'ongoing';
        return !(
          duration === 'ongoing' &&
          (item.status === 'fulfilled' || item.status === 'expired')
        );
      }),
    };
  }

  async previewUserMemoryConsolidationV2(
    userId: number,
    dto: PreviewUserMemoryConsolidationV2Dto,
  ): Promise<PreviewUserMemoryConsolidationV2Response> {
    const items = dto.items.filter((item) => item.memoryState !== 'superseded');
    const similarOnly = dto.similarOnly === true;
    const targetReductionPercent = similarOnly
      ? 0
      : this.clampNumber(dto.targetReductionPercent, 10, 80, 30);
    const targetOutputCount =
      items.length === 0
        ? 0
        : Math.max(
            1,
            Math.floor(items.length * (1 - targetReductionPercent / 100)),
          );
    if (items.length < 2) {
      return {
        schemaVersion: 2,
        previewOnly: true,
        inputCount: items.length,
        targetReductionPercent,
        targetOutputCount,
        resultOutputCount: items.length,
        achievedReductionCount: 0,
        achievedReductionPercent: 0,
        targetReached: items.length <= targetOutputCount,
        groups: [],
        ungroupedMemoryIds: items.map((item) => item.id),
      };
    }
    const requiredReductionCount = items.length - targetOutputCount;
    const promptItems = items.map((item) => {
      const base = {
        id: item.id,
        kind: item.kind,
        topic: item.topic,
        content: item.content,
        importance: item.importance,
        sourceType: item.sourceType,
        ...(item.sourceId ? { sourceId: item.sourceId } : {}),
        createdAt: item.createdAt,
      };
      if (item.memoryForm !== 'consolidated') return base;

      return {
        ...base,
        memoryForm: 'consolidated' as const,
        firstSeenAt: item.firstSeenAt ?? item.createdAt,
        lastSeenAt: item.lastSeenAt ?? item.createdAt,
        occurrenceCount: Math.max(1, item.occurrenceCount ?? 1),
        evidenceCount: Math.max(
          1,
          item.evidenceCount ?? item.occurrenceCount ?? 1,
        ),
      };
    });

    const outputLanguageRules = await this.buildMemoryCapsuleOutputRules(
      userId,
      items.map((item) => item.content).join('\n'),
    );
    const consolidationGoal = similarOnly
      ? `
GOAL:
- Find only memory items that describe the same real episode or a clearly
  repeated pattern supported by distinct episodes.
- Do not aim for a reduction percentage. Returning no groups is correct when
  there is not enough evidence for a safe merge.
- Never create broad thematic summaries merely because items share a topic.

ALLOWED COMPRESSION MODES:
1. "same_episode": duplicate or overlapping descriptions of the same real-world
   episode. Multiple mentions are evidence of one episode, not recurrence.
2. "repeated_pattern": distinct episodes that reliably demonstrate the same
   recurring reaction, goal, preference, vulnerability, trigger, strategy,
   value or boundary.
`
      : `
GOAL:
- Reduce ${items.length} input memories by approximately ${targetReductionPercent}%:
  replace them with about ${targetOutputCount} output memories, which requires
  removing at least ${requiredReductionCount} items through consolidation.
- Reach the target in priority order. First remove duplicate descriptions and
  descriptions of the same real episode. Then consolidate distinct repetitions
  into patterns. Only then create broader thematic summaries until the target
  is reached.
- Every resulting item must remain useful in future personalized reflections.

COMPRESSION MODES, IN THIS EXACT PRIORITY ORDER:
1. "same_episode": duplicate or overlapping descriptions of the same real-world
   episode. Multiple mentions are evidence of one episode, not recurrence.
2. "repeated_pattern": distinct episodes that reliably demonstrate the same
   recurring reaction, goal, preference, vulnerability, trigger, strategy,
   value or boundary.
3. "thematic_summary": related but non-duplicate memories that can be replaced
   by one compact general summary without losing their important meaning. It may
   use several short sentences when one sentence would erase meaningful detail.
`;
    const targetRules = similarOnly
      ? `- Return only high-confidence groups. When in doubt, leave the memories separate.`
      : `- List groups in compression-mode priority order. Stop when the requested output
  count is reached or exceeded by the smallest unavoidable group. Do not compress
  beyond the target merely because more groups are possible.
- If the exact target cannot be reached without material information loss,
  return the closest safe plan rather than inventing or deleting information.`;

    const prompt = `
You consolidate a user's dated long-term memory in a private AI journal.

The input is a JSON array of existing memory items. Build a read-only
consolidation plan; never claim that data was changed or saved.

${consolidationGoal}

STRICT RULES:
- A group must contain at least two different source IDs.
- Use an input ID at most once across all groups. Never invent an ID.
- Prefer groups with the greatest safe reduction, but never group memories only
  because they share a broad topic.
- For thematic_summary, preserve the concrete facts that distinguish its
  sources inside a compact coherent summary. Do not flatten contradictions,
  changes over time, different people, or unrelated situations into one claim.
- Do not turn several mentions of one episode into a repeated pattern. Set
  occurrenceCount to the estimated number of distinct real-world episodes, not
  the number of source rows. For same_episode this is normally 1.
- Generalized memory must remain durable. Keep temporary deadlines and dated
  episode details only when they remain necessary to understand the memory.
- The consolidated content must be factual, compact and no broader than its
  sources. Do not diagnose, speculate or add advice.
- Keep the most appropriate existing kind and topic. Importance is an integer
  from 1 to 5. Confidence is from 0 to 1.
- Rationale briefly explains why these exact items can safely be merged.
${targetRules}

${outputLanguageRules}

Return exactly one JSON object without Markdown:
{
  "groups": [
    {
      "sourceMemoryIds": ["id-1", "id-2"],
      "compressionMode": "repeated_pattern",
      "kind": "pattern",
      "topic": "work",
      "content": "...",
      "importance": 4,
      "occurrenceCount": 2,
      "confidence": 0.9,
      "rationale": "..."
    }
  ]
}

MEMORY ITEMS:
${JSON.stringify(promptItems)}
    `.trim();

    const raw = await this.runMemoryCapsuleExtraction(
      userId,
      prompt,
      TokenType.USER_MEMORY,
      similarOnly
        ? 'consolidate_similar_user_memory_v2'
        : 'preview_user_memory_consolidation_v2',
      dto.timingTraceId,
      true,
    );
    const normalized = this.normalizeUserMemoryConsolidationPreview(
      raw,
      items,
      targetReductionPercent,
      similarOnly,
    );
    if (dto.timingTraceId) {
      logServerMemoryReview({
        step: 4,
        title: 'BACKGROUND USER MEMORY CONSOLIDATION',
        sourceType: 'consolidation',
        traceId: dto.timingTraceId,
        userId,
        sections: [
          {
            label: 'TRIGGER AND PARENT CYCLE',
            value: {
              triggerSourceType: dto.triggerSourceType ?? null,
              triggerSourceId: dto.triggerSourceId ?? null,
              parentTimingTraceId: dto.parentTimingTraceId ?? null,
            },
            excludeFromUsage: true,
          },
          {
            label: 'CONSOLIDATION RESULT',
            value: normalized,
            excludeFromUsage: true,
          },
        ],
      });
    }
    return normalized;
  }

  async extractDialogMemoryCapsuleV2(
    userId: number,
    dto: ExtractDialogMemoryCapsuleV2Dto,
  ): Promise<ExtractDialogMemoryCapsuleV2Response> {
    const userText = this.cleanMemoryCapsuleText(
      dto.userText,
      dto.maxTextChars,
    );
    const assistantText = this.cleanMemoryCapsuleText(
      dto.assistantText,
      dto.maxTextChars,
    );
    if (!userText || !assistantText) {
      return this.emptyDialogMemoryCapsuleV2(userText);
    }

    const [globalTagCatalog, outputLanguageRules] = await Promise.all([
      this.memoryTagCatalogV2Service.getGroupedCatalog(),
      this.buildMemoryCapsuleOutputRules(userId, assistantText),
    ]);
    const globalCatalogTagKeys =
      this.getMemoryTagCatalogKeysV2(globalTagCatalog);
    const personalTagCatalog = this.normalizePersonalTagCatalogV2(
      dto.personalTagCatalog,
      globalCatalogTagKeys,
    );
    const catalogTagKeys = this.getMemoryTagCatalogKeysV2(
      globalTagCatalog,
      personalTagCatalog,
    );
    const activeCommitments = dto.activeCommitments ?? [];
    const userMemoryKinds =
      '"fact", "preference", "goal", "pattern", "value", "strength", "vulnerability", "trigger", "coping_strategy", "boundary", "meta", "other"';
    const userMemoryTopics =
      '"self", "work", "study", "relationships", "family", "health", "mental_health", "sleep", "habits", "productivity", "money", "creativity", "lifestyle", "values", "goals", "other"';
    const assistantMemoryKinds =
      '"insight", "focus_area", "agreed_direction", "strategy", "style_rule", "meta", "other"';
    const commitmentKinds =
      '"promise", "ritual", "plan", "follow_up", "reminder", "monitoring", "style_rule", "other"';

    const staticPrompt = `
You create memory for ONE completed turn of a private AI-journal dialog. The
turn consists of the user's message and Nemory's response. Do not answer the
user. Return only the requested JSON.

SOURCE TYPE: dialog

USER CAPSULE:
- If the user message contains a meaningful episode, fact, emotion, problem,
  decision, intention, constraint or clarification, set representation to
  "digest" and write an information-dense summary in the user's language.
- If it is already short, elliptical or reference-dependent (for example
  "What should I do?", "Why?", "Explain", "Yes"), set representation to
  "verbatim" and preserve the complete original message without paraphrasing.
- The capsule text must retain the meaning needed to understand Nemory's
  response later. Do not diagnose or invent continuity.

TAGS:
- Return 0-12 useful language-independent tags for meaningful subjects in the
  user message. Keys must use domain.*, entity.*, state.*, mechanism.* or
  thread.*. Prefer exact catalog tags; create newTags only when no precise tag
  exists. A short reference-only question may have no tags.
- A meaningful message may have several thread tags when it genuinely belongs
  to several ongoing situations. A new phase, deadline, decision, status or
  outcome does not by itself replace an established matching thread. If a
  narrower thread is useful, keep it together with the established thread.
- PERSONAL TAG CATALOG provides distinctRecordCount (different parent records,
  not dialog count) and associatedDomains for personal threads. Treat 2+
  records as stronger continuity evidence, while still requiring a precise
  semantic match. Before returning JSON, remove synonyms and phase-only thread
  replacements and restore any clearly matching established thread omitted by
  the first pass.
- When the current user message explicitly describes situational bodily
  arousal that clearly signals anxiety or fear (for example trembling hands
  before a presentation, cold palms during a feared conversation, a racing
  heart while anticipating a stressful event), include state.anxiety when it
  exists in the catalog. Do not infer anxiety from an isolated physical
  symptom when the message gives no anxious or fearful situation.
- A new tag must include key, type, label, description and aliases.
- STRICT SOURCE RULE: infer tags and newTags exclusively from CURRENT USER
  MESSAGE. Never add a tag for a technique, interpretation, subject or entity
  introduced only by NEMORY RESPONSE. For example, when Nemory recommends
  breathing but the user did not mention breathing, do not return a breathing
  tag. The response is available only for assistant memory, summaries and
  promises, not for user tags.

- GLOBAL TAG CATALOG and PERSONAL TAG CATALOG are supplied in DYNAMIC INPUT.

LONG-TERM USER MEMORY:
- Extract only new durable information directly supported by THIS user
  message: stable facts, preferences, goals, explicit repeated patterns,
  values, strengths, experienced problems or vulnerabilities, triggers,
  coping strategies, boundaries and interaction instructions.
- A meaningful dated problem may be returned as vulnerability even if it
  happened once, but do not call it a stable pattern unless repetition is
  explicit. Do not extract empty questions such as "What should I do?".
- Each item has kind (${userMemoryKinds}), topic (${userMemoryTopics}),
  content and importance 1-5. Write content in the user's language, neutrally,
  without "User", first-person pronouns or an ending period.
- A request about what Nemory itself should do in a future interaction is not
  long-term user memory when Nemory accepts it. It belongs only in PROMISES.
  Do not store accepted requests such as "remind me when we discuss overload"
  as kind meta, preference, goal or any other userMemory item.

ASSISTANT CAPSULE:
- assistantMemory is Nemory's long-term memory extracted from THIS response.
  It contains only durable conclusions or realizations Nemory helped to reach,
  important long-term focus areas, agreed directions of change, working
  strategies and stable interaction rules that may improve later turns of
  THIS dialog and a future RELEVANT response.
- assistantMemory is not a summary or retelling of the response. Omit
  greetings, validation, jokes, examples, rhetorical padding, ordinary advice
  that is generic and interchangeable between users, and observations that
  merely restate the user's message. Do not invent anything absent from
  Nemory's response.
MANDATORY DURABLE-STRATEGY RULE:
- When Nemory gives a concrete workflow, ordered sequence, decision rule,
  bounded experiment, review criterion or next-step plan that advances the
  current subject, assistantMemory MUST contain the useful strategy. This is
  true even when the user message is short, the action can start immediately,
  or the strategy is relevant mainly to a future continuation of this dialog
  or another response about the same subject.
- A response that narrows an earlier broad direction into a new executable
  method is new durable memory. Compress it into the smallest set of items
  that preserves what was actually recommended; do not return an empty array
  merely because the recommendation is practical or situational.
- Example: if Nemory recommends ordering 12 photos, identifying duplicates,
  and writing one sentence for the first three, store that concrete workflow
  as a strategy. In contrast, generic phrases such as "take a small step" or
  "think about what matters" do not create assistantMemory by themselves.
- Each assistantMemory item has kind (${assistantMemoryKinds}), topic
  (${userMemoryTopics}), content and importance 1-5. Content is a short,
  concrete neutral description in 1-2 sentences, without first-person
  pronouns, the words "User" or "Assistant", or an ending period.
- Return every independently useful durable item, but prefer quality over
  quantity. Return an empty array when the response contains no durable Nemory
  memory, and never return more than 10 items.

- Follow the OUTPUT LANGUAGE RULES supplied in DYNAMIC INPUT.

PROMISES:
- Extract only concrete future personalized obligations undertaken by Nemory
  itself: reminders, follow-ups, monitoring, recurring rituals or explicit
  agreements to revisit something. Advice or tasks for the user are not
  promises, even when phrased as "let's".
MANDATORY ACCEPTED-REQUEST RULE:
- Evaluate the user message and Nemory response as one exchange. If the user
  explicitly asks Nemory to remind, ask, revisit, monitor, summarize or do
  another action later, and Nemory accepts (for example: "agreed", "I will
  remind", "I will ask", "we will return to it"), commitments MUST contain an
  ongoing promise. The request may be written mainly in the user message; the
  accepting response makes it Nemory's obligation.
- Example: user asks "When we discuss overload again, remind me to check
  whether my walks are still in the week" and Nemory replies "Agreed, I will
  remind you". Return an ongoing reminder commitment with overload-related
  triggerTags. Returning an empty commitments array or putting this agreement
  into userMemory is incorrect.
- Do not duplicate an active promise. Use exact active promiseKey for updates.
- Cancel a promise only when the current user message explicitly asks to stop
  it. Fulfil only a one-time promise actually performed in this response.
  Ongoing promises remain open after one occurrence.
- promiseKind is one of ${commitmentKinds}. Promise keys are stable lowercase
  ASCII identifiers. Human-readable content follows the response language.

EXACT SCHEDULED REMINDERS:
- scheduledReminders are separate from conversational promises. Add one only
  when the user explicitly requests a notification at a concrete date, time,
  or both, and Nemory accepts the request in this response.
- Resolve relative expressions from CURRENT LOCAL DATE AND TIME. A date without
  a time means 09:00 local time. A time without a date means today if still in
  the future, otherwise tomorrow. Omit vague or recurring requests.
- scheduledReminderUpdates contains a cancellation only when the user
  explicitly cancels a previously scheduled exact reminder.
- Do not duplicate an exact scheduled reminder as an ordinary commitment
  unless the exchange also creates a distinct ongoing future obligation.

- ACTIVE COMMITMENTS, current local date/time, timezone and ACTIVE EXACT
  REMINDERS are supplied in DYNAMIC INPUT.

Return exactly:
{
  "schemaVersion": 2,
  "user": {
    "representation": "digest",
    "text": "...",
    "tags": [{"key":"domain.work","type":"domain","confidence":0.9}],
    "newTags": [],
    "importance": 3,
    "problems": [],
    "userMemory": [{"kind":"fact","topic":"work","content":"...","importance":3}]
  },
  "assistant": {
    "assistantMemory": [
      {"kind":"strategy","topic":"work","content":"Checks available capacity before accepting additional work","importance":4}
    ]
  },
  "commitments": [
    {"kind":"promise","promiseKey":"follow_up.example","promiseKind":"follow_up","topic":"work","content":"...","importance":4,"duration":"ongoing","status":"open","triggerTags":[]}
  ],
  "commitmentUpdates": []
  ,"scheduledReminders": [
    {"reminderKey":"reminder.presentation","text":"Prepare for the presentation","localDate":"2026-08-10","localTime":"09:00"}
  ],
  "scheduledReminderUpdates": []
}
    `.trim();

    const dynamicPrompt = `
DYNAMIC INPUT FOR THIS DIALOG TURN

OUTPUT LANGUAGE RULES:
${outputLanguageRules}

GLOBAL TAG CATALOG:
${JSON.stringify(globalTagCatalog)}

PERSONAL TAG CATALOG:
${JSON.stringify(personalTagCatalog)}

ACTIVE COMMITMENTS:
${activeCommitments.length ? JSON.stringify(activeCommitments) : '[]'}

CURRENT LOCAL DATE: ${dto.currentLocalDate ?? '(not provided)'}
CURRENT LOCAL TIME: ${dto.currentLocalTime ?? '(not provided)'}
TIMEZONE: ${dto.timezone ?? '(not provided)'}
ACTIVE EXACT REMINDERS:
${JSON.stringify(dto.activeScheduledReminders ?? [])}

CURRENT USER MESSAGE:
"""${userText}"""

NEMORY RESPONSE:
"""${assistantText}"""
    `.trim();

    let rawProviderResponse = '';
    const raw = await this.runMemoryCapsuleExtraction(
      userId,
      { staticPrompt, dynamicPrompt },
      TokenType.ASSISTANT_MEMORY,
      'extract_dialog_memory_capsule_v2',
      dto.timingTraceId,
      false,
      {
        sourceType: dto.sourceType ?? 'dialog',
        cacheStaticPrefix: true,
        onParsedResponse: ({ content }) => {
          rawProviderResponse = content;
        },
      },
    );
    let normalized = this.normalizeDialogMemoryCapsuleV2(
      raw,
      userText,
      catalogTagKeys,
    );
    const threadContinuityWarnings = this.buildThreadContinuityWarningsV2(
      normalized.user,
      personalTagCatalog,
    );
    this.logThreadContinuityWarningsV2(
      dto.timingTraceId,
      threadContinuityWarnings,
    );
    if (dto.timingTraceId) {
      logServerMemoryReview({
        step: 1,
        title: 'ЩО МОДЕЛЬ ВИТЯГЛА З ХОДУ ДІАЛОГУ',
        sourceType: dto.reviewSourceType ?? 'dialog',
        traceId: dto.timingTraceId,
        userId,
        sections: [
          {
            label: 'СИРИЙ JSON ПРОВАЙДЕРА · EXTRACT_DIALOG_MEMORY_CAPSULE_V2',
            value: {
              providerText: rawProviderResponse,
              parsedJson: raw,
            },
            excludeFromUsage: true,
          },
          {
            label: 'ДІАГНОСТИКА НОРМАЛІЗАЦІЇ · DIALOG MEMORY',
            value: {
              rawTopLevelType: this.jsonValueType(raw),
              normalized: {
                representation: normalized.user.representation,
                tagsCount: normalized.user.tags.length,
                newTagsCount: normalized.user.newTags.length,
                userMemoryCount: normalized.user.userMemory.length,
                assistantMemoryCount:
                  normalized.assistant.assistantMemory.length,
                commitmentsCount: normalized.commitments.length,
                commitmentUpdatesCount: normalized.commitmentUpdates.length,
                scheduledRemindersCount: normalized.scheduledReminders.length,
                scheduledReminderUpdatesCount:
                  normalized.scheduledReminderUpdates.length,
                threadContinuityWarnings,
              },
            },
            excludeFromUsage: true,
          },
        ],
      });
    }
    if (
      normalized.commitments.length === 0 &&
      this.looksLikeFutureNemoryCommitment(userText, assistantText)
    ) {
      let repairedCommitment: MemoryCapsulePromiseItem | null = null;
      try {
        repairedCommitment = await this.repairMissingCommitmentV2({
          userId,
          userText,
          assistantText,
          activeCommitments,
          timingTraceId: dto.timingTraceId,
          operation: 'repair_missing_dialog_commitment_v2',
          outputLanguageRules,
        });
      } catch (error) {
        this.logger.warn(
          `repair_missing_dialog_commitment_v2 failed after the primary dialog capsule was extracted: ${error instanceof Error ? error.message : String(error)}`,
        );
        this.completeAiPromptUsageCycle(
          dto.timingTraceId,
          'extract_dialog_memory_capsule_v2',
        );
      }
      const commitment =
        repairedCommitment ??
        this.buildAcceptedDialogCommitmentFallback({
          userText,
          assistantText,
          tags: normalized.user.tags,
        });
      if (commitment) {
        normalized = {
          ...normalized,
          commitments: [commitment],
        };
        if (!repairedCommitment) {
          this.logger.warn(
            `repair_missing_dialog_commitment_v2 returned no valid commitment; deterministic fallback created ${commitment.promiseKey}`,
          );
        }
      }
    } else {
      this.completeAiPromptUsageCycle(
        dto.timingTraceId,
        'extract_dialog_memory_capsule_v2',
      );
    }
    const activeByKey = new Map(
      activeCommitments.map((item) => [item.key, item] as const),
    );
    await this.memoryTagCatalogV2Service.markUsed(
      normalized.user.tags.map((tag) => tag.key),
    );
    return {
      ...normalized,
      commitments: normalized.commitments.filter(
        (item) => !activeByKey.has(item.promiseKey),
      ),
      commitmentUpdates: normalized.commitmentUpdates.filter((item) => {
        const active = activeByKey.get(item.promiseKey);
        if (!active) return false;
        const duration = active.duration ?? 'ongoing';
        return !(
          duration === 'ongoing' &&
          (item.status === 'fulfilled' || item.status === 'expired')
        );
      }),
    };
  }

  private looksLikeFutureNemoryCommitment(
    userText: string,
    assistantText: string,
  ): boolean {
    if (this.hasExplicitAssistantFutureCommitment(assistantText)) return true;
    return this.looksLikeAcceptedFutureNemoryRequest(userText, assistantText);
  }

  private hasExplicitAssistantFutureCommitment(assistantText: string): boolean {
    return [
      /\bI(?:'ll|\s+will)\s+(?:remind|ask|check\s+in|follow\s+up|revisit|return\s+to|monitor|track|summari[sz]e)\b/i,
      /\bwe(?:'ll|\s+will)\s+(?:revisit|return\s+to|check\s+in|follow\s+up|monitor|track|summari[sz]e)\b/i,
      /(?:нагадаю|нагадуватиму|буду\s+нагадувати|запитаю|перепитаю|повернуся\s+до|повернемося\s+до|відстежуватиму|перевірятиму|підсумую)/iu,
      /(?:напомню|спрошу|переспрошу|вернусь\s+к|верн[её]мся\s+к|буду\s+отслеживать|буду\s+проверять|подведу\s+итог)/iu,
      /(?:przypomn[eę]|zapytam|dopytam|wr[oó]c[eę]\s+do|wr[oó]cimy\s+do|b[eę]d[eę]\s+monitorowa[cć]|podsumuj[eę])/iu,
      /(?:ich\s+werde\s+(?:daran\s+erinnern|fragen|nachfragen|beobachten|zusammenfassen)|wir\s+kommen\s+darauf\s+zur[uü]ck)/iu,
    ].some((pattern) => pattern.test(assistantText));
  }

  private hasRequestedFutureNemoryAction(userText: string): boolean {
    return [
      /\bremind\s+me\b/i,
      /\b(?:ask|check\s+in\s+with|follow\s+up\s+with)\s+me\b/i,
      /\b(?:revisit|return\s+to|monitor|summari[sz]e)\b/i,
      /нагад(?:ай|уйте|увати|ати)/iu,
      /(?:запитай|питай|перепитай)\s+мене/iu,
      /(?:повернімося|повертайся|відстежуй|перевіряй|підсумовуй)/iu,
      /напомни/iu,
      /(?:спроси|переспроси)\s+меня/iu,
      /(?:верн[её]мся|отслеживай|проверяй|подводи\s+итог)/iu,
      /przypomnij\s+mi/iu,
      /(?:zapytaj|dopytaj)\s+mnie/iu,
      /(?:wr[oó][cć]my|monitoruj|podsumuj)/iu,
      /erinnere\s+mich/iu,
      /frag\s+mich/iu,
      /(?:komm(?:en)?\s+wir\s+darauf\s+zur[uü]ck|beobachte|fasse\s+zusammen)/iu,
    ].some((pattern) => pattern.test(userText));
  }

  private hasAcceptedFutureNemoryAction(assistantText: string): boolean {
    return [
      /\b(?:agreed|deal|I(?:'ll|\s+will)|we(?:'ll|\s+will))\b/i,
      /(?:домовились|згоден|згодна|нагадаю|нагадуватиму|буду\s+нагадувати|запитаю|перепитаю|повернемося|відстежуватиму|перевірятиму|підсумую)/iu,
      /(?:договорились|согласен|согласна|напомню|спрошу|переспрошу|верн[её]мся|буду\s+отслеживать)/iu,
      /(?:zgoda|umowa|przypomn[eę]|zapytam|dopytam|wr[oó]cimy|b[eę]d[eę]\s+monitorowa[cć])/iu,
      /(?:abgemacht|einverstanden|ich\s+werde|ich\s+erinnere|ich\s+frage|wir\s+kommen\s+darauf\s+zur[uü]ck)/iu,
    ].some((pattern) => pattern.test(assistantText));
  }

  private looksLikeAcceptedFutureNemoryRequest(
    userText: string,
    assistantText: string,
  ): boolean {
    return (
      this.hasRequestedFutureNemoryAction(userText) &&
      this.hasAcceptedFutureNemoryAction(assistantText)
    );
  }

  private buildAcceptedDialogCommitmentFallback(params: {
    userText: string;
    assistantText: string;
    tags: MemoryCapsuleTag[];
  }): MemoryCapsulePromiseItem | null {
    if (
      !this.looksLikeAcceptedFutureNemoryRequest(
        params.userText,
        params.assistantText,
      )
    ) {
      return null;
    }

    const combinedText = `${params.userText}\n${params.assistantText}`;
    const promiseKind = this.inferAcceptedCommitmentKind(combinedText);
    const topic =
      params.tags
        .filter((tag) => tag.type === 'domain')
        .map((tag) => tag.key.slice('domain.'.length))
        .map((value) => this.normalizeAssistantMemoryTopic(value))
        .find(Boolean) ?? 'other';
    const content = this.extractAcceptedCommitmentSentence(
      params.assistantText,
    );
    if (!content) return null;

    const fingerprint = createHash('sha256')
      .update(
        params.userText
          .normalize('NFKC')
          .replace(/\s+/g, ' ')
          .trim()
          .toLowerCase(),
      )
      .digest('hex')
      .slice(0, 16);
    return {
      kind: 'promise',
      promiseKey: `${promiseKind}.${topic}.accepted_${fingerprint}`,
      promiseKind,
      topic,
      content,
      importance: 4,
      duration: 'ongoing',
      status: 'open',
      triggerTags: params.tags.map((tag) => tag.key),
    };
  }

  private inferAcceptedCommitmentKind(text: string): MemoryCapsulePromiseKind {
    if (/(?:\bremind\b|нагад|напом|przypomn|erinner)/iu.test(text)) {
      return 'reminder';
    }
    if (
      /(?:\b(?:ask|check\s+in|follow\s+up|revisit|return\s+to)\b|запит|перепит|поверн|спрос|верн|zapyt|dopyt|wr[oó][cć]|frag|zur[uü]ck)/iu.test(
        text,
      )
    ) {
      return 'follow_up';
    }
    if (
      /(?:\b(?:monitor|track)\b|відстеж|перевір|отслеж|провер|monitor|beobacht)/iu.test(
        text,
      )
    ) {
      return 'monitoring';
    }
    return 'promise';
  }

  private extractAcceptedCommitmentSentence(assistantText: string): string {
    const cleaned = this.cleanShortText(assistantText, 2000);
    if (!cleaned) return '';
    const sentences = cleaned.match(/[^.!?]+[.!?]?/gu) ?? [cleaned];
    const explicit = sentences.find((sentence) =>
      this.hasExplicitAssistantFutureCommitment(sentence),
    );
    return this.normalizeNemoryBrandReferences(
      this.cleanShortText(explicit ?? sentences[0], 500),
    );
  }

  private async repairMissingCommitmentV2(params: {
    userId: number;
    userText: string;
    assistantText: string;
    activeCommitments: ExtractAssistantMemoryCapsuleV2Dto['activeCommitments'];
    timingTraceId?: string;
    operation:
      | 'repair_missing_assistant_commitment_v2'
      | 'repair_missing_dialog_commitment_v2';
    outputLanguageRules?: string;
  }): Promise<MemoryCapsulePromiseItem | null> {
    const activeCommitments = params.activeCommitments ?? [];
    const prompt = `
You repair one potentially missing structured Nemory commitment after a
completed reflection or dialog turn. Inspect the exact user text and Nemory
response. Do not answer the user and do not extract advice or a task for the
user.

Return commitment only when Nemory explicitly accepted or independently made
a concrete future personalized obligation such as a reminder, follow-up,
monitoring, recurring ritual, summary or agreement to revisit something.
Otherwise return null.
The commitment must preserve the trigger or condition from the exchange.
Reminders and repeated agreements are ongoing unless the exchange clearly
requests one action only. Do not duplicate an active commitment.

Advice or a plan for the user is not a Nemory commitment. A generic offer of
help or description of normal product behavior is not a commitment. The
future action must be performed by Nemory in a later interaction.

Promise keys are stable lowercase ASCII identifiers. promiseKind is one of:
"promise", "ritual", "plan", "follow_up", "reminder", "monitoring",
"style_rule", "other". Human-readable content follows the exchange language.

${params.outputLanguageRules ?? ''}

ACTIVE COMMITMENTS:
${activeCommitments.length ? JSON.stringify(activeCommitments) : '[]'}

Return exactly one JSON object without Markdown:
{
  "commitment": {"kind":"promise","promiseKey":"reminder.example","promiseKind":"reminder","topic":"other","content":"...","importance":4,"duration":"ongoing","status":"open","triggerTags":[]}
}
or:
{"commitment": null}

USER MESSAGE:
${params.userText ? `"""${params.userText}"""` : '(not provided)'}

NEMORY RESPONSE:
"""${params.assistantText}"""
    `.trim();

    const raw = await this.runMemoryCapsuleExtraction(
      params.userId,
      prompt,
      TokenType.ASSISTANT_MEMORY,
      params.operation,
      params.timingTraceId,
      true,
    );
    const repaired = this.normalizePromiseItem(
      this.asRecord(this.asRecord(raw).commitment),
    );
    if (!repaired) return null;
    return activeCommitments.some((item) => item.key === repaired.promiseKey)
      ? null
      : repaired;
  }

  private async runMemoryCapsuleExtraction(
    userId: number,
    prompt: MemoryCapsuleExtractionPrompt,
    tokenType: TokenType,
    operation: string,
    traceId?: string,
    cycleComplete = false,
    options?: {
      sourceType?: MemoryCapsuleSourceType;
      cacheStaticPrefix?: boolean;
      onParsedResponse?: (response: {
        content: string;
        parsed: unknown;
        attempt: number;
      }) => void;
    },
  ): Promise<unknown> {
    const model = normalizeAiModel(
      this.configService.get<AiModel>('AI_MODEL_FOR_MEMORY') ??
        AiModel.GPT_5_MINI,
    );
    const messages: OpenAiMessage[] =
      typeof prompt === 'string'
        ? [{ role: 'system', content: prompt }]
        : [
            { role: 'system', content: prompt.staticPrompt },
            { role: 'user', content: prompt.dynamicPrompt },
          ];
    const cacheStaticPrefix =
      options?.sourceType === 'dialog' &&
      options.cacheStaticPrefix === true &&
      typeof prompt !== 'string';
    const promptCacheOptions = getOpenAiPromptCacheOptions(model);
    const promptCacheKey =
      cacheStaticPrefix && promptCacheOptions
        ? buildOpenAiPromptCacheKey({
            modelId: model,
            scope: `memory_dialog_static_${operation}`,
            userId,
          })
        : undefined;
    const openAiMessages =
      cacheStaticPrefix && promptCacheOptions && typeof prompt !== 'string'
        ? addExplicitPromptCacheBreakpoint(messages, prompt.staticPrompt)
        : messages;

    const maxAttempts = 2;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const request = {
          model,
          messages: openAiMessages,
          store: false,
          stream: false,
          response_format: { type: 'json_object' },
          max_completion_tokens: 5000,
          ...(promptCacheKey ? { prompt_cache_key: promptCacheKey } : {}),
          ...(promptCacheOptions
            ? { prompt_cache_options: promptCacheOptions }
            : {}),
        } as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming & {
          prompt_cache_key?: string;
          prompt_cache_options?: { mode: 'explicit' };
        };
        const resp = await this.openai.chat.completions.create(request);
        const content = resp.choices?.[0]?.message?.content?.trim() ?? '';

        const inputTokens =
          resp.usage?.prompt_tokens ?? this.countOpenAiTokens(messages, model);
        const cachedInputTokens = getCachedInputTokens(resp.usage);
        const cacheWriteInputTokens = getCacheWriteInputTokens(resp.usage);
        const outputTokens =
          resp.usage?.completion_tokens ??
          this.countStringTokens([content], model);
        const estimated =
          resp.usage?.prompt_tokens == null ||
          resp.usage?.completion_tokens == null;
        const finishReason = resp.choices?.[0]?.finish_reason ?? null;

        await this.persistAiUsage({
          userId,
          type: tokenType,
          model,
          modelLabel: model,
          inputTokens,
          cachedInputTokens,
          cacheWriteInputTokens,
          outputTokens,
          finishReason,
          estimated,
          traceId,
          operation,
          cycleComplete: false,
        });

        if (!content) {
          if (cycleComplete) {
            this.completeAiPromptUsageCycle(traceId, operation);
          }
          return {};
        }

        const parsed = this.parseMemoryCapsuleJson(content, finishReason);
        options?.onParsedResponse?.({ content, parsed, attempt });
        if (cycleComplete) {
          this.completeAiPromptUsageCycle(traceId, operation);
        }
        return parsed;
      } catch (error) {
        this.aiErrorReporter?.report({
          operation,
          transport: 'background',
          error,
          userId,
          model,
        });
        if (attempt >= maxAttempts || !this.isMemoryCapsuleJsonError(error)) {
          throw error;
        }
        this.logger.warn(
          `${operation}: invalid JSON response on attempt ${attempt}; retrying once`,
        );
      }
    }

    throw new Error(`${operation}: memory capsule extraction failed`);
  }

  private parseMemoryCapsuleJson(
    content: string,
    finishReason: string | null,
  ): unknown {
    const start = content.indexOf('{');
    const end = content.lastIndexOf('}');
    const details = `finishReason=${finishReason ?? 'unknown'}, chars=${content.length}`;
    if (start < 0 || end <= start) {
      throw new Error(`Memory capsule JSON missing object (${details})`);
    }

    try {
      return JSON.parse(content.slice(start, end + 1)) as unknown;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new SyntaxError(
        `Memory capsule JSON parse failed (${details}): ${message}`,
      );
    }
  }

  private isMemoryCapsuleJsonError(error: unknown): boolean {
    return (
      error instanceof SyntaxError ||
      (error instanceof Error &&
        error.message.startsWith('Memory capsule JSON missing object'))
    );
  }

  private async persistAiUsage(params: {
    userId: number;
    type: TokenType;
    model: AiModel;
    modelLabel?: string;
    inputTokens: number;
    cachedInputTokens?: number;
    cacheWriteInputTokens?: number;
    outputTokens: number;
    finishReason?: string | null;
    estimated?: boolean;
    traceId?: string;
    operation: string;
    cycleComplete?: boolean;
  }): Promise<void> {
    const traceId =
      params.traceId?.trim() ||
      `${params.operation}-${params.userId}-${Date.now()}`;

    const providerReportedCachedInputTokens = Math.min(
      Math.max(0, Math.trunc(params.inputTokens)),
      Math.max(0, Math.trunc(params.cachedInputTokens ?? 0)),
    );
    const providerReportedCacheWriteInputTokens = Math.min(
      Math.max(0, Math.trunc(params.inputTokens)) -
        providerReportedCachedInputTokens,
      Math.max(0, Math.trunc(params.cacheWriteInputTokens ?? 0)),
    );
    const cachedInputTokens = providerReportedCachedInputTokens;
    const cacheWriteInputTokens = providerReportedCacheWriteInputTokens;
    const standardInputTokens = Math.max(
      0,
      Math.trunc(params.inputTokens) -
        cachedInputTokens -
        cacheWriteInputTokens,
    );
    const cachePricingSource =
      cachedInputTokens > 0 || cacheWriteInputTokens > 0 || !params.estimated
        ? ('provider_usage' as const)
        : ('estimated_standard_input' as const);

    await this.tokensService.addTokenUserHistory(
      params.userId,
      params.type,
      params.model,
      params.inputTokens,
      params.outputTokens,
      params.finishReason,
      params.estimated,
      {
        traceId,
        operation: params.operation,
        cachedInputTokens,
        cacheWriteInputTokens,
      },
    );
    await this.subscriptionUsageService.recordAiUsage(
      params.userId,
      params.model,
      params.inputTokens,
      params.outputTokens,
      cachedInputTokens,
      cacheWriteInputTokens,
    );

    if (process.env.NODE_ENV === 'production') return;

    this.clearExpiredAiPromptUsageCycles();
    const credits = tokensToCredits(
      params.model,
      params.inputTokens,
      params.outputTokens,
      cachedInputTokens,
      cacheWriteInputTokens,
    );
    const operation: AiPromptUsageOperation = {
      operation: params.operation,
      model: params.modelLabel ?? params.model,
      pricingModel: params.model,
      estimated: params.estimated === true,
      inputTokens: params.inputTokens,
      providerReportedCachedInputTokens,
      providerReportedCacheWriteInputTokens,
      cachePricingSource,
      standardInputTokens,
      cachedInputTokens,
      cacheWriteInputTokens,
      outputTokens: params.outputTokens,
      totalTokens: params.inputTokens + params.outputTokens,
      inputCredits: credits.inputUsedCredits,
      outputCredits: credits.outputUsedCredits,
      totalCredits: credits.inputUsedCredits + credits.outputUsedCredits,
      finishReason: params.finishReason,
    };
    const cycle = this.aiPromptUsageCycles.get(traceId) ?? {
      createdAt: Date.now(),
      inputTokens: 0,
      providerReportedCachedInputTokens: 0,
      providerReportedCacheWriteInputTokens: 0,
      standardInputTokens: 0,
      cachedInputTokens: 0,
      cacheWriteInputTokens: 0,
      outputTokens: 0,
      inputCredits: 0,
      outputCredits: 0,
      operations: [],
    };
    cycle.inputTokens += operation.inputTokens;
    cycle.providerReportedCachedInputTokens +=
      operation.providerReportedCachedInputTokens;
    cycle.providerReportedCacheWriteInputTokens +=
      operation.providerReportedCacheWriteInputTokens;
    cycle.standardInputTokens += operation.standardInputTokens;
    cycle.cachedInputTokens += operation.cachedInputTokens;
    cycle.cacheWriteInputTokens += operation.cacheWriteInputTokens;
    cycle.outputTokens += operation.outputTokens;
    cycle.inputCredits += operation.inputCredits;
    cycle.outputCredits += operation.outputCredits;
    cycle.operations.push(operation);
    this.aiPromptUsageCycles.set(traceId, cycle);

    const cycleComplete = !params.traceId || params.cycleComplete === true;
    const operationUsageLog = this.buildAiUsageOperationLog(operation);
    const fullOperationLog = {
      marker: 'NEMORY_AI_PROMPT_USAGE',
      logType: 'ai_call',
      title: this.getAiUsageOperationTitle(operation.operation),
      traceId,
      ...operationUsageLog,
    };
    scheduleServerDebugTask(() => {
      this.logger.log(
        JSON.stringify({
          marker: 'NEMORY_AI_PROMPT_USAGE_STATS',
          logType: 'ai_call',
          operation: operation.operation,
          traceId,
          model: operation.model,
          inputTokens: operation.inputTokens,
          cachedInputTokens: operation.cachedInputTokens,
          outputTokens: operation.outputTokens,
          totalCredits: operation.totalCredits,
        }),
      );
    });
    writeFullServerDebugLog('NEMORY_AI_PROMPT_USAGE', fullOperationLog);
    rememberMemoryReviewProviderUsage({
      traceId,
      ...operationUsageLog,
      ratesPer1MTokens: this.buildAiUsageRates(operation),
      finishReason: operation.finishReason,
    });

    if (cycleComplete) {
      if (params.traceId) {
        this.logAiPromptUsageCycle(
          traceId,
          `${params.operation}_cycle_complete`,
          cycle,
        );
      }
      this.aiPromptUsageCycles.delete(traceId);
    }
  }

  private clearExpiredAiPromptUsageCycles() {
    const cutoff = Date.now() - 2 * 60 * 60 * 1000;
    for (const [traceId, cycle] of this.aiPromptUsageCycles) {
      if (cycle.createdAt < cutoff) this.aiPromptUsageCycles.delete(traceId);
    }
  }

  private completeAiPromptUsageCycle(
    traceId: string | undefined,
    operation: string,
  ) {
    if (!traceId || process.env.NODE_ENV === 'production') return;
    const cycle = this.aiPromptUsageCycles.get(traceId);
    if (!cycle) return;

    this.logAiPromptUsageCycle(traceId, `${operation}_cycle_complete`, cycle);
    this.aiPromptUsageCycles.delete(traceId);
  }

  private buildAiUsageOperationLog(operation: AiPromptUsageOperation) {
    return {
      operation: operation.operation,
      model: operation.model,
      usageSource: operation.cachePricingSource,
      estimated: operation.estimated,
      finishReason: operation.finishReason ?? null,
      tokensFromProvider: {
        inputTotal: operation.inputTokens,
        standardInput: operation.standardInputTokens,
        cacheReadInput: operation.cachedInputTokens,
        cacheWriteInput: operation.cacheWriteInputTokens,
        output: operation.outputTokens,
        total: operation.totalTokens,
      },
      creditsByFormula: this.buildAiUsageCreditsByFormula(operation),
      chargedCredits: {
        input: operation.inputCredits,
        output: operation.outputCredits,
        total: operation.totalCredits,
      },
    };
  }

  private buildAiUsageRates(operation: AiPromptUsageOperation) {
    const pricing = getModelPriceCredits(operation.pricingModel);
    return {
      standardInput: pricing.inPer1M,
      cacheReadInput: pricing.cachedInPer1M,
      cacheWriteInput: pricing.cacheWriteInPer1M,
      output: pricing.outPer1M,
    };
  }

  private buildAiUsageCreditsByFormula(operation: AiPromptUsageOperation) {
    const rates = this.buildAiUsageRates(operation);
    const credits = (tokens: number, creditsPer1M: number) =>
      Number(((tokens * creditsPer1M) / 1_000_000).toFixed(4));

    return {
      standardInput: credits(
        operation.standardInputTokens,
        rates.standardInput,
      ),
      cacheReadInput: credits(
        operation.cachedInputTokens,
        rates.cacheReadInput,
      ),
      cacheWriteInput: credits(
        operation.cacheWriteInputTokens,
        rates.cacheWriteInput,
      ),
      output: credits(operation.outputTokens, rates.output),
    };
  }

  private logAiPromptUsageCycle(
    traceId: string,
    operation: string,
    cycle: AiPromptUsageCycle,
  ) {
    const creditsByFormula = cycle.operations.reduce(
      (total, item) => {
        const current = this.buildAiUsageCreditsByFormula(item);
        return {
          standardInput: total.standardInput + current.standardInput,
          cacheReadInput: total.cacheReadInput + current.cacheReadInput,
          cacheWriteInput: total.cacheWriteInput + current.cacheWriteInput,
          output: total.output + current.output,
        };
      },
      {
        standardInput: 0,
        cacheReadInput: 0,
        cacheWriteInput: 0,
        output: 0,
      },
    );
    const fullCycleLog = {
      marker: 'NEMORY_AI_PROMPT_USAGE',
      logType: 'cycle_summary',
      title: 'ПОВНИЙ AI-ЦИКЛ',
      traceId,
      completedBy: operation,
      callsCount: cycle.operations.length,
      tokensFromProvider: {
        inputTotal: cycle.inputTokens,
        standardInput: cycle.standardInputTokens,
        cacheReadInput: cycle.cachedInputTokens,
        cacheWriteInput: cycle.cacheWriteInputTokens,
        output: cycle.outputTokens,
        total: cycle.inputTokens + cycle.outputTokens,
      },
      creditsByFormula: {
        standardInput: Number(creditsByFormula.standardInput.toFixed(4)),
        cacheReadInput: Number(creditsByFormula.cacheReadInput.toFixed(4)),
        cacheWriteInput: Number(creditsByFormula.cacheWriteInput.toFixed(4)),
        output: Number(creditsByFormula.output.toFixed(4)),
      },
      chargedCredits: {
        input: cycle.inputCredits,
        output: cycle.outputCredits,
        total: cycle.inputCredits + cycle.outputCredits,
      },
      calls: cycle.operations.map((item) => ({
        title: this.getAiUsageOperationTitle(item.operation),
        ...this.buildAiUsageOperationLog(item),
      })),
    };
    scheduleServerDebugTask(() => {
      this.logger.log(
        JSON.stringify({
          marker: 'NEMORY_AI_PROMPT_USAGE_STATS',
          logType: 'cycle_summary',
          traceId,
          completedBy: operation,
          callsCount: cycle.operations.length,
          inputTokens: cycle.inputTokens,
          cachedInputTokens: cycle.cachedInputTokens,
          outputTokens: cycle.outputTokens,
          totalCredits: cycle.inputCredits + cycle.outputCredits,
        }),
      );
    });
    writeFullServerDebugLog('NEMORY_AI_PROMPT_USAGE', fullCycleLog);
  }

  private getAiUsageOperationTitle(operation: string): string {
    const titles: Record<string, string> = {
      generate_entry_response: 'ЗАПИС · AI-РЕФЛЕКСІЯ',
      generate_checkin_response: 'ЧЕКІН · AI-РЕФЛЕКСІЯ',
      generate_dialog_response: 'ДІАЛОГ · ВІДПОВІДЬ МОДЕЛІ',
      generate_checkin_dialog_response: 'ДІАЛОГ ЧЕКІНУ · ВІДПОВІДЬ МОДЕЛІ',
      extract_user_memory_capsule_v2:
        "ПАМ'ЯТЬ · ТЕГИ ТА ДОВГОТРИВАЛА ПАМ'ЯТЬ КОРИСТУВАЧА",
      extract_assistant_memory_capsule_v2:
        "ПАМ'ЯТЬ · ДОВГОТРИВАЛА ПАМ'ЯТЬ ТА ОБІЦЯНКИ NEMORY",
      extract_dialog_memory_capsule_v2: "ДІАЛОГ · КАПСУЛА, ПАМ'ЯТЬ ТА ОБІЦЯНКИ",
      extract_user_memory_legacy: "LEGACY · ПАМ'ЯТЬ КОРИСТУВАЧА",
      extract_assistant_memory_legacy: "LEGACY · ПАМ'ЯТЬ NEMORY",
    };
    return titles[operation] ?? operation;
  }

  private cleanMemoryCapsuleText(text: string, maxTextChars?: number): string {
    const limit = Math.max(1000, Math.min(maxTextChars ?? 20000, 50000));
    return text
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, limit);
  }

  private formatCurrentMemoryCapsuleInput(
    sourceType: 'entry' | 'checkin',
    text: string,
    title?: string,
  ): string {
    const cleanedTitle =
      sourceType === 'entry' && typeof title === 'string'
        ? this.cleanMemoryCapsuleText(title, 1000)
        : '';
    const titleBlock = cleanedTitle
      ? `CURRENT ENTRY TITLE:\n"""${cleanedTitle}"""\n\n`
      : '';
    return `${titleBlock}CURRENT USER TEXT:\n"""${text}"""`;
  }

  private formatCurrentJournalEntryForPrompt(
    dateText: string,
    text: string,
    mood: string,
    title?: string,
    weekday?: string,
  ): string {
    if (!title) {
      return weekday
        ? `Current journal entry (${dateText}):\nSaved weekday: ${weekday}\n${text}. mood: ${mood}`
        : `Current journal entry (${dateText}): ${text}. mood: ${mood}`;
    }

    return `Current journal entry (${dateText}):\n${weekday ? `Saved weekday: ${weekday}\n` : ''}Title: ${title}\nContent: ${text}\nMood: ${mood}`;
  }

  private emptyUserMemoryCapsuleV2(): ExtractUserMemoryCapsuleV2Response {
    return {
      schemaVersion: 2,
      tags: [],
      newTags: [],
      importance: 1,
      userDigest: '',
      userMemory: [],
    };
  }

  private emptyAssistantMemoryCapsuleV2(): ExtractAssistantMemoryCapsuleV2Response {
    return {
      schemaVersion: 2,
      assistantMemory: [],
      commitments: [],
      commitmentUpdates: [],
      scheduledReminders: [],
      scheduledReminderUpdates: [],
    };
  }

  private emptyDialogMemoryCapsuleV2(
    userText = '',
  ): ExtractDialogMemoryCapsuleV2Response {
    return {
      schemaVersion: 2,
      user: {
        representation: 'verbatim',
        text: userText,
        tags: [],
        newTags: [],
        importance: 1,
        userMemory: [],
      },
      assistant: {
        assistantMemory: [],
        continuationSummary: '',
        reflectionSummary: '',
      },
      commitments: [],
      commitmentUpdates: [],
      scheduledReminders: [],
      scheduledReminderUpdates: [],
    };
  }

  private normalizeUserMemoryCapsuleV2(
    value: unknown,
    existingCatalogTagKeys: ReadonlySet<string> = new Set(),
  ): ExtractUserMemoryCapsuleV2Response {
    const data = this.asRecord(value);
    const userMemoryCandidates = [
      ...this.asArray(data.problems).map((item) => ({
        ...this.asRecord(item),
        kind: 'vulnerability',
      })),
      ...this.asArray(data.userMemory),
    ].map((item) => this.normalizeUserMemoryCandidateV2(item));
    const tags = this.asArray(data.tags)
      .map((item) => this.normalizeMemoryCapsuleTag(item))
      .filter((item): item is MemoryCapsuleTag => !!item)
      .slice(0, 12);
    const candidateNewTags = this.asArray(data.newTags)
      .map((item) => this.normalizeNewMemoryTagV2(item))
      .filter((item): item is MemoryCapsuleNewTagV2 => !!item)
      .slice(0, 12);
    const tagsByKey = new Map(tags.map((tag) => [tag.key, tag]));
    for (const tag of candidateNewTags) {
      if (!tagsByKey.has(tag.key)) {
        const selected = { key: tag.key, type: tag.type, confidence: 0.8 };
        tags.push(selected);
        tagsByKey.set(tag.key, selected);
      }
    }
    tags.splice(12);
    const tagKeys = new Set(tags.map((tag) => tag.key));
    const newTags = candidateNewTags.filter(
      (tag) => !existingCatalogTagKeys.has(tag.key),
    );
    return {
      schemaVersion: 2,
      tags,
      newTags: newTags.filter((tag) => tagKeys.has(tag.key)),
      importance: this.clampNumber(data.importance, 1, 5, 1),
      userDigest: this.cleanMemoryDigest(data.userDigest),
      userMemory: this.dedupeCurrentSourceUserMemoryV2(
        userMemoryCandidates
          .filter((item): item is ProposedMemoryItem =>
            this.isValidMemoryItem(item as ProposedMemoryItem),
          )
          .map((item) => ({
            ...item,
            content: this.cleanShortText(item.content, 800),
            importance: this.clampNumber(item.importance, 1, 5, 3),
          }))
          .filter((item) => item.content),
      ),
    };
  }

  private buildUserMemoryNormalizationDiagnostics(
    value: unknown,
    normalizedCount: number,
  ) {
    const data = this.asRecord(value);
    const sources = [
      ...this.asArray(data.problems).map((item, index) => ({
        source: 'problems' as const,
        index,
        candidate: {
          ...this.asRecord(item),
          kind: 'vulnerability',
        },
      })),
      ...this.asArray(data.userMemory).map((item, index) => ({
        source: 'userMemory' as const,
        index,
        candidate: item,
      })),
    ];
    const normalizedSources = sources.map((source) => ({
      ...source,
      normalizedCandidate: this.normalizeUserMemoryCandidateV2(
        source.candidate,
      ),
    }));
    const rejectedCandidates = normalizedSources.flatMap((source) => {
      const reasons = this.memoryItemRejectionReasons(
        source.normalizedCandidate,
      );
      return reasons.length > 0
        ? [
            {
              source: source.source,
              index: source.index,
              reasons,
              candidate: source.candidate,
              normalizedCandidate: source.normalizedCandidate,
            },
          ]
        : [];
    });
    const validCandidateCount =
      normalizedSources.length - rejectedCandidates.length;
    const normalizedCandidates = normalizedSources.flatMap((source) => {
      const rawTopic = this.asRecord(source.candidate).topic;
      const normalizedTopic = this.asRecord(source.normalizedCandidate).topic;
      return rawTopic !== normalizedTopic
        ? [
            {
              source: source.source,
              index: source.index,
              originalTopic: rawTopic,
              normalizedTopic,
            },
          ]
        : [];
    });

    return {
      rawTopLevelType: this.jsonValueType(value),
      collections: {
        problems: {
          receivedType: this.jsonValueType(data.problems),
          candidateCount: this.asArray(data.problems).length,
        },
        userMemory: {
          receivedType: this.jsonValueType(data.userMemory),
          candidateCount: this.asArray(data.userMemory).length,
        },
      },
      totalCandidateCount: sources.length,
      validCandidateCount,
      rejectedCandidateCount: rejectedCandidates.length,
      rejectedCandidates,
      normalizedCandidates,
      removedDuringCleanupOrDeduplication: Math.max(
        0,
        validCandidateCount - normalizedCount,
      ),
      normalizedUserMemoryCount: normalizedCount,
    };
  }

  private memoryItemRejectionReasons(value: unknown): string[] {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return ['candidate_is_not_an_object'];
    }
    const item = this.asRecord(value);
    const reasons: string[] = [];
    if (typeof item.content !== 'string' || !item.content.trim()) {
      reasons.push('content_is_missing_or_empty');
    }
    const validKinds: MemoryKind[] = [
      'fact',
      'preference',
      'goal',
      'pattern',
      'value',
      'strength',
      'vulnerability',
      'trigger',
      'coping_strategy',
      'boundary',
      'meta',
      'other',
    ];
    if (!validKinds.includes(item.kind as MemoryKind)) {
      reasons.push('kind_is_missing_or_not_allowed');
    }
    const validTopics: MemoryTopic[] = [
      'self',
      'work',
      'study',
      'relationships',
      'family',
      'health',
      'mental_health',
      'sleep',
      'habits',
      'productivity',
      'money',
      'creativity',
      'lifestyle',
      'values',
      'goals',
      'other',
    ];
    if (!validTopics.includes(item.topic as MemoryTopic)) {
      reasons.push('topic_is_missing_or_not_allowed');
    }
    if (!Number.isFinite(Number(item.importance))) {
      reasons.push('importance_is_missing_or_not_numeric');
    }
    return reasons;
  }

  private normalizeUserMemoryCandidateV2(value: unknown): unknown {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return value;
    }
    const item = this.asRecord(value);
    const topic = this.normalizeUserMemoryTopicV2(item.topic);
    return topic ? { ...item, topic } : item;
  }

  private normalizeUserMemoryTopicV2(value: unknown): MemoryTopic | '' {
    const validTopics: MemoryTopic[] = [
      'self',
      'work',
      'study',
      'relationships',
      'family',
      'health',
      'mental_health',
      'sleep',
      'habits',
      'productivity',
      'money',
      'creativity',
      'lifestyle',
      'values',
      'goals',
      'other',
    ];
    const canonical = this.normalizeKey(value) as MemoryTopic;
    if (validTopics.includes(canonical)) return canonical;
    if (typeof value !== 'string') return '';

    const localized = value
      .normalize('NFKC')
      .trim()
      .toLocaleLowerCase('uk-UA')
      .replace(/[’ʼ`]/g, "'")
      .replace(/[\s-]+/g, '_');
    const ukrainianAliases: Record<string, MemoryTopic> = {
      я: 'self',
      особисте: 'self',
      робота: 'work',
      навчання: 'study',
      освіта: 'study',
      стосунки: 'relationships',
      відносини: 'relationships',
      "сім'я": 'family',
      родина: 'family',
      "здоров'я": 'health',
      "психічне_здоров'я": 'mental_health',
      "ментальне_здоров'я": 'mental_health',
      сон: 'sleep',
      звички: 'habits',
      продуктивність: 'productivity',
      гроші: 'money',
      фінанси: 'money',
      творчість: 'creativity',
      спосіб_життя: 'lifestyle',
      стиль_життя: 'lifestyle',
      цінності: 'values',
      цілі: 'goals',
      інше: 'other',
    };
    return ukrainianAliases[localized] ?? '';
  }

  private jsonValueType(value: unknown): string {
    if (value === undefined) return 'missing';
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
  }

  private dedupeCurrentSourceUserMemoryV2(
    items: ProposedMemoryItem[],
  ): ProposedMemoryItem[] {
    const result: ProposedMemoryItem[] = [];

    for (const item of items) {
      const duplicateIndex = result.findIndex((existing) =>
        this.isSameCurrentSourceMemoryV2(existing, item),
      );
      if (duplicateIndex < 0) {
        result.push(item);
        continue;
      }

      const existing = result[duplicateIndex];
      const keepIncoming =
        (item.kind === 'vulnerability' && existing.kind !== 'vulnerability') ||
        (item.kind === existing.kind &&
          item.content.length > existing.content.length);
      const selected = keepIncoming ? item : existing;
      result[duplicateIndex] = {
        ...selected,
        importance: Math.max(existing.importance, item.importance),
      };
    }

    return result;
  }

  private isSameCurrentSourceMemoryV2(
    first: ProposedMemoryItem,
    second: ProposedMemoryItem,
  ): boolean {
    const firstText = this.normalizeMemoryComparisonTextV2(first.content);
    const secondText = this.normalizeMemoryComparisonTextV2(second.content);
    if (!firstText || !secondText) return false;
    if (firstText === secondText) return true;
    if (first.topic !== second.topic) return false;

    const comparableKinds =
      first.kind === second.kind ||
      (first.kind === 'vulnerability' && second.kind === 'pattern') ||
      (first.kind === 'pattern' && second.kind === 'vulnerability');
    if (!comparableKinds) return false;

    const firstRoots = this.memoryComparisonRootsV2(firstText);
    const secondRoots = this.memoryComparisonRootsV2(secondText);
    const smallerSize = Math.min(firstRoots.size, secondRoots.size);
    if (smallerSize === 0) return false;

    let shared = 0;
    for (const root of firstRoots) {
      if (secondRoots.has(root)) shared += 1;
    }

    const overlap = shared / smallerSize;
    const requiredOverlap = first.kind === second.kind ? 0.5 : 0.78;
    return shared >= 4 && overlap >= requiredOverlap;
  }

  private normalizeMemoryComparisonTextV2(value: string): string {
    return value
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private memoryComparisonRootsV2(value: string): Set<string> {
    const stopWords = new Set([
      'about',
      'after',
      'before',
      'from',
      'that',
      'this',
      'when',
      'with',
      'було',
      'була',
      'були',
      'його',
      'коли',
      'може',
      'після',
      'перед',
      'також',
      'через',
      'цього',
      'який',
      'яка',
      'яке',
    ]);

    return new Set(
      value
        .split(' ')
        .filter((token) => token.length >= 4 && !stopWords.has(token))
        .map((token) => (token.length > 5 ? token.slice(0, 5) : token)),
    );
  }

  private normalizeUserMemoryConsolidationPreview(
    value: unknown,
    items: UserMemoryConsolidationCandidateV2Dto[],
    targetReductionPercent: number,
    similarOnly = false,
  ): PreviewUserMemoryConsolidationV2Response {
    const itemsById = new Map(items.map((item) => [item.id, item]));
    const usedIds = new Set<string>();
    const groups: UserMemoryConsolidationGroupV2[] = [];
    const data = this.asRecord(value);
    const targetOutputCount =
      items.length === 0
        ? 0
        : Math.max(
            1,
            Math.floor(items.length * (1 - targetReductionPercent / 100)),
          );
    const requiredReductionCount = items.length - targetOutputCount;
    let achievedReductionCount = 0;
    const compressionModePriority: Record<
      UserMemoryConsolidationModeV2,
      number
    > = {
      same_episode: 0,
      repeated_pattern: 1,
      thematic_summary: 2,
    };
    const rawGroups = this.asArray(data.groups)
      .slice()
      .sort((left, right) => {
        const leftGroup = this.asRecord(left);
        const rightGroup = this.asRecord(right);
        const leftMode = leftGroup.compressionMode as
          | UserMemoryConsolidationModeV2
          | undefined;
        const rightMode = rightGroup.compressionMode as
          | UserMemoryConsolidationModeV2
          | undefined;
        return (
          (compressionModePriority[leftMode ?? 'thematic_summary'] ?? 2) -
          (compressionModePriority[rightMode ?? 'thematic_summary'] ?? 2)
        );
      });

    for (const candidate of rawGroups) {
      if (!similarOnly && achievedReductionCount >= requiredReductionCount)
        break;
      const group = this.asRecord(candidate);
      const compressionMode = group.compressionMode as
        | UserMemoryConsolidationModeV2
        | undefined;
      if (
        !compressionMode ||
        !Object.prototype.hasOwnProperty.call(
          compressionModePriority,
          compressionMode,
        )
      ) {
        continue;
      }
      if (similarOnly && compressionMode === 'thematic_summary') continue;
      const rawSourceMemoryIds = this.asArray(group.sourceMemoryIds);
      if (
        rawSourceMemoryIds.some(
          (id) =>
            typeof id !== 'string' || !itemsById.has(id) || usedIds.has(id),
        )
      ) {
        continue;
      }
      const sourceMemoryIds = Array.from(
        new Set(rawSourceMemoryIds as string[]),
      );
      if (sourceMemoryIds.length < 2) continue;

      const memory = {
        kind: group.kind,
        topic: group.topic,
        content: this.cleanShortText(group.content, 1200),
        importance: this.clampNumber(group.importance, 1, 5, 3),
      } as ProposedMemoryItem;
      if (!this.isValidMemoryItem(memory)) continue;

      const sources = sourceMemoryIds
        .map((id) => itemsById.get(id))
        .filter(
          (item): item is UserMemoryConsolidationCandidateV2Dto => !!item,
        );
      const firstSeenAt = Math.min(
        ...sources.map((item) => item.firstSeenAt ?? item.createdAt),
      );
      const lastSeenAt = Math.max(
        ...sources.map((item) => item.lastSeenAt ?? item.createdAt),
      );
      const evidenceCount = sources.reduce(
        (sum, item) =>
          sum + Math.max(1, item.evidenceCount ?? item.occurrenceCount ?? 1),
        0,
      );
      const sourceOccurrenceCount = sources.reduce(
        (sum, item) => sum + Math.max(1, item.occurrenceCount ?? 1),
        0,
      );
      const defaultOccurrenceCount =
        compressionMode === 'same_episode'
          ? Math.max(
              ...sources.map((item) => Math.max(1, item.occurrenceCount ?? 1)),
            )
          : sourceOccurrenceCount;
      const occurrenceCount = this.clampNumber(
        group.occurrenceCount,
        1,
        evidenceCount,
        defaultOccurrenceCount,
      );
      const confidence = this.clampNumber(group.confidence, 0, 1, 0.5);
      if (similarOnly && confidence < 0.75) continue;

      sourceMemoryIds.forEach((id) => usedIds.add(id));
      achievedReductionCount += sourceMemoryIds.length - 1;
      groups.push({
        ...memory,
        sourceMemoryIds,
        compressionMode,
        firstSeenAt,
        lastSeenAt,
        occurrenceCount,
        evidenceCount,
        confidence,
        rationale: this.cleanShortText(group.rationale, 500),
      });
    }

    const resultOutputCount = items.length - achievedReductionCount;
    const achievedReductionPercent =
      items.length === 0
        ? 0
        : Math.round((achievedReductionCount / items.length) * 1000) / 10;

    return {
      schemaVersion: 2,
      previewOnly: true,
      inputCount: items.length,
      targetReductionPercent,
      targetOutputCount,
      resultOutputCount,
      achievedReductionCount,
      achievedReductionPercent,
      targetReached: similarOnly
        ? true
        : achievedReductionCount >= requiredReductionCount,
      groups,
      ungroupedMemoryIds: items
        .map((item) => item.id)
        .filter((id) => !usedIds.has(id)),
    };
  }

  private normalizeAssistantMemoryCapsuleV2(
    value: unknown,
  ): ExtractAssistantMemoryCapsuleV2Response {
    const data = this.asRecord(value);
    const items = this.asArray(data.commitments)
      .map((item) => this.normalizePromiseItem(this.asRecord(item)))
      .filter((item): item is MemoryCapsulePromiseItem => !!item);
    const updates = this.asArray(data.commitmentUpdates)
      .map((item) => this.normalizePromiseUpdateItem(this.asRecord(item)))
      .filter((item): item is MemoryCapsulePromiseUpdateItem => !!item);
    const assistantMemory = this.asArray(data.assistantMemory)
      .map((item) =>
        this.normalizeAssistantMemoryCapsuleItemV2(this.asRecord(item)),
      )
      .filter((item): item is MemoryCapsuleAssistantMemoryItem => !!item)
      .slice(0, 10);
    const scheduledReminders = this.asArray(data.scheduledReminders)
      .map((item) => this.normalizeScheduledReminderItem(this.asRecord(item)))
      .filter((item): item is MemoryCapsuleScheduledReminderItem => !!item)
      .slice(0, 10);
    const scheduledReminderUpdates = this.asArray(data.scheduledReminderUpdates)
      .map((item) =>
        this.normalizeScheduledReminderUpdateItem(this.asRecord(item)),
      )
      .filter(
        (item): item is MemoryCapsuleScheduledReminderUpdateItem => !!item,
      )
      .slice(0, 10);
    return {
      schemaVersion: 2,
      assistantMemory,
      commitments: items,
      commitmentUpdates: updates,
      scheduledReminders,
      scheduledReminderUpdates,
    };
  }

  private normalizeDialogMemoryCapsuleV2(
    value: unknown,
    originalUserText: string,
    existingCatalogTagKeys: ReadonlySet<string> = new Set(),
  ): ExtractDialogMemoryCapsuleV2Response {
    const data = this.asRecord(value);
    const userData = this.asRecord(data.user);
    const assistantData = this.asRecord(data.assistant);
    const normalizedUser = this.normalizeUserMemoryCapsuleV2(
      {
        ...userData,
        userDigest: userData.text,
      },
      existingCatalogTagKeys,
    );
    const representation =
      userData.representation === 'verbatim' ? 'verbatim' : 'digest';
    const userCapsuleText =
      representation === 'verbatim'
        ? originalUserText
        : normalizedUser.userDigest || originalUserText;
    const normalizedAssistant = this.normalizeAssistantMemoryCapsuleV2({
      assistantMemory: assistantData.assistantMemory,
      commitments: data.commitments,
      commitmentUpdates: data.commitmentUpdates,
      scheduledReminders: data.scheduledReminders,
      scheduledReminderUpdates: data.scheduledReminderUpdates,
    });

    return {
      schemaVersion: 2,
      user: {
        representation,
        text: this.cleanShortText(userCapsuleText, 1800),
        tags: normalizedUser.tags,
        newTags: normalizedUser.newTags,
        importance: normalizedUser.importance,
        userMemory: normalizedUser.userMemory,
      },
      assistant: {
        assistantMemory: normalizedAssistant.assistantMemory,
        // Empty legacy fields keep already shipped V2 clients compatible.
        // Current clients persist only assistantMemory in the response capsule.
        continuationSummary: '',
        reflectionSummary: '',
      },
      commitments: normalizedAssistant.commitments,
      commitmentUpdates: normalizedAssistant.commitmentUpdates,
      scheduledReminders: normalizedAssistant.scheduledReminders,
      scheduledReminderUpdates: normalizedAssistant.scheduledReminderUpdates,
    };
  }

  private normalizeScheduledReminderItem(
    data: Record<string, unknown>,
  ): MemoryCapsuleScheduledReminderItem | null {
    const reminderKey = this.normalizeKey(data.reminderKey);
    const text = this.cleanShortText(data.text, 1000);
    const localDate = this.cleanShortText(data.localDate, 10);
    const localTime = this.cleanShortText(data.localTime, 5);
    if (
      !reminderKey ||
      !text ||
      !/^\d{4}-\d{2}-\d{2}$/.test(localDate) ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(localTime)
    ) {
      return null;
    }
    return { reminderKey, text, localDate, localTime };
  }

  private normalizeScheduledReminderUpdateItem(
    data: Record<string, unknown>,
  ): MemoryCapsuleScheduledReminderUpdateItem | null {
    const reminderKey = this.normalizeKey(data.reminderKey);
    if (!reminderKey || data.status !== 'cancelled') return null;
    return { reminderKey, status: 'cancelled' };
  }

  private normalizePromiseItem(
    data: Record<string, unknown>,
  ): MemoryCapsulePromiseItem | null {
    const validKinds: MemoryCapsulePromiseKind[] = [
      'promise',
      'ritual',
      'plan',
      'follow_up',
      'reminder',
      'monitoring',
      'style_rule',
      'other',
    ];
    const promiseKey = this.normalizeKey(data.promiseKey);
    const promiseKind = validKinds.find((item) => item === data.promiseKind);
    const topic = this.normalizeAssistantMemoryTopic(data.topic);
    const content = this.normalizeNemoryBrandReferences(
      this.cleanShortText(data.content, 500),
    );
    if (!promiseKey || !promiseKind || !topic || !content) return null;
    return {
      kind: 'promise',
      promiseKey,
      promiseKind,
      topic,
      content,
      importance: this.clampNumber(data.importance, 1, 5, 3),
      duration: data.duration === 'one_time' ? 'one_time' : 'ongoing',
      status: 'open',
      triggerTags: this.asArray(data.triggerTags)
        .map((tag) => this.normalizeKey(tag))
        .filter(Boolean),
    };
  }

  private normalizePromiseUpdateItem(
    data: Record<string, unknown>,
  ): MemoryCapsulePromiseUpdateItem | null {
    const promiseKey = this.normalizeKey(data.promiseKey);
    const validStatuses = ['fulfilled', 'cancelled', 'expired'] as const;
    const status = validStatuses.find((item) => item === data.status);
    if (!promiseKey || !status) return null;
    const content = this.normalizeNemoryBrandReferences(
      this.cleanShortText(data.content, 500),
    );
    return {
      kind: 'promise_update',
      promiseKey,
      status,
      ...(content ? { content } : {}),
    };
  }

  private normalizeMemoryCapsuleTag(value: unknown): MemoryCapsuleTag | null {
    const data = this.asRecord(value);
    const type =
      typeof data.type === 'string'
        ? (data.type as MemoryCapsuleTagType)
        : ('' as MemoryCapsuleTagType);
    const validTypes: MemoryCapsuleTagType[] = [
      'domain',
      'entity',
      'state',
      'mechanism',
      'thread',
    ];
    if (!validTypes.includes(type)) return null;
    const key = this.normalizeKey(data.key);
    if (!key || !key.startsWith(`${type}.`)) return null;
    return {
      key,
      type,
      confidence: this.clampNumber(data.confidence, 0, 1, 0.5),
    };
  }

  private normalizeNewMemoryTagV2(
    value: unknown,
  ): MemoryCapsuleNewTagV2 | null {
    const data = this.asRecord(value);
    const normalized = this.normalizeMemoryCapsuleTag({
      key: data.key,
      type: data.type,
      confidence: 0.8,
    });
    const label = this.cleanShortText(data.label, 160);
    const description = this.cleanShortText(data.description, 600);
    if (!normalized || !label || !description) return null;
    const aliases = this.asArray(data.aliases)
      .map((item) => this.normalizeKey(item))
      .filter(Boolean)
      .slice(0, 12);
    return {
      key: normalized.key,
      type: normalized.type,
      label,
      description,
      aliases: [...new Set(aliases)],
    };
  }

  private normalizePersonalTagCatalogV2(
    value: unknown,
    excludedKeys: ReadonlySet<string> = new Set(),
  ) {
    const data = this.asRecord(value);
    const normalizeGroup = (group: unknown) =>
      this.asArray(group)
        .map((item) => {
          const record = this.asRecord(item);
          const key = this.normalizeKey(record.key);
          const label = this.cleanShortText(record.label, 160);
          const description = this.cleanShortText(record.description, 600);
          if (!key || !label || !description || excludedKeys.has(key)) {
            return null;
          }
          const associatedDomains = [
            ...new Set(
              this.asArray(record.associatedDomains)
                .map((domain) => this.normalizeKey(domain))
                .filter((domain) => domain.startsWith('domain.')),
            ),
          ].slice(0, 12);
          return {
            key,
            label,
            description,
            aliases: this.asArray(record.aliases)
              .map((alias) => this.normalizeKey(alias))
              .filter(Boolean)
              .slice(0, 12),
            ...(record.distinctRecordCount !== undefined
              ? {
                  distinctRecordCount: Math.trunc(
                    this.clampNumber(
                      record.distinctRecordCount,
                      0,
                      1_000_000,
                      0,
                    ),
                  ),
                }
              : {}),
            ...(associatedDomains.length ? { associatedDomains } : {}),
          };
        })
        .filter(Boolean)
        .slice(0, 500);
    return {
      domains: normalizeGroup(data.domains),
      states: normalizeGroup(data.states),
      mechanisms: normalizeGroup(data.mechanisms),
      knownEntities: normalizeGroup(data.knownEntities),
      knownThreads: normalizeGroup(data.knownThreads),
    };
  }

  private buildThreadContinuityWarningsV2(
    result: Pick<ExtractUserMemoryCapsuleV2Response, 'tags' | 'newTags'>,
    personalTagCatalog: unknown,
  ) {
    const currentDomains = result.tags
      .filter((tag) => tag.type === 'domain')
      .map((tag) => tag.key);
    const currentDomainSet = new Set(currentDomains);
    const selectedThreads = new Set(
      result.tags.filter((tag) => tag.type === 'thread').map((tag) => tag.key),
    );
    const proposedThreads = result.newTags
      .filter((tag) => tag.type === 'thread')
      .map((tag) => tag.key);
    if (!currentDomains.length || !proposedThreads.length) return [];

    const catalog = this.asRecord(personalTagCatalog);
    const omittedStableThreads = this.asArray(catalog.knownThreads)
      .map((item) => this.asRecord(item))
      .filter(
        (item) =>
          this.clampNumber(item.distinctRecordCount, 0, 1_000_000, 0) >= 2,
      )
      .filter((item) => {
        const key = this.normalizeKey(item.key);
        if (!key || selectedThreads.has(key)) return false;
        return this.asArray(item.associatedDomains).some((domain) =>
          currentDomainSet.has(this.normalizeKey(domain)),
        );
      })
      .map((item) => this.normalizeKey(item.key))
      .filter(Boolean);
    if (!omittedStableThreads.length) return [];

    return [
      {
        currentDomains,
        proposedThreads,
        omittedStableThreads: [...new Set(omittedStableThreads)],
      },
    ];
  }

  private logThreadContinuityWarningsV2(
    traceId: string | undefined,
    warnings: Array<Record<string, unknown>>,
  ) {
    if (!warnings.length || process.env.NODE_ENV === 'production') return;
    const diagnostic = {
      traceId: traceId ?? null,
      warnings,
    };
    scheduleServerDebugTask(() => {
      this.logger?.warn(
        JSON.stringify({
          marker: 'NEMORY_MEMORY_THREAD_CONTINUITY_WARNING',
          ...diagnostic,
        }),
      );
    });
    writeFullServerDebugLog(
      'NEMORY_MEMORY_THREAD_CONTINUITY_WARNING',
      diagnostic,
    );
  }

  private getMemoryTagCatalogKeysV2(...catalogs: unknown[]): Set<string> {
    const keys = new Set<string>();
    const groupNames = [
      'domains',
      'states',
      'mechanisms',
      'knownEntities',
      'knownThreads',
    ];
    for (const catalog of catalogs) {
      const data = this.asRecord(catalog);
      for (const groupName of groupNames) {
        for (const item of this.asArray(data[groupName])) {
          const key = this.normalizeKey(this.asRecord(item).key);
          if (key) keys.add(key);
        }
      }
    }
    return keys;
  }

  private normalizeAssistantMemoryTopic(value: unknown): string {
    const validTopics = [
      'self',
      'work',
      'study',
      'relationships',
      'family',
      'health',
      'mental_health',
      'sleep',
      'habits',
      'productivity',
      'money',
      'creativity',
      'lifestyle',
      'values',
      'goals',
      'other',
    ];
    const normalized = this.normalizeKey(value);
    return validTopics.includes(normalized) ? normalized : '';
  }

  private normalizeAssistantMemoryCapsuleItemV2(
    data: Record<string, unknown>,
  ): MemoryCapsuleAssistantMemoryItem | null {
    const validKinds = [
      'insight',
      'focus_area',
      'agreed_direction',
      'strategy',
      'style_rule',
      'meta',
      'other',
    ] as const;
    const kind = validKinds.find((item) => item === data.kind);
    const topic = this.normalizeAssistantMemoryTopic(data.topic);
    const content = this.normalizeNemoryBrandReferences(
      this.cleanShortText(data.content, 700),
    );
    if (!kind || !topic || !content) return null;
    return {
      kind,
      topic,
      content,
      importance: this.clampNumber(data.importance, 1, 5, 3),
    };
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private asArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
  }

  private cleanShortText(value: unknown, max: number): string {
    return typeof value === 'string'
      ? value.replace(/\s+/g, ' ').trim().slice(0, max)
      : '';
  }

  private normalizeNemoryBrandReferences(value: string): string {
    return value.replace(
      /\u041d\u0435\u043c\u043e\u0440\u0456|\u041d\u0435\u043c\u043e\u0440\u0438|\u041d\u0435\u0439\u043c\u043e\u0440\u0456|\u041d\u0435\u0439\u043c\u043e\u0440\u0438|\u041d\u0435\u0439\u0442\u043e\u0440\u0438/giu,
      'Nemory',
    );
  }

  private cleanMemoryDigest(value: unknown): string {
    return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  }

  private normalizeKey(value: unknown): string {
    if (typeof value !== 'string') return '';
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '_')
      .replace(/^[_-]+|[_-]+$/g, '')
      .slice(0, 120);
  }

  private clampNumber(
    value: unknown,
    min: number,
    max: number,
    fallback: number,
  ): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
  }

  private isValidMemoryItem(
    item: ProposedMemoryItem,
  ): item is ProposedMemoryItem {
    if (!item || typeof item !== 'object') return false;
    if (typeof item.content !== 'string' || !item.content.trim()) return false;

    const validKinds: MemoryKind[] = [
      'fact',
      'preference',
      'goal',
      'pattern',
      'value',
      'strength',
      'vulnerability',
      'trigger',
      'coping_strategy',
      'boundary',
      'meta',
      'other',
    ];

    const validTopics: MemoryTopic[] = [
      'self',
      'work',
      'study',
      'relationships',
      'family',
      'health',
      'mental_health',
      'sleep',
      'habits',
      'productivity',
      'money',
      'creativity',
      'lifestyle',
      'values',
      'goals',
      'other',
    ];

    if (!validKinds.includes(item.kind)) return false;
    if (!validTopics.includes(item.topic)) return false;

    const importance = Number(item.importance);
    if (!Number.isFinite(importance)) return false;

    return true;
  }

  countOpenAiTokens(messages: OpenAiMessage[], aiModel: AiModel): number {
    const contentTokens = this.countIndividualStringTokens(
      messages.map((message) => message.content),
      aiModel,
    ).reduce((total, tokens) => total + tokens, 0);
    return contentTokens + messages.length * 3 + 3;
  }

  countStringTokens(texts: string[], aiModel: AiModel): number {
    return this.countIndividualStringTokens(texts, aiModel).reduce(
      (total, tokens) => total + tokens,
      0,
    );
  }

  private countIndividualStringTokens(
    texts: string[],
    aiModel: AiModel,
  ): number[] {
    if (MODEL_REGISTRY[aiModel]?.provider === AiProvider.ANTHROPIC) {
      return texts.map((text) => estimateNonOpenAiTokens([text]));
    }

    const tkModel = this.mapToTiktokenModel(aiModel);
    const enc = encoding_for_model(tkModel);
    try {
      return texts.map((text) => enc.encode(text).length);
    } finally {
      enc.free();
    }
  }
}
