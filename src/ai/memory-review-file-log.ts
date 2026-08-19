import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { encoding_for_model } from 'tiktoken';

export type MemoryReviewUsage = {
  tokens: number;
  credits: number;
};

export type MemoryReviewSection = {
  label: string;
  value: unknown;
  count?: number;
  usage?: MemoryReviewUsage;
  /** Exact text sent to the model. Used only for deferred o200k counting. */
  tokenText?: string;
  /** Diagnostic duplicate of an existing provider payload; not separately billed. */
  excludeFromUsage?: boolean;
};

export type MemoryReviewStep = {
  step: 1 | 2 | 3 | 4;
  title: string;
  sourceType:
    | 'entry'
    | 'checkin'
    | 'dialog'
    | 'checkin_dialog'
    | 'consolidation';
  traceId?: string;
  branch?: MemoryReviewBranch;
  sections: MemoryReviewSection[];
};

export type MemoryReviewBranch = 'embeddings' | 'tags';

export type MemoryReviewPromptAccounting = {
  source: 'backend';
  tokenizer: 'o200k_base' | 'anthropic_estimate';
  parts: Array<{
    label: string;
    characters: number;
    tokens: number;
  }>;
  adjustments: {
    sectionBoundaryTokens: number;
    messageEnvelopeTokens: number;
    providerReconciliationTokens: number;
  };
  totals: {
    partsTokens: number;
    serverContentTokens: number;
    serverEstimatedInputTokens: number;
    serverReconciledInputTokens: number;
    providerInputTokens: number;
    historyInputTokens: number;
  };
  checks: {
    partsAndAdjustmentsEqualProviderInput: boolean;
    providerInputEqualsHistoryInput: boolean;
    historyPersisted: boolean;
  };
};

export type MemoryReviewProviderUsage = {
  traceId: string;
  branch?: MemoryReviewBranch;
  operation: string;
  model: string;
  usageSource: string;
  estimated: boolean;
  finishReason?: string | null;
  tokensFromProvider: {
    inputTotal: number;
    standardInput: number;
    cacheReadInput: number;
    cacheWriteInput: number;
    output: number;
    total: number;
  };
  ratesPer1MTokens: {
    standardInput: number;
    cacheReadInput: number;
    cacheWriteInput: number;
    output: number;
  };
  creditsByFormula: {
    standardInput: number;
    cacheReadInput: number;
    cacheWriteInput: number;
    output: number;
  };
  chargedCredits: {
    input: number;
    output: number;
    total: number;
  };
  promptAccounting?: MemoryReviewPromptAccounting;
};

type ReviewCycle = {
  sourceType?: MemoryReviewStep['sourceType'];
  steps: Map<string, MemoryReviewStep>;
  providerCalls: MemoryReviewProviderUsage[];
  finalReceived: boolean;
  expiresAt: number;
};

type ReadableUsage = {
  tokens: number;
  credits: number;
  tokenizer: 'o200k_base';
};

type ReadableSection = {
  label: string;
  usage?: ReadableUsage;
  diagnostic?: true;
  count?: number;
  value: unknown;
};

type ReadableBlock = {
  step: 1 | 2 | 3 | 4;
  title: string;
  sections: ReadableSection[];
  providerUsage?: unknown;
};

type ReadableReview = {
  traceId: string;
  sourceType: MemoryReviewStep['sourceType'];
  source: string;
  blocks: ReadableBlock[];
  cycleProviderUsage: unknown;
  providerCalls: unknown[];
};

const cycles = new Map<string, ReviewCycle>();
const REVIEW_FILE_PREFIX = 'nemory-user-review';
const CYCLE_TTL_MS = 2 * 60 * 60 * 1000;
const RESPONSE_ONLY_FALLBACK_FLUSH_MS = 30_000;
let reviewWriteQueue: Promise<void> = Promise.resolve();

export function rememberMemoryReviewStep(params: MemoryReviewStep) {
  if (process.env.NODE_ENV === 'production' || !params.traceId) return;

  const trace = normalizeMemoryReviewTraceId(params.traceId);
  const branch = params.branch ?? trace.branch;
  if (branch === 'tags') return;
  const normalizedParams = {
    ...params,
    traceId: trace.rootTraceId,
    ...(branch ? { branch } : {}),
  };
  const cycle = getCycle(trace.rootTraceId);
  cycle.sourceType = params.sourceType;
  const key = reviewStepKey(params.step, branch);
  const existingStep = cycle.steps.get(key);
  cycle.steps.set(
    key,
    existingStep
      ? {
          ...existingStep,
          sourceType: params.sourceType,
          traceId: trace.rootTraceId,
          sections: mergeSections(existingStep.sections, params.sections),
        }
      : normalizedParams,
  );
  cycle.expiresAt = Date.now() + CYCLE_TTL_MS;

  if (params.step === 4) {
    cycle.finalReceived = true;
    scheduleReviewTask(() => flushReview(trace.rootTraceId), 1_000);
    scheduleReviewTask(() => flushReview(trace.rootTraceId, true), 15_000);
    return;
  }
  if (params.step === 3) {
    scheduleReviewTask(
      () => flushReview(trace.rootTraceId, true),
      RESPONSE_ONLY_FALLBACK_FLUSH_MS,
    );
  }
  if (cycle.finalReceived) {
    scheduleReviewTask(() => flushReview(trace.rootTraceId), 1_000);
  }
}

export function rememberMemoryReviewProviderUsage(
  usage: MemoryReviewProviderUsage,
) {
  if (process.env.NODE_ENV === 'production' || !usage.traceId) return;
  const trace = normalizeMemoryReviewTraceId(usage.traceId);
  const branch = usage.branch ?? trace.branch;
  if (branch === 'tags') return;
  const cycle = getCycle(trace.rootTraceId);
  cycle.providerCalls.push({
    ...usage,
    traceId: trace.rootTraceId,
    ...(branch ? { branch } : {}),
  });
  cycle.expiresAt = Date.now() + CYCLE_TTL_MS;
  if (cycle.finalReceived) {
    scheduleReviewTask(() => flushReview(trace.rootTraceId), 1_000);
  }
  clearExpiredCycles();
}

export function normalizeMemoryReviewTraceId(traceId: string): {
  rootTraceId: string;
  branch?: MemoryReviewBranch;
} {
  const normalized = traceId.trim();
  const match = normalized.match(/^(.*):(embeddings|tags)$/);
  if (!match) return { rootTraceId: normalized };
  return {
    rootTraceId: match[1],
    branch: match[2] as MemoryReviewBranch,
  };
}

function getCycle(traceId: string): ReviewCycle {
  const existing = cycles.get(traceId);
  if (existing) return existing;
  const created: ReviewCycle = {
    steps: new Map(),
    providerCalls: [],
    finalReceived: false,
    expiresAt: Date.now() + CYCLE_TTL_MS,
  };
  cycles.set(traceId, created);
  return created;
}

function flushReview(traceId: string, force = false) {
  const cycle = cycles.get(traceId);
  if (!cycle) return;
  if (!force && !isReviewCycleReady(cycle)) return;
  cycles.delete(traceId);

  try {
    const report = buildReadableReview(traceId, cycle);
    enqueueReviewWrite(report);
  } catch (error) {
    console.warn(
      `NEMORY_USER_REVIEW_FORMAT_ERROR: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function isReviewCycleReady(cycle: ReviewCycle) {
  if (cycle.sourceType === 'consolidation') return true;
  const branchSteps = reviewSteps(cycle, 2).filter((step) => step.branch);
  if (!branchSteps.length) return true;
  return (
    cycle.steps.has(reviewStepKey(2, 'embeddings')) &&
    cycle.steps.has(reviewStepKey(3, 'embeddings'))
  );
}

function buildReadableReview(
  traceId: string,
  cycle: ReviewCycle,
): ReadableReview {
  const encoder = encoding_for_model('gpt-5');
  try {
    const sourceType = cycle.sourceType ?? 'entry';
    const isDialogFlow =
      sourceType === 'dialog' || sourceType === 'checkin_dialog';
    const extraction = primaryReviewStep(cycle, 1);
    const contextSteps = reviewSteps(cycle, 2);
    const responseSteps = reviewSteps(cycle, 3);
    const finalCapsule = primaryReviewStep(cycle, 4);
    if (sourceType === 'consolidation') {
      const sections = visibleReviewSections(finalCapsule?.sections ?? [])
        .map(normalizeReadableSectionValue)
        .map((section) => withUsage(section, encoder, 0, 'output'));
      return {
        traceId,
        sourceType,
        source: sourceLabel(sourceType),
        blocks: [
          {
            step: 4,
            title:
              finalCapsule?.title ?? 'BACKGROUND USER MEMORY CONSOLIDATION',
            sections: [
              ...sections,
              ...promptAccountingReviewSections(cycle.providerCalls),
            ],
            providerUsage: formatBlockProviderUsage(cycle.providerCalls),
          },
        ],
        cycleProviderUsage: formatProviderUsage(cycle.providerCalls),
        providerCalls: cycle.providerCalls.map(formatProviderCall),
      };
    }
    const extractionCalls = providerCallsForStep(
      cycle.providerCalls,
      1,
      isDialogFlow,
    );
    const responseCalls = providerCallsForStep(cycle.providerCalls, 3);
    const finalCalls = providerCallsForStep(
      cycle.providerCalls,
      4,
      isDialogFlow,
    );
    const extractionRate = outputRate(extractionCalls);
    const responseInputRate = inputRate(responseCalls);
    const finalRate = outputRate(finalCalls);

    const extractionSections = (
      isDialogFlow
        ? visibleReviewSections(extraction?.sections ?? []).map(
            normalizeReadableSectionValue,
          )
        : normalizeExtractionSections(
            visibleReviewSections(extraction?.sections ?? []),
            sourceType,
          )
    ).map((section) => withUsage(section, encoder, extractionRate, 'output'));
    const contextSections = dedupeRepeatedContextValues(
      contextSteps.flatMap((context) =>
        (isDialogFlow
          ? visibleContextReviewSections(context.sections).map(
              normalizeReadableSectionValue,
            )
          : normalizeContextSections(
              visibleContextReviewSections(context.sections),
            )
        )
          .map((section) => prefixBranch(section, context.branch))
          .map((section) =>
            withUsage(section, encoder, responseInputRate, 'input'),
          ),
      ),
    );
    const promptAccountingSections =
      promptAccountingReviewSections(responseCalls);
    const responseSections = responseSteps.flatMap((response) =>
      normalizeResponseSections(visibleReviewSections(response.sections)).map(
        (section) =>
          withoutSectionUsage(prefixBranch(section, response.branch)),
      ),
    );
    const finalSections = (
      isDialogFlow
        ? visibleReviewSections(finalCapsule?.sections ?? []).map(
            normalizeReadableSectionValue,
          )
        : normalizeFinalSections(
            visibleReviewSections(finalCapsule?.sections ?? []),
          )
    ).map((section) => withUsage(section, encoder, finalRate, 'output'));

    return {
      traceId,
      sourceType,
      source: sourceLabel(sourceType),
      blocks: [
        {
          step: 1,
          title: isDialogFlow
            ? 'ЩО МОДЕЛЬ ВИТЯГЛА З ХОДУ ДІАЛОГУ'
            : 'ЩО МОДЕЛЬ ВИТЯГЛА З ТЕКСТУ',
          sections: [
            ...extractionSections,
            ...promptAccountingReviewSections(extractionCalls),
          ],
          providerUsage: formatBlockProviderUsage(extractionCalls),
        },
        {
          step: 2,
          title: 'КОНТЕКСТ, ВІДПРАВЛЕНИЙ НА АНАЛІЗ',
          sections: [...contextSections, ...promptAccountingSections],
          providerUsage: formatBlockProviderUsage(responseCalls),
        },
        {
          step: 3,
          title: 'ВІДПОВІДЬ МОДЕЛІ',
          sections: responseSections,
        },
        {
          step: 4,
          title: isDialogFlow
            ? 'ВИТЯГНУТА ПАМ’ЯТЬ ТА ОБІЦЯНКИ ПІСЛЯ ДІАЛОГУ'
            : `ФІНАЛЬНА КАПСУЛА ${sourceType === 'checkin' ? 'ЧЕКІНУ' : 'ЗАПИСУ'}`,
          sections: [
            ...finalSections,
            ...promptAccountingReviewSections(finalCalls),
          ],
          providerUsage: formatBlockProviderUsage(finalCalls),
        },
      ],
      cycleProviderUsage: formatProviderUsage(cycle.providerCalls),
      providerCalls: cycle.providerCalls.map(formatProviderCall),
    };
  } finally {
    encoder.free();
  }
}

function visibleReviewSections(sections: MemoryReviewSection[]) {
  return sections.filter(
    (section) =>
      !section.label.startsWith('СИРИЙ JSON ПРОВАЙДЕРА') &&
      !section.label.startsWith('ДІАГНОСТИКА НОРМАЛІЗАЦІЇ') &&
      !section.label.startsWith('FULL-TEXT EMBEDDING'),
  );
}

function visibleContextReviewSections(sections: MemoryReviewSection[]) {
  return visibleReviewSections(sections).filter(
    (section) =>
      !section.label.includes('ПІДСУМОК MEMORY V2') &&
      !section.label.includes('УСЬОГО MEMORY V2') &&
      !section.label.includes('РАЗОМ КОНТЕКСТ ДІАЛОГУ') &&
      !section.label.includes('РАЗОМ ПОТОЧНИЙ ТЕКСТ') &&
      !section.label.includes('УСЬОГО ПРОМПТУ ДО МОДЕЛІ'),
  );
}

function branchLabel(branch: MemoryReviewBranch | undefined) {
  return branch ? `${branch.toUpperCase()} · ` : '';
}

function promptAccountingReviewSections(
  calls: MemoryReviewProviderUsage[],
): ReadableSection[] {
  return calls.flatMap((call) =>
    call.promptAccounting
      ? [
          {
            label: `${branchLabel(call.branch)}${providerOperationLabel(call.operation)} · СЕРВЕРНИЙ РОЗКЛАД ФАКТИЧНОГО INPUT-ПРОМПТУ`,
            value: call.promptAccounting,
          },
        ]
      : [],
  );
}

function providerOperationLabel(operation: string) {
  if (operation.includes('generate_entry_response'))
    return 'ВІДПОВІДЬ НА ЗАПИС';
  if (operation.includes('generate_checkin_response')) {
    return 'ВІДПОВІДЬ НА ЧЕКІН';
  }
  if (operation.includes('generate_dialog_response')) {
    return 'ВІДПОВІДЬ У ДІАЛОЗІ ЗАПИСУ';
  }
  if (operation.includes('generate_checkin_dialog_response')) {
    return 'ВІДПОВІДЬ У ДІАЛОЗІ ЧЕКІНУ';
  }
  if (operation.includes('generate_embeddings')) return 'EMBEDDING';
  if (operation.includes('retrieval_index')) {
    return 'ТЕГИ ТА ОПТИМІЗОВАНИЙ ОПИС';
  }
  if (operation.includes('extract_user_memory')) {
    return "ВИТЯГУВАННЯ ДОВГОТРИВАЛОЇ ПАМ'ЯТІ КОРИСТУВАЧА";
  }
  if (operation.includes('extract_dialog_memory')) {
    return 'ФОРМУВАННЯ ПАМ’ЯТІ ДІАЛОГУ';
  }
  if (operation.includes('extract_assistant_memory')) {
    return 'ФОРМУВАННЯ ПАМ’ЯТІ NEMORY';
  }
  if (operation.includes('consolidat') || operation.includes('optimiz')) {
    return 'ОПТИМІЗАЦІЯ ДОВГОТРИВАЛОЇ ПАМ’ЯТІ';
  }
  return operation;
}

function normalizeExtractionSections(
  sections: MemoryReviewSection[],
  sourceType: MemoryReviewStep['sourceType'],
): MemoryReviewSection[] {
  const normalized = [
    ...(sectionByPrefix(sections, 'ТЕГИ')
      ? [sectionByPrefix(sections, 'ТЕГИ')!]
      : []),
    ...(sectionByPrefix(sections, 'НОВІ ТЕГИ')
      ? [sectionByPrefix(sections, 'НОВІ ТЕГИ')!]
      : []),
    normalizeOptimizedDigestSection(
      sectionContaining(sections, 'ОПТИМІЗОВАНИЙ ТЕКСТ') ??
        sectionContaining(sections, 'СТИСЛИЙ ПІДСУМОК') ??
        emptySection(
          sourceType === 'checkin'
            ? 'ОПТИМІЗОВАНИЙ ОПИС ЧЕКІНУ'
            : 'ОПТИМІЗОВАНИЙ ОПИС ЗАПИСУ',
          '',
        ),
      sourceType,
    ),
    ...(sectionContaining(sections, "ПАМ'ЯТЬ КОРИСТУВАЧА")
      ? [
          normalizeUserMemorySection(
            sectionContaining(sections, "ПАМ'ЯТЬ КОРИСТУВАЧА")!,
          ),
        ]
      : []),
  ].map(normalizeReadableSectionValue);
  return normalized;
}

function normalizeContextSections(
  sections: MemoryReviewSection[],
): MemoryReviewSection[] {
  return sections.flatMap((section) => {
    if (
      section.label.includes('ПОВНИЙ СТРУКТУРОВАНИЙ ПРОМПТ') ||
      section.label.includes('ПОВНИЙ ПРОМПТ') ||
      section.label.includes('ПОРЯДОК ПОВІДОМЛЕНЬ') ||
      section.label.startsWith('SYSTEM PROMPT ·') ||
      section.label.startsWith('MEMORY V2 · СЛУЖБОВІ ОБГОРТКИ') ||
      section.label.startsWith('ПОВІДОМЛЕННЯ ')
    ) {
      return [normalizeReadableSectionValue(section)];
    }
    if (
      section.label.includes('ПОТОЧНИЙ ЧЕКІН') ||
      section.label.includes('ПОТОЧНИЙ ЗАПИС')
    ) {
      return [normalizeCurrentSection(section)];
    }
    if (section.label.includes('РЕЛЕВАНТНІ')) {
      return [
        {
          ...section,
          label: 'РЕЛЕВАНТНІ КАПСУЛИ',
          value: parseRelevantCapsules(stringValue(section.value)),
        },
      ];
    }
    if (section.label.includes('АКТИВНІ ОБІЦЯНКИ')) {
      return [
        {
          ...section,
          label: 'АКТИВНІ ОБІЦЯНКИ NEMORY',
          value: parsePromptList(stringValue(section.value), 'commitment'),
        },
      ];
    }
    if (section.label.includes("ПАМ'ЯТЬ КОРИСТУВАЧА")) {
      return [
        {
          ...section,
          label: "ДОВГОТРИВАЛА ПАМ'ЯТЬ КОРИСТУВАЧА",
          value: parsePromptList(stringValue(section.value), 'userMemory'),
        },
      ];
    }
    return [];
  });
}

function normalizeResponseSections(
  sections: MemoryReviewSection[],
): MemoryReviewSection[] {
  const seenValues = new Set<string>();

  return sections
    .filter(
      (section) =>
        section.label.includes('КОРОТКА') || section.label.includes('ПОВНА'),
    )
    .map(normalizeReadableSectionValue)
    .filter((section) => {
      const valueKey = JSON.stringify(section.value);
      if (seenValues.has(valueKey)) return false;
      seenValues.add(valueKey);
      return true;
    });
}

function dedupeRepeatedContextValues(
  sections: ReadableSection[],
): ReadableSection[] {
  const firstSectionByContent = new Map<string, string>();

  return sections.map((section) => {
    if (section.value == null) return section;
    const serialized = JSON.stringify(section.value);
    if (!serialized || serialized.length < 80) return section;

    const baseLabel = section.label.replace(/^(EMBEDDINGS|TAGS) · /, '');
    const contentKey = `${baseLabel}\u0000${serialized}`;
    const firstLabel = firstSectionByContent.get(contentKey);
    if (!firstLabel) {
      firstSectionByContent.set(contentKey, section.label);
      return section;
    }

    return {
      ...section,
      value: {
        contentOmittedAsDuplicate: true,
        sameAsSection: firstLabel,
      },
    };
  });
}

function normalizeFinalSections(
  finalSections: MemoryReviewSection[],
): MemoryReviewSection[] {
  return finalSections
    .filter(
      (section) =>
        section.label.includes('КАПСУЛА ВІДПОВІДІ') ||
        section.label.includes("ПАМ'ЯТЬ NEMORY") ||
        section.label.includes('ОБІЦЯНК'),
    )
    .map((section) =>
      isUnclassifiedMemoryList(section.value)
        ? normalizeMemoryContentSection(section)
        : normalizeReadableSectionValue(section),
    );
}

function normalizeReadableSectionValue(
  section: MemoryReviewSection,
): MemoryReviewSection {
  if (typeof section.value === 'string') {
    return { ...section, value: readableText(section.value) };
  }
  return section;
}

function normalizeCurrentSection(
  section: MemoryReviewSection,
): MemoryReviewSection {
  const value = asRecord(section.value);
  return {
    ...section,
    value: {
      ...value,
      ...(typeof value.text === 'string'
        ? { text: readableText(value.text) }
        : {}),
    },
  };
}

function normalizeUserMemorySection(
  section: MemoryReviewSection,
): MemoryReviewSection {
  const value = Array.isArray(section.value)
    ? section.value.flatMap((item) => {
        const record = asRecord(item);
        if (typeof record.content !== 'string') return [];
        const createdAt = toIsoDate(record.createdAt);
        return [
          {
            content: record.content,
            ...(createdAt ? { createdAt } : {}),
          },
        ];
      })
    : [];
  return { ...section, label: "ДОВГОТРИВАЛА ПАМ'ЯТЬ КОРИСТУВАЧА", value };
}

function isUnclassifiedMemoryList(value: unknown) {
  return (
    Array.isArray(value) &&
    value.some((item) => {
      const record = asRecord(item);
      return (
        typeof record.content === 'string' &&
        !('promiseKey' in record) &&
        !('reminderKey' in record) &&
        !('status' in record)
      );
    })
  );
}

function normalizeMemoryContentSection(
  section: MemoryReviewSection,
): MemoryReviewSection {
  const value = Array.isArray(section.value)
    ? section.value.flatMap((item) => {
        const record = asRecord(item);
        if (typeof record.content !== 'string') return [];
        const createdAt = toIsoDate(record.createdAt);
        return [
          {
            content: record.content,
            ...(createdAt ? { createdAt } : {}),
          },
        ];
      })
    : [];
  return { ...section, value };
}

function withUsage(
  section: MemoryReviewSection,
  _encoder: ReturnType<typeof encoding_for_model>,
  _ratePer1M: number,
  _direction: 'input' | 'output',
): ReadableSection {
  if (section.excludeFromUsage) {
    return {
      label: section.label,
      diagnostic: true,
      ...(typeof section.count === 'number' ? { count: section.count } : {}),
      value: section.value,
    };
  }
  if (section.usage) {
    return {
      label: section.label,
      usage: {
        ...section.usage,
        tokenizer: 'o200k_base',
      },
      ...(typeof section.count === 'number'
        ? { count: section.count }
        : Array.isArray(section.value)
          ? { count: section.value.length }
          : {}),
      value: section.value,
    };
  }
  return {
    label: section.label,
    ...(Array.isArray(section.value) ? { count: section.value.length } : {}),
    value: section.value,
  };
}

function providerCallsForStep(
  calls: MemoryReviewProviderUsage[],
  step: 1 | 3 | 4,
  isDialogFlow = false,
) {
  return calls.filter((call) => {
    if (step === 1) {
      return isDialogFlow
        ? call.operation.includes('extract_dialog_memory')
        : call.operation.includes('extract_user_memory') ||
            call.operation.includes('retrieval_index') ||
            call.operation.includes('embedding');
    }
    if (step === 3) {
      return (
        call.operation.startsWith('generate_') &&
        !call.operation.includes('embedding')
      );
    }
    if (isDialogFlow) return false;
    return (
      call.operation.includes('extract_assistant_memory') ||
      call.operation.includes('repair_missing_assistant')
    );
  });
}

function formatProviderUsage(calls: MemoryReviewProviderUsage[]) {
  const total = calls.reduce(
    (result, call) => ({
      tokensFromProvider: {
        inputTotal:
          result.tokensFromProvider.inputTotal +
          call.tokensFromProvider.inputTotal,
        standardInput:
          result.tokensFromProvider.standardInput +
          call.tokensFromProvider.standardInput,
        cacheReadInput:
          result.tokensFromProvider.cacheReadInput +
          call.tokensFromProvider.cacheReadInput,
        cacheWriteInput:
          result.tokensFromProvider.cacheWriteInput +
          call.tokensFromProvider.cacheWriteInput,
        output:
          result.tokensFromProvider.output + call.tokensFromProvider.output,
        total: result.tokensFromProvider.total + call.tokensFromProvider.total,
      },
      creditsByFormula: {
        standardInput:
          result.creditsByFormula.standardInput +
          call.creditsByFormula.standardInput,
        cacheReadInput:
          result.creditsByFormula.cacheReadInput +
          call.creditsByFormula.cacheReadInput,
        cacheWriteInput:
          result.creditsByFormula.cacheWriteInput +
          call.creditsByFormula.cacheWriteInput,
        output: result.creditsByFormula.output + call.creditsByFormula.output,
      },
      chargedCredits: {
        input: result.chargedCredits.input + call.chargedCredits.input,
        output: result.chargedCredits.output + call.chargedCredits.output,
        total: result.chargedCredits.total + call.chargedCredits.total,
      },
    }),
    {
      tokensFromProvider: {
        inputTotal: 0,
        standardInput: 0,
        cacheReadInput: 0,
        cacheWriteInput: 0,
        output: 0,
        total: 0,
      },
      creditsByFormula: {
        standardInput: 0,
        cacheReadInput: 0,
        cacheWriteInput: 0,
        output: 0,
      },
      chargedCredits: { input: 0, output: 0, total: 0 },
    },
  );

  return {
    tokensFromProvider: total.tokensFromProvider,
    creditsByFormula: {
      standardInput: Number(total.creditsByFormula.standardInput.toFixed(4)),
      cacheReadInput: Number(total.creditsByFormula.cacheReadInput.toFixed(4)),
      cacheWriteInput: Number(
        total.creditsByFormula.cacheWriteInput.toFixed(4),
      ),
      output: Number(total.creditsByFormula.output.toFixed(4)),
    },
    chargedCredits: total.chargedCredits,
  };
}

function formatBlockProviderUsage(calls: MemoryReviewProviderUsage[]) {
  return {
    ...formatProviderUsage(calls),
    breakdown: calls.map((call) => ({
      ...(call.branch ? { branch: call.branch } : {}),
      operation: call.operation,
      model: call.model,
      ...formatProviderUsage([call]),
    })),
  };
}

function inputRate(calls: MemoryReviewProviderUsage[]) {
  return calls[0]?.ratesPer1MTokens.standardInput ?? 0;
}

function outputRate(calls: MemoryReviewProviderUsage[]) {
  return calls[0]?.ratesPer1MTokens.output ?? 0;
}

function enqueueReviewWrite(report: ReadableReview) {
  const createdAt = new Date().toISOString();
  const day = createdAt.slice(0, 10);
  const directory = resolve(process.cwd(), '.tmp');
  const jsonLine = `${JSON.stringify(report)}\n`;
  const pretty = renderPrettyReport(report);

  reviewWriteQueue = reviewWriteQueue
    .then(async () => {
      await mkdir(directory, { recursive: true });
      const index = await nextReviewFileIndex(directory, day);
      const indexedPrefix = `${REVIEW_FILE_PREFIX}-${day}-${reviewFileType(report.sourceType)}-${String(index).padStart(3, '0')}`;
      const jsonlPath = resolve(directory, `${indexedPrefix}.jsonl`);
      const prettyPath = resolve(directory, `${indexedPrefix}.pretty.log`);
      await Promise.all([
        writeFile(jsonlPath, jsonLine, { encoding: 'utf8', flag: 'wx' }),
        writeFile(prettyPath, pretty, { encoding: 'utf8', flag: 'wx' }),
      ]);
    })
    .catch((error) => {
      console.warn(
        `NEMORY_USER_REVIEW_FILE_WRITE_ERROR: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
}

function formatProviderCall(call: MemoryReviewProviderUsage) {
  return {
    traceId: call.traceId,
    ...(call.branch ? { branch: call.branch } : {}),
    operation: call.operation,
    model: call.model,
    usageSource: call.usageSource,
    estimated: call.estimated,
    finishReason: call.finishReason,
    tokensFromProvider: call.tokensFromProvider,
    creditsByFormula: call.creditsByFormula,
    chargedCredits: call.chargedCredits,
    ...(call.promptAccounting
      ? { promptAccounting: call.promptAccounting }
      : {}),
  };
}

async function nextReviewFileIndex(directory: string, day: string) {
  const names = await readdir(directory);
  const typedPattern = new RegExp(
    `^${REVIEW_FILE_PREFIX}-${day}-(?:entry|checkin|dialog|consolidation)-(\\d+)\\.(?:jsonl|pretty\\.log)$`,
  );
  const legacyPattern = new RegExp(
    `^${REVIEW_FILE_PREFIX}-${day}-(\\d+)\\.(?:jsonl|pretty\\.log)$`,
  );
  return (
    names.reduce((max, name) => {
      const match = name.match(typedPattern) ?? name.match(legacyPattern);
      const index = match ? Number(match[1]) : 0;
      return Number.isFinite(index) ? Math.max(max, index) : max;
    }, 0) + 1
  );
}

function reviewFileType(sourceType: MemoryReviewStep['sourceType']) {
  if (sourceType === 'dialog' || sourceType === 'checkin_dialog') {
    return 'dialog';
  }
  return sourceType;
}

function renderPrettyReport(report: ReadableReview) {
  const lines = [
    '='.repeat(96),
    `${report.source} · traceId: ${report.traceId}`,
    '='.repeat(96),
  ];
  for (const block of report.blocks) {
    lines.push(
      '',
      `${block.step}. ${block.title}${blockProviderUsageSuffix(block.providerUsage)}`,
    );
    for (const section of block.sections) {
      const countSuffix =
        typeof section.count === 'number'
          ? ` · кількість об'єктів: ${section.count}`
          : '';
      lines.push(
        '',
        section.usage
          ? `   ${section.label} · ${section.usage.tokens} токенів · СЕРВЕРНИЙ ВИМІР ${section.usage.tokenizer}`
          : section.diagnostic
            ? `   ${section.label} · ДІАГНОСТИКА · НЕ ОКРЕМИЙ AI-ВИКЛИК`
            : `   ${section.label}`,
        indent(renderPrettySectionValue(section), 6),
      );
      if (countSuffix) lines[lines.length - 2] += countSuffix;
    }
    if (block.providerUsage) {
      lines.push(
        '',
        '   ПІДРАХУНОК ТОКЕНІВ ВІД ПРОВАЙДЕРА ТА КРЕДИТІВ ЗА ФОРМУЛОЮ',
        indent(JSON.stringify(block.providerUsage, null, 2), 6),
      );
    }
  }
  lines.push(
    '',
    'ПІДСУМОК УСЬОГО AI-ЦИКЛУ',
    indent(JSON.stringify(report.cycleProviderUsage, null, 2), 3),
  );
  return `${lines.join('\n')}\n\n`;
}

function renderPrettySectionValue(section: ReadableSection) {
  return JSON.stringify(section.value, null, 2);
}

function blockProviderUsageSuffix(value: unknown) {
  if (!value) return '';
  const usage = asRecord(value);
  const tokenUsage = asRecord(usage.tokensFromProvider);
  const input = tokenUsage.inputTotal;
  const output = tokenUsage.output;
  const tokens = tokenUsage.total;
  const credits = asRecord(usage.chargedCredits).total;
  if (
    typeof input !== 'number' ||
    typeof output !== 'number' ||
    typeof tokens !== 'number' ||
    typeof credits !== 'number'
  ) {
    return '';
  }
  return (
    ` · ПРОВАЙДЕР: INPUT ${input} + OUTPUT ${output} = ${tokens} ТОКЕНІВ` +
    ` · СПИСАНО ${credits} КРЕДИТІВ`
  );
}

function parseRelevantCapsules(content: string) {
  return extractBlocks(content, 'RELEVANT_ENTRY_DIGEST').map((block) => {
    const date = firstMatch(block, /^Date:\s*(.+)$/m);
    const source = firstMatch(block, /^Source:\s*(.+)$/m);
    const summary = firstMatch(
      block,
      /^Summary of the user's previous writing:\s*(.+)$/m,
    );
    const dialogs = extractBlocks(block, 'FOLLOW_UP_DIALOG_MEMORY', true).map(
      (dialog) => ({
        date: firstMatch(dialog, /^\[FOLLOW_UP_DIALOG_MEMORY date=(.+)\]$/m),
        shortUserMessage: stripSection(dialog, 'SHORT_USER_MESSAGE'),
        nemoryMemoryFromResponse: parseSimplePromptList(
          stripSection(dialog, 'NEMORY_MEMORY_FROM_RESPONSE_TO_THIS_MESSAGE') ||
            stripSection(dialog, 'NEMORY_MEMORY_FROM_RESPONSE'),
        ),
      }),
    );
    return {
      date,
      source,
      summaryOfUsersPreviousWriting: summary,
      nemoryLongTermMemoryFromReflection: parsePromptList(
        stripSection(block, 'NEMORY_LONG_TERM_MEMORY_FROM_REFLECTION'),
        'assistantMemory',
      ),
      followUpDialogMemoryOldestToNewest: dialogs,
    };
  });
}

function parseSimplePromptList(content: string) {
  return content.split(/\r?\n/).flatMap((line) => {
    const match = line.trim().match(/^-\s+(.+)$/);
    return match?.[1] ? [match[1].trim()] : [];
  });
}

function parsePromptList(
  content: string,
  kind: 'assistantMemory' | 'commitment' | 'userMemory',
) {
  return content.split(/\r?\n/).flatMap((line) => {
    const match = line.trim().match(/^- \[(.+?)\]\s*(.*)$/);
    if (!match) return [];
    const metadata = parseMetadata(match[1]);
    const base: Record<string, unknown> = {
      ...metadata,
      content: match[2].trim(),
    };
    if (kind === 'commitment') {
      const { key: _key, ...visible } = base;
      return [visible];
    }
    return [base];
  });
}

function parseMetadata(value: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [index, rawPart] of value.split(';').entries()) {
    const part = rawPart.trim();
    const separator = part.indexOf('=');
    if (separator < 0) {
      if (index === 0) result.createdAt = part;
      continue;
    }
    const key = part.slice(0, separator).trim();
    const rawValue = part.slice(separator + 1).trim();
    const normalizedKey = key === 'occurrences' ? 'occurrenceCount' : key;
    if (normalizedKey === 'aggregated') {
      result[normalizedKey] = rawValue === 'true';
      continue;
    }
    result[normalizedKey] =
      /^(importance|occurrenceCount|evidenceCount)$/.test(normalizedKey) &&
      Number.isFinite(Number(rawValue))
        ? Number(rawValue)
        : rawValue;
  }
  return result;
}

function extractBlocks(content: string, tag: string, hasAttributes = false) {
  const open = hasAttributes ? `\\[${tag}[^\\]]*\\]` : `\\[${tag}\\]`;
  const expression = new RegExp(`${open}([\\s\\S]*?)\\[\\/${tag}\\]`, 'g');
  return Array.from(content.matchAll(expression), (match) => match[0]);
}

function stripSection(content: string, tag: string) {
  const match = content.match(
    new RegExp(`\\[${tag}\\]([\\s\\S]*?)\\[\\/${tag}\\]`),
  );
  return match?.[1]?.trim() ?? '';
}

function firstMatch(content: string, expression: RegExp) {
  return content.match(expression)?.[1]?.trim() ?? '';
}

function sectionContaining(sections: MemoryReviewSection[], text: string) {
  return sections.find((section) => section.label.includes(text));
}

function sectionByPrefix(sections: MemoryReviewSection[], text: string) {
  return sections.find((section) => section.label === text);
}

function emptySection(label: string, value: unknown): MemoryReviewSection {
  return { label, value };
}

function reviewStepKey(
  step: MemoryReviewStep['step'],
  branch?: MemoryReviewBranch,
) {
  return `${step}:${branch ?? 'base'}`;
}

function reviewSteps(cycle: ReviewCycle, step: MemoryReviewStep['step']) {
  const order: Array<MemoryReviewBranch | undefined> = [
    'embeddings',
    'tags',
    undefined,
  ];
  return order.flatMap((branch) => {
    const value = cycle.steps.get(reviewStepKey(step, branch));
    return value ? [value] : [];
  });
}

function primaryReviewStep(cycle: ReviewCycle, step: MemoryReviewStep['step']) {
  return cycle.steps.get(reviewStepKey(step)) ?? reviewSteps(cycle, step)[0];
}

function prefixBranch(
  section: MemoryReviewSection,
  branch?: MemoryReviewBranch,
): MemoryReviewSection {
  if (!branch) return section;
  return {
    ...section,
    label: `${branch === 'embeddings' ? 'EMBEDDINGS' : 'TAGS'} · ${section.label}`,
  };
}

function withoutSectionUsage(section: MemoryReviewSection): ReadableSection {
  return {
    label: section.label,
    ...(typeof section.count === 'number' ? { count: section.count } : {}),
    value: section.value,
  };
}

function normalizeOptimizedDigestSection(
  section: MemoryReviewSection,
  sourceType: MemoryReviewStep['sourceType'],
): MemoryReviewSection {
  return {
    ...section,
    label:
      sourceType === 'checkin'
        ? 'ОПТИМІЗОВАНИЙ ОПИС ЧЕКІНУ'
        : 'ОПТИМІЗОВАНИЙ ОПИС ЗАПИСУ',
  };
}

function readableText(value: string) {
  return { characters: value.length, lines: wrapText(value) };
}

function wrapText(text: string) {
  const result: string[] = [];
  for (const paragraph of text.split(/\r?\n+/).map((item) => item.trim())) {
    if (!paragraph) continue;
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      if (!line || `${line} ${word}`.length <= 120) {
        line = line ? `${line} ${word}` : word;
      } else {
        result.push(line);
        line = word;
      }
    }
    if (line) result.push(line);
  }
  return result;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function toIsoDate(value: unknown) {
  if (typeof value !== 'number' && typeof value !== 'string') return '';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : '';
}

function sourceLabel(sourceType: MemoryReviewStep['sourceType']) {
  if (sourceType === 'consolidation') {
    return 'BACKGROUND USER MEMORY CONSOLIDATION';
  }
  if (sourceType === 'checkin') return 'ЧЕКІН';
  if (sourceType === 'dialog') return 'ДІАЛОГ ЗАПИСУ';
  if (sourceType === 'checkin_dialog') return 'ДІАЛОГ ЧЕКІНУ';
  return 'ЗАПИС';
}

function indent(value: string, spaces: number) {
  const prefix = ' '.repeat(spaces);
  return value
    .split(/\r?\n/)
    .map((line) => `${prefix}${line}`)
    .join('\n');
}

function clearExpiredCycles() {
  const now = Date.now();
  for (const [traceId, cycle] of cycles) {
    if (cycle.expiresAt < now) cycles.delete(traceId);
  }
}

function mergeSections(
  current: MemoryReviewSection[],
  incoming: MemoryReviewSection[],
) {
  const merged = [...current];
  for (const section of incoming) {
    const index = merged.findIndex((item) => item.label === section.label);
    if (index >= 0) merged[index] = section;
    else merged.push(section);
  }
  return merged;
}

function scheduleReviewTask(task: () => void, delayMs: number) {
  const timer = setTimeout(() => {
    try {
      task();
    } catch (error) {
      console.warn(
        `NEMORY_USER_REVIEW_BACKGROUND_ERROR: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }, delayMs);
  timer.unref?.();
}
