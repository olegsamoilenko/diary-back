import { responseVisibleTokens } from '../utils/response-length';
import { ActiveMemoryCommitmentV2Dto } from '../dto/extract-assistant-memory-capsule-v2.dto';
import { NEMORY_COMMON_INSTRUCTIONS } from '../utils/journal-response-instructions';
import { buildNemoryCapabilitiesPrompt } from '../utils/nemory-capabilities';
import {
  periodicAnalysisBudgets,
  PERIODIC_HISTORY_STOP_REMAINING_TOKENS,
} from './periodic-analysis.budgets';
import {
  weeklyCapsuleSnapshot,
  yearlyCapsuleSnapshot,
} from './weekly-capsule-context';
import { TokenType } from 'src/tokens/types';
import { writeContextAudit } from 'src/logs/context-audit';
import {
  dailyCapsuleMessages,
  dailyCapsuleCompressionMessages,
  dailyCapsuleReductionPercent,
  dailyCapsuleProseBudget,
  parseDailyCapsule,
  dailySourceObservations,
  withDailySourceObservations,
} from './daily-capsule';
import { getModelPriceCredits } from 'src/plans/types/credits';
import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AiService, AiResponseRequest } from '../ai.service';
import { buildResponseSystemPrompt } from '../utils/response-system-prompt';
import {
  buildOpenAiPromptCacheKey,
  getGrowingPromptCacheMessageIndexes,
} from '../utils/openai-prompt-cache';
import { getResponseOutputTokenLimit } from '../utils/response-reasoning';
import { MODEL_REGISTRY } from '../types/providers';
import { AiCreditCycleService } from 'src/subscriptions/ai-credit-cycle.service';
import { SubscriptionUsageService } from 'src/subscriptions/subscription-usage.service';
import { UsersService } from 'src/users/users.service';
import { AiModel, normalizeAiModel } from 'src/users/types';
import type { OpenAiMessage } from '../types';
import { PeriodicAnalysisDto } from './periodic-analysis.dto';
import {
  buildPeriodicAnalysisTask,
  buildPeriodicAnalysisDialogTask,
} from './periodic-analysis.prompt';
import {
  analysisSourceHash,
  analysisLocalTime,
  localizeAnalysisInstants,
  HistoryCapsule,
  parseAnalysisResult,
  selectAnalysisHistory,
  validateAnalysisPeriod,
} from './periodic-analysis.context';

export type AnalysisStream = {
  signal: AbortSignal;
  onText: (text: string) => void;
};

export type SavedResult = {
  version: 1;
  promptVersion?: 2;
  text: string;
  capsule: string;
  briefMemory?: string;
  briefMemoryUpdatedAt?: string;
  briefMemoryThroughDialogId?: string;
  asOf: string;
  prompt: OpenAiMessage[];
  response: string;
  credits: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  capsuleGeneration?: {
    model: AiModel;
    status: 'ready' | 'over_budget' | 'failed';
    tokens?: number;
    sparseReason?: string;
    credits: number;
    attempts?: number;
    originalTokens?: number;
    reductionPercent?: number;
    maxTokens?: number;
    retryAboveTokens?: number;
    targetTokens?: number;
    characters?: number;
    maxCharacters?: number;
    targetCharacters?: number;
  };
  dialogs: {
    id: string;
    // Optional for compatibility with previously saved conversations.
    createdAt?: string;
    question: string;
    answer: string;
    raw: string;
    credits: number;
    inputTokens: number;
    cachedInputTokens: number;
    cacheWriteInputTokens: number;
    outputTokens: number;
    estimated: boolean;
  }[];
  dialogPending?: string;
  failedDialogs?: string[];
};

@Injectable()
export class PeriodicAnalysisService {
  constructor(
    private readonly ai: AiService,
    private readonly users: UsersService,
    private readonly cycles: AiCreditCycleService,
    private readonly subscriptionUsage: SubscriptionUsageService,
  ) {}

  private creationDate(value?: string): Date {
    const date = new Date(value ?? Date.now());
    if (!Number.isFinite(date.getTime()))
      throw new BadRequestException('Invalid creation time');
    return date;
  }

  // Legacy read routes expose no server content. The device owns the reports.
  get(_userId: number, _id: string): Promise<never> {
    return Promise.reject(new GoneException('ANALYSIS_LOCAL_ONLY'));
  }
  list(_userId: number, end: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(end)) throw new BadRequestException();
    return Promise.resolve([]);
  }
  private history(dto: PeriodicAnalysisDto) {
    const history: HistoryCapsule[] = [];
    let candidates = (dto.previousAnalyses ?? []).filter(
      (row) =>
        (!['week', 'year'].includes(dto.kind) || row.kind === dto.kind) &&
        row.capsule.trim() &&
        row.timezone === dto.timezone &&
        row.start <= row.end &&
        Date.parse(row.createdAt) <= Date.parse(dto.asOf),
    );
    candidates.sort(
      (a, b) =>
        b.end.localeCompare(a.end) || b.createdAt.localeCompare(a.createdAt),
    );
    if (dto.kind === 'day') {
      const days = candidates.filter(
        (row) => row.kind === 'day' && row.end < dto.start,
      );
      const oldestDay = days.reduce(
        (start, row) => (row.start < start ? row.start : start),
        dto.start,
      );
      // Keep daily detail. Weeks are older background, never replacements
      // for available days or fillers overlapping the daily history span.
      candidates = [
        ...days,
        ...candidates.filter(
          (row) => row.kind === 'week' && row.end < oldestDay,
        ),
      ];
    }
    for (const row of selectAnalysisHistory(
      candidates,
      dto.start,
      Number.MAX_SAFE_INTEGER,
    )) {
      const capsule = {
        start: row.start,
        end: row.end,
        kind: row.kind,
        capsule: row.capsule,
      };
      history.push(capsule);
    }
    return history;
  }

  private async analysisMessages(
    userId: number,
    user: NonNullable<Awaited<ReturnType<UsersService['findById']>>>,
    dto: PeriodicAnalysisDto,
    model: AiModel,
  ) {
    const plan = await this.subscriptionUsage.getEffectiveAiBasePlanId(userId);
    const budgets = periodicAnalysisBudgets(plan);
    const visibleTokens = responseVisibleTokens(plan, dto.kind);
    const capsulePolicy = {
      day: budgets.dayCapsule,
      week: budgets.weekCapsule,
      month: budgets.monthCapsule,
      year: budgets.yearCapsule,
    }[dto.kind];
    const weekSnapshot =
      dto.kind === 'week' ? weeklyCapsuleSnapshot(dto) : null;
    const yearSnapshot =
      dto.kind === 'year' ? yearlyCapsuleSnapshot(dto) : null;
    const snapshot = localizeAnalysisInstants(
      weekSnapshot ?? yearSnapshot ?? dto.snapshot,
      dto.timezone,
    );
    const contextMessage = (history: HistoryCapsule[]): OpenAiMessage => ({
      role: 'user',
      content: JSON.stringify({
        activeCommitments: dto.activeCommitments ?? [],
        kind: dto.kind,
        start: dto.start,
        end: dto.end,
        timezone: dto.timezone,
        asOf: dto.asOf,
        language: user.settings.conversationLanguage,
        snapshot,
        note: dto.note ?? '',
        previousAnalyses: history,
      }),
    });
    const candidates = this.history(dto);
    const contextTokenLimit = budgets.context[dto.kind];
    const currentPeriodTokens = this.ai.countOpenAiTokens(
      [contextMessage([])],
      model,
    );
    const overBudget =
      contextTokenLimit !== null && currentPeriodTokens > contextTokenLimit;
    const history: HistoryCapsule[] = [];
    let contextTokens = currentPeriodTokens;
    if (!overBudget) {
      for (const candidate of candidates) {
        if (
          contextTokenLimit !== null &&
          contextTokenLimit - contextTokens <
            PERIODIC_HISTORY_STOP_REMAINING_TOKENS
        )
          break;
        // Keep the last prior-period capsule whole, even when it crosses the
        // nominal ceiling. The next iteration stops without looking for a fit.
        history.push(candidate);
        contextTokens = this.ai.countOpenAiTokens(
          [contextMessage(history)],
          model,
        );
      }
    }
    writeContextAudit('period.context.selection', {
      traceId: dto.requestId,
      kind: dto.kind,
      start: dto.start,
      end: dto.end,
      contextTokenLimit,
      currentPeriodTokens,
      contextTokens,
      selectionStopRemainingTokens: PERIODIC_HISTORY_STOP_REMAINING_TOKENS,
      contextOverageTokens:
        contextTokenLimit === null
          ? 0
          : Math.max(0, contextTokens - contextTokenLimit),
      status: overBudget ? 'current_period_over_budget' : 'ready',
      excludedPreviousPeriods: candidates.slice(history.length).map((row) => ({
        kind: row.kind,
        start: row.start,
        end: row.end,
        reason: overBudget ? 'current_period_over_budget' : 'context_budget',
      })),
      previousPeriods: history.map((row) => ({
        kind: row.kind,
        start: row.start,
        end: row.end,
      })),
      ...(weekSnapshot
        ? {
            coverage: weekSnapshot.dailyCapsules.map((row) => row.start),
            missingDays: weekSnapshot.missingDays,
          }
        : {}),
      ...(yearSnapshot
        ? {
            coverage: yearSnapshot.monthlyCapsules.map((row) => row.start),
            missingMonths: yearSnapshot.missingMonths,
          }
        : {}),
    });
    if (overBudget) throw new BadRequestException('ANALYSIS_CONTEXT_LIMIT');
    const messages: OpenAiMessage[] = [
      {
        role: 'system',
        content: await this.systemPrompt(userId, user, dto, visibleTokens),
      },
      contextMessage(history),
    ];
    return { messages, capsulePolicy, visibleTokens };
  }
  private async systemPrompt(
    userId: number,
    user: NonNullable<Awaited<ReturnType<UsersService['findById']>>>,
    dto: PeriodicAnalysisDto,
    visibleTokens = responseVisibleTokens(null, dto.kind),
  ) {
    return buildResponseSystemPrompt({
      mode: 'entry',
      sharedBlocks: { developerMarker: false },
      userName: user.name,
      timeContext: {
        timeZone: dto.timezone,
        nowLocalText: analysisLocalTime(dto.asOf, dto.timezone),
        locale: user.settings.conversationLanguage,
      },
      aboutMe: '',
      metricsBlock: '',
      goalsPrompt: '',
      // This task owns its length limits; retain the user's qualitative style.
      stylesBlock: await this.ai.getStylesBlock(userId, 'entry', {
        includeLengthExecution: false,
        compact: 'minimal',
      }),
      languageBlock: this.ai.buildLanguageBlock(
        user.settings.conversationLanguage,
        { compact: true },
      ),
      dialogResponseDiscipline: '',
      isFirstEntry: false,
      generateShortReflection: false,
      task: buildPeriodicAnalysisTask(dto.kind, visibleTokens),
    });
  }

  // Domain adapter only: provider dispatch, cancellation and billing live in AiService.executeResponse.
  private responseRequest({
    userId,
    model,
    messages,
    reportId,
    requestId,
    outputLimit,
    mode,
    stream,
    kind,
  }: {
    userId: number;
    model: AiModel;
    messages: OpenAiMessage[];
    reportId: string;
    requestId: string;
    outputLimit: number;
    kind: PeriodicAnalysisDto['kind'];
    mode: 'entry' | 'dialog';
    stream?: AnalysisStream;
  }): AiResponseRequest {
    return {
      userId,
      model,
      mode,
      messages,
      response: {
        format: mode === 'entry' ? 'json' : 'text',
        stream: true,
        textField: mode === 'entry' ? 'text' : undefined,
      },
      onToken: stream?.onText ?? (() => {}),
      cache: {
        key: buildOpenAiPromptCacheKey({
          modelId: MODEL_REGISTRY[model].providerModelId,
          scope: 'period-analysis',
          userId,
          resourceId: reportId,
        }),
        openAiPrefix: messages[0].content,
        anthropicPrefix: messages[0].content,
        messageIndexes: getGrowingPromptCacheMessageIndexes(messages, 1),
      },
      runtime: {
        signal: stream?.signal,
        outputLimit,
        outputPurpose: 'tier_response',
      },
      accounting: {
        traceId: requestId,
        operation:
          mode === 'entry'
            ? 'generate_periodic_analysis_response'
            : 'generate_periodic_analysis_dialog_response',
        tokenType:
          mode === 'dialog'
            ? {
                day: TokenType.DAILY_ANALYSIS_DIALOG,
                week: TokenType.WEEKLY_ANALYSIS_DIALOG,
                month: TokenType.MONTHLY_ANALYSIS_DIALOG,
                year: TokenType.YEARLY_ANALYSIS_DIALOG,
              }[kind]
            : kind === 'day'
              ? TokenType.DAILY_ANALYSIS
              : kind === 'week'
                ? TokenType.WEEKLY_ANALYSIS
                : kind === 'year'
                  ? TokenType.YEARLY_ANALYSIS
                  : TokenType.MONTHLY_ANALYSIS,
        cycleComplete: mode === 'dialog',
        promptMessages: messages.map((message) => message.content),
      },
    };
  }

  private dailyEvidence(dto: PeriodicAnalysisDto) {
    const text =
      dto.kind === 'day'
        ? dailySourceObservations(dto.snapshot, dto.timezone)
        : '';
    return {
      text,
      tokens: text
        ? this.ai.countStringTokens([text], AiModel.GPT_5_6_LUNA)
        : 0,
    };
  }

  async estimate(userId: number, dto: PeriodicAnalysisDto) {
    if (dto.expectedUserId !== userId)
      throw new ConflictException('Analysis account changed');
    validateAnalysisPeriod(dto);
    const user = await this.users.findById(userId, ['settings']);
    if (!user) throw new NotFoundException();
    const model = normalizeAiModel(user.settings.aiModel);
    const { messages, capsulePolicy, visibleTokens } =
      await this.analysisMessages(userId, user, dto, model);
    const inputTokens = this.ai.countOpenAiTokens(messages, model);
    const outputLimit = getResponseOutputTokenLimit(
      MODEL_REGISTRY[model].providerModelId,
      visibleTokens,
      'tier_response',
    );
    const rates = getModelPriceCredits(model, inputTokens);
    let estimatedMaxCredits =
      Math.ceil(
        (inputTokens * Math.max(rates.inPer1M, rates.cacheWriteInPer1M)) /
          1000000,
      ) + Math.ceil((outputLimit * rates.outPer1M) / 1000000);
    const evidence = this.dailyEvidence(dto);
    const capsuleInput =
      this.ai.countOpenAiTokens(
        dailyCapsuleMessages(messages, '', evidence, capsulePolicy),
        AiModel.GPT_5_6_LUNA,
      ) + outputLimit;
    const capsuleRates = getModelPriceCredits(
      AiModel.GPT_5_6_LUNA,
      capsuleInput,
    );
    estimatedMaxCredits +=
      Math.ceil((capsuleInput * capsuleRates.inPer1M) / 1000000) +
      Math.ceil((capsulePolicy.outputLimit * capsuleRates.outPer1M) / 1000000);
    // Maximum includes one conditional compression of the generated capsule only.
    const retryInput =
      this.ai.countOpenAiTokens(
        dailyCapsuleCompressionMessages(
          '',
          capsulePolicy.outputLimit,
          evidence,
          capsulePolicy,
        ),
        AiModel.GPT_5_6_LUNA,
      ) +
      capsulePolicy.outputLimit +
      evidence.tokens;
    const retryRates = getModelPriceCredits(AiModel.GPT_5_6_LUNA, retryInput);
    estimatedMaxCredits +=
      Math.ceil((retryInput * retryRates.inPer1M) / 1000000) +
      Math.ceil((capsulePolicy.outputLimit * retryRates.outPer1M) / 1000000);
    return {
      model,
      inputTokens,
      outputLimit,
      estimatedMaxCredits,
      sourceHash: analysisSourceHash(dto, model),
    };
  }

  async generate(
    userId: number,
    dto: PeriodicAnalysisDto,
    stream?: AnalysisStream,
  ) {
    stream?.signal.throwIfAborted();
    const createdAt = this.creationDate(dto.createdAt);
    if (dto.expectedUserId !== userId)
      throw new ConflictException('Analysis account changed');
    validateAnalysisPeriod(dto);
    const user = await this.users.findById(userId, ['settings']);
    if (!user) throw new NotFoundException();
    const model = normalizeAiModel(user.settings.aiModel);
    const {
      messages: prompt,
      capsulePolicy,
      visibleTokens,
    } = await this.analysisMessages(userId, user, dto, model);
    stream?.signal.throwIfAborted();
    if (!(await this.cycles.claimExecution(userId, dto.requestId)))
      throw new ConflictException('ANALYSIS_REQUEST_ALREADY_STARTED');
    const generated = await this.ai.executeResponse(
      this.responseRequest({
        userId,
        model,
        messages: prompt,
        reportId: dto.requestId,
        requestId: dto.requestId,
        outputLimit: visibleTokens,
        mode: 'entry',
        kind: dto.kind,
        stream,
      }),
    );
    if (
      generated.finishReason === 'length' ||
      generated.finishReason === 'max_tokens'
    )
      throw new Error('Incomplete analysis');
    const content = parseAnalysisResult(generated.fullText, dto.kind, true);
    const result: SavedResult = {
      version: 1,
      promptVersion: 2,
      ...content,
      asOf: dto.asOf,
      prompt,
      response: generated.fullText,
      credits: generated.credits,
      inputTokens: generated.inputTokens,
      cachedInputTokens: generated.cachedInputTokens,
      outputTokens: generated.outputTokens,
      dialogs: [],
    };
    await this.generateCapsule({
      userId,
      dto,
      prompt,
      capsulePolicy,
      result,
      stream,
    });
    return {
      id: dto.requestId,
      kind: dto.kind,
      start: dto.start,
      end: dto.end,
      timezone: dto.timezone,
      sourceHash: analysisSourceHash(dto, model),
      model,
      status: 'completed' as const,
      createdAt: createdAt.toISOString(),
      ...result,
    };
  }

  private weekCapsuleSource(dto: PeriodicAnalysisDto): OpenAiMessage[] {
    return [
      {
        role: 'user',
        content: JSON.stringify({
          kind: dto.kind,
          start: dto.start,
          end: dto.end,
          timezone: dto.timezone,
          asOf: dto.asOf,
          snapshot: weeklyCapsuleSnapshot(dto),
        }),
      },
    ];
  }

  /** A new paid capsule-only attempt; no main response or server report storage. */
  async regenerateWeeklyCapsule(userId: number, dto: PeriodicAnalysisDto) {
    if (dto.expectedUserId !== userId)
      throw new ConflictException('Analysis account changed');
    if (dto.kind !== 'week')
      throw new BadRequestException('WEEK_CAPSULE_REQUIRED');
    validateAnalysisPeriod(dto);
    const prompt = this.weekCapsuleSource(dto);
    const user = await this.users.findById(userId, ['settings']);
    if (!user) throw new NotFoundException();
    const capsulePolicy = periodicAnalysisBudgets(
      await this.subscriptionUsage.getEffectiveAiBasePlanId(userId),
    ).weekCapsule;
    if (!(await this.cycles.claimExecution(userId, dto.requestId)))
      throw new ConflictException('ANALYSIS_REQUEST_ALREADY_STARTED');
    const result: SavedResult = {
      version: 1,
      text: '',
      capsule: '',
      asOf: dto.asOf,
      prompt: [],
      response: '',
      credits: 0,
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      dialogs: [],
    };
    await this.generateCapsule({ userId, dto, prompt, capsulePolicy, result });
    return {
      requestId: dto.requestId,
      capsule: result.capsule,
      capsuleGeneration: result.capsuleGeneration,
      credits: result.credits,
      inputTokens: result.inputTokens,
      cachedInputTokens: result.cachedInputTokens,
      outputTokens: result.outputTokens,
    };
  }

  private async generateCapsule({
    userId,
    dto,
    prompt,
    capsulePolicy,
    result,
    stream,
  }: {
    userId: number;
    dto: PeriodicAnalysisDto;
    prompt: OpenAiMessage[];
    capsulePolicy: import('./periodic-analysis.budgets').CapsulePolicy;
    result: SavedResult;
    stream?: AnalysisStream;
  }) {
    // Main answer is already available in this request. An auxiliary failure must not lose it.
    const evidence = this.dailyEvidence(dto);
    const acceptCompletedRetry = dto.kind === 'day';
    const retryThreshold =
      capsulePolicy.retryAboveTokens ?? capsulePolicy.maximum;
    const periodLabel = {
      day: 'daily',
      week: 'weekly',
      month: 'monthly',
      year: 'yearly',
    }[dto.kind];
    const policyLimits =
      capsulePolicy.unit === 'characters'
        ? {
            maxCharacters: capsulePolicy.maximum,
            targetCharacters: capsulePolicy.target,
          }
        : {
            maxTokens: capsulePolicy.maximum,
            targetTokens: capsulePolicy.target,
            ...(capsulePolicy.retryAboveTokens !== undefined
              ? { retryAboveTokens: capsulePolicy.retryAboveTokens }
              : {}),
          };
    let capsuleCredits = 0;
    let attempts = 0;
    let selectedPass: number | null = null;
    let originalTokens: number | undefined;
    let reductionPercent: number | undefined;
    let capsuleError: string | undefined;
    const passes: {
      attempt: number;
      operation: string;
      capsule?: string;
      tokens?: number;
      rawResponse?: string;
      generatedCapsule?: string;
      inputTokens?: number;
      outputTokens?: number;
      credits?: number;
      finishReason?: string | null;
    }[] = [];
    const runCapsulePass = async (
      capsulePrompt: OpenAiMessage[],
      operation: string,
    ) => {
      stream?.signal.throwIfAborted();
      attempts++;
      const pass: (typeof passes)[number] = { attempt: attempts, operation };
      passes.push(pass);
      const compressed = await this.ai.executeResponse({
        userId,
        model: AiModel.GPT_5_6_LUNA,
        mode: 'entry',
        messages: capsulePrompt,
        response: { format: 'json', stream: false },
        onToken: () => {},
        runtime: {
          signal: stream?.signal,
          outputLimit: capsulePolicy.outputLimit,
        },
        accounting: {
          traceId: dto.requestId,
          operation,
          tokenType: {
            day: TokenType.DAILY_CAPSULE,
            week: TokenType.WEEKLY_CAPSULE,
            month: TokenType.MONTHLY_CAPSULE,
            year: TokenType.YEARLY_CAPSULE,
          }[dto.kind],
          cycleComplete: false,
          promptMessages: capsulePrompt.map((message) => message.content),
        },
      });
      capsuleCredits += compressed.credits;
      result.credits += compressed.credits;
      result.inputTokens += compressed.inputTokens;
      result.cachedInputTokens += compressed.cachedInputTokens;
      result.outputTokens += compressed.outputTokens;
      Object.assign(pass, {
        rawResponse: compressed.fullText,
        inputTokens: compressed.inputTokens,
        outputTokens: compressed.outputTokens,
        credits: compressed.credits,
        finishReason: compressed.finishReason,
      });
      const { capsule: generatedCapsule, sparseReason, briefMemory } = parseDailyCapsule(
        compressed.fullText,
        compressed.finishReason,
      );
      if (dto.kind === 'day' && attempts === 1 && briefMemory !== undefined) {
        result.briefMemory = briefMemory;
        result.briefMemoryUpdatedAt = dto.createdAt ?? dto.asOf;
        writeContextAudit('capsule.day.brief', {
          traceId: dto.requestId, start: dto.start, briefMemory,
          tokens: this.ai.countStringTokens([briefMemory], AiModel.GPT_5_6_LUNA),
        });
      }
      const capsule = withDailySourceObservations(generatedCapsule, evidence);
      const tokens = this.ai.countStringTokens([capsule], AiModel.GPT_5_6_LUNA);
      Object.assign(pass, {
        capsule,
        tokens,
        ...(evidence.text ? { generatedCapsule } : {}),
      });
      delete pass.rawResponse; // Valid text is already present in full as capsule.
      writeContextAudit(
        attempts === 1
          ? `capsule.${dto.kind}.extracted`
          : `capsule.${dto.kind}.compressed`,
        {
          traceId: dto.requestId,
          start: dto.start,
          end: dto.end,
          timezone: dto.timezone,
          asOf: dto.asOf,
          capsule,
          ...(evidence.text
            ? { generatedCapsule, fixedEvidenceTokens: evidence.tokens }
            : {}),
          tokens,
          sparseReason,
          model: AiModel.GPT_5_6_LUNA,
          attempt: attempts,
          ...(reductionPercent ? { reductionPercent } : {}),
        },
      );
      return {
        capsule,
        tokens,
        sparseReason,
        size: capsulePolicy.unit === 'characters' ? capsule.length : tokens,
      };
    };
    try {
      const selected = await runCapsulePass(
        dailyCapsuleMessages(
          dto.kind === 'week' ? this.weekCapsuleSource(dto) : prompt,
          dto.kind === 'week' ? '' : result.text,
          evidence,
          capsulePolicy,
        ),
        `generate_${periodLabel}_analysis_capsule`,
      );
      // Keep the first complete result before attempting any further paid work.
      result.capsule = selected.capsule;
      selectedPass = 1;
      originalTokens = selected.tokens;
      result.capsuleGeneration = {
        model: AiModel.GPT_5_6_LUNA,
        status: selected.size <= retryThreshold ? 'ready' : 'over_budget',
        tokens: selected.tokens,
        ...(selected.sparseReason
          ? { sparseReason: selected.sparseReason }
          : {}),
        credits: capsuleCredits,
      };
      if (
        !acceptCompletedRetry &&
        selected.size > retryThreshold &&
        evidence.tokens >= capsulePolicy.maximum
      ) {
        writeContextAudit(`capsule.${dto.kind}.compression_skipped`, {
          traceId: dto.requestId,
          reason: 'Fixed source observations alone fill the capsule budget',
          fixedEvidenceTokens: evidence.tokens,
        });
      } else if (selected.size > retryThreshold) {
        reductionPercent = dailyCapsuleReductionPercent(
          selected.size,
          evidence,
          capsulePolicy,
        );
        writeContextAudit(`capsule.${dto.kind}.compression_requested`, {
          traceId: dto.requestId,
          originalTokens,
          reductionPercent,
          reductionBasis: 'prose_excluding_fixed_observations',
          fixedEvidenceTokens: evidence.tokens,
          proseBudget: dailyCapsuleProseBudget(evidence, capsulePolicy),
          ...policyLimits,
        });
        const retry = await runCapsulePass(
          dailyCapsuleCompressionMessages(
            selected.capsule,
            selected.size,
            evidence,
            capsulePolicy,
          ),
          `compress_${periodLabel}_analysis_capsule`,
        );
        // A valid shorter weekly retry remains useful even above the writing goal.
        // Daily retries retain their separately agreed unconditional acceptance.
        if (
          acceptCompletedRetry ||
          (dto.kind === 'week'
            ? retry.size < selected.size
            : retry.size <= capsulePolicy.maximum)
        ) {
          result.capsule = retry.capsule;
          selectedPass = 2;
          result.capsuleGeneration = {
            model: AiModel.GPT_5_6_LUNA,
            status: retry.size <= retryThreshold ? 'ready' : 'over_budget',
            tokens: retry.tokens,
            ...(retry.sparseReason ? { sparseReason: retry.sparseReason } : {}),
            credits: capsuleCredits,
          };
        }
      }
    } catch (error) {
      capsuleError =
        error instanceof Error ? error.message : 'Capsule generation failed';
      // Invalid/failed retry must not replace the first complete capsule with an empty value.
      result.capsuleGeneration ??= {
        model: AiModel.GPT_5_6_LUNA,
        status: 'failed',
        credits: capsuleCredits,
      };
      writeContextAudit(
        result.capsule
          ? `capsule.${dto.kind}.compression_failed`
          : `capsule.${dto.kind}.failed`,
        {
          traceId: dto.requestId,
          error:
            error instanceof Error
              ? error.message
              : 'Capsule generation failed',
        },
      );
    } finally {
      if (result.capsuleGeneration) {
        Object.assign(result.capsuleGeneration, {
          credits: capsuleCredits,
          attempts,
          ...policyLimits,
          ...(capsulePolicy.unit === 'characters'
            ? { characters: result.capsule.length }
            : {}),
          ...(originalTokens !== undefined ? { originalTokens } : {}),
          ...(reductionPercent !== undefined ? { reductionPercent } : {}),
        });
        writeContextAudit(`capsule.${dto.kind}.saved`, {
          traceId: dto.requestId,
          start: dto.start,
          end: dto.end,
          timezone: dto.timezone,
          capsule: result.capsule,
          ...result.capsuleGeneration,
        });
        const firstTokens = passes[0]?.tokens;
        const secondTokens = passes[1]?.tokens;
        const comparison = {
          traceId: dto.requestId,
          period: { start: dto.start, end: dto.end, timezone: dto.timezone },
          requestedReductionPercent: reductionPercent ?? null,
          reductionBasis: 'prose_excluding_fixed_observations',
          fixedEvidenceTokens: evidence.tokens,
          actualProseTokenReductionPercent:
            firstTokens &&
            firstTokens > evidence.tokens &&
            secondTokens !== undefined
              ? Math.round(
                  (1 -
                    Math.max(0, secondTokens - evidence.tokens) /
                      (firstTokens - evidence.tokens)) *
                    1000,
                ) / 10
              : null,
          actualTokenReductionPercent:
            firstTokens && secondTokens !== undefined
              ? Math.round((1 - secondTokens / firstTokens) * 1000) / 10
              : null,
          firstPass: passes[0] ?? null,
          secondPass: passes[1] ?? null,
          selectedPass,
          status: result.capsuleGeneration.status,
          capsuleCredits,
          error: capsuleError ?? null,
          semanticPreservation:
            'Not automatically verified: compare facts, dates, actions, feelings, measurements, commitments and attribution in both full texts.',
        };
        writeContextAudit(`capsule.${dto.kind}.comparison`, comparison);
        if (process.env.NODE_ENV === 'development') {
          try {
            // Stringify explicitly so the console does not truncate nested capsule text.
            console.log(
              `NEMORY_${periodLabel.toUpperCase()}_CAPSULE_COMPARISON\n` +
                JSON.stringify(comparison, null, 2),
            );
          } catch {
            /* Console diagnostics must not discard the generated report. */
          }
        }
      }
      this.ai.completeAiPromptUsageCycle(
        dto.requestId,
        `${periodLabel}_analysis_with_capsule`,
      );
    }
  }

  async dialog(
    userId: number,
    id: string,
    requestId: string,
    question: string,
    stream?: AnalysisStream,
    requestedCreatedAt?: string,
    context?: LocalAnalysisReport,
    activeCommitments?: ActiveMemoryCommitmentV2Dto[],
  ) {
    const createdAt = this.creationDate(requestedCreatedAt).toISOString();
    const report = validateLocalAnalysisReport(context, id);
    const saved = {
      ...report,
      dialogs: report.dialogs.map((turn) => ({ ...turn })),
    };
    const previous = saved.dialogs.find((turn) => turn.id === requestId);
    if (previous) {
      if (previous.question !== question)
        throw new ConflictException('Request ID already used');
      return report;
    }
    const visibleTokens = responseVisibleTokens(
      await this.subscriptionUsage.getEffectiveAiBasePlanId(userId),
      'dialog',
    );
    // Replay each question with its original time, exactly as initially sent.
    // A changing system message would be hoisted before history by Claude.
    const followUpQuestion = (text: string, at?: string): OpenAiMessage => ({
      role: 'user',
      content: at
        ? `Current follow-up time: ${at}. Time zone: ${report.timezone}. The original analysis concerns ${report.start} through ${report.end}; its context was collected as of ${saved.asOf}. Anchor today/yesterday/tomorrow to this follow-up, not to the original report. No fresh measurements or period context are implied.\n\n${text}`
        : text,
    });
    const messages: OpenAiMessage[] = [
      ...saved.prompt,
      // Saved reports keep their original prompt. Apply the current role to old
      // reports at request time without rewriting the user's stored history.
      ...(saved.prompt.some(
        (message) =>
          message.role === 'system' &&
          message.content.includes(NEMORY_COMMON_INSTRUCTIONS),
      )
        ? []
        : [
            {
              role: 'system' as const,
              content: [
                'For this follow-up, the following psychological role and reasoning instructions supersede any conflicting earlier role or restrictions on grounded hypotheses. Answer the latest question substantively; do not repeat the original period analysis.',
                NEMORY_COMMON_INSTRUCTIONS,
              ].join('\n\n'),
            },
          ]),
      ...(saved.prompt.some(
        (message) =>
          message.role === 'system' &&
          message.content.includes(buildNemoryCapabilitiesPrompt()),
      )
        ? []
        : [
            {
              role: 'system' as const,
              content:
                'The current app capabilities below supersede earlier capability instructions for this follow-up.\n' +
                buildNemoryCapabilitiesPrompt(),
            },
          ]),
      // Old saved prompts require JSON for follow-ups. Keep their original prefix,
      // but override the response contract without rewriting historical data.
      ...(saved.promptVersion === 2
        ? []
        : [
            {
              role: 'system' as const,
              content:
                'For this follow-up, answer the user question in plain text only. Do not return JSON or repeat the capsule. Do not treat earlier AI interpretations as new facts.',
            },
          ]),
      {
        role: 'system',
        content: buildPeriodicAnalysisDialogTask(report.kind, visibleTokens),
      },
      { role: 'assistant', content: saved.response },
      ...saved.dialogs
        .filter(
          (turn) =>
            !turn.createdAt ||
            Date.parse(turn.createdAt) <= Date.parse(createdAt),
        )
        .flatMap((turn) => [
          followUpQuestion(turn.question, turn.createdAt),
          { role: 'assistant' as const, content: turn.raw },
        ]),
      ...(activeCommitments
        ? [
            {
              role: 'user' as const,
              content:
                'CURRENT ACTIVE NEMORY COMMITMENTS (supersede older commitment lists):\n' +
                JSON.stringify(activeCommitments),
            },
          ]
        : []),
      followUpQuestion(question, createdAt),
    ];
    if (JSON.stringify(messages).length > 100000)
      throw new BadRequestException('Dialog context limit reached');
    stream?.signal.throwIfAborted();
    if (!(await this.cycles.claimExecution(userId, requestId)))
      throw new ConflictException('ANALYSIS_REQUEST_ALREADY_STARTED');
    const generated = await this.ai.executeResponse(
      this.responseRequest({
        userId,
        model: report.model as AiModel,
        messages,
        reportId: id,
        requestId,
        outputLimit: visibleTokens,
        mode: 'dialog',
        kind: report.kind,
        stream,
      }),
    );
    if (
      generated.finishReason === 'length' ||
      generated.finishReason === 'max_tokens'
    )
      throw new Error('Incomplete dialog');
    const answer = generated.fullText.trim();
    if (!answer) throw new BadRequestException('Empty dialog response');
    saved.dialogs.push({
      id: requestId,
      createdAt,
      question,
      answer,
      raw: generated.fullText,
      credits: generated.credits,
      inputTokens: generated.inputTokens,
      cachedInputTokens: generated.cachedInputTokens,
      cacheWriteInputTokens: generated.cacheWriteInputTokens,
      outputTokens: generated.outputTokens,
      estimated: generated.estimated,
    });
    delete saved.dialogPending;
    return saved;
  }
}

export type LocalAnalysisReport = SavedResult & {
  id: string;
  kind: PeriodicAnalysisDto['kind'];
  start: string;
  end: string;
  timezone: string;
  sourceHash: string;
  model: string;
  status: 'completed';
  createdAt: string;
};

function validateLocalAnalysisReport(
  value: LocalAnalysisReport | undefined,
  id: string,
): LocalAnalysisReport {
  if (!value) throw new BadRequestException('LOCAL_ANALYSIS_CONTEXT_REQUIRED');
  const isMessage = (message: OpenAiMessage) =>
    message &&
    ['system', 'user', 'assistant'].includes(message.role) &&
    typeof message.content === 'string';
  if (
    value.id !== id ||
    value.status !== 'completed' ||
    !['day', 'week', 'month', 'year'].includes(value.kind) ||
    !Object.hasOwn(MODEL_REGISTRY, value.model) ||
    ![value.start, value.end].every(
      (day) => typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day),
    ) ||
    typeof value.timezone !== 'string' ||
    !Number.isFinite(Date.parse(value.asOf)) ||
    !Array.isArray(value.prompt) ||
    value.prompt.length < 2 ||
    !value.prompt.every(isMessage) ||
    typeof value.response !== 'string' ||
    !Array.isArray(value.dialogs) ||
    !value.dialogs.every(
      (turn) =>
        turn &&
        typeof turn.id === 'string' &&
        typeof turn.question === 'string' &&
        typeof turn.answer === 'string' &&
        typeof turn.raw === 'string' &&
        (!turn.createdAt || Number.isFinite(Date.parse(turn.createdAt))),
    )
  )
    throw new BadRequestException('Invalid local analysis context');
  return value;
}
