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
  sections: MemoryReviewSection[];
};

export type MemoryReviewProviderUsage = {
  traceId: string;
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
};

type ReviewCycle = {
  sourceType?: MemoryReviewStep['sourceType'];
  steps: Map<number, MemoryReviewStep>;
  providerCalls: MemoryReviewProviderUsage[];
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
  source: string;
  blocks: ReadableBlock[];
  cycleProviderUsage: unknown;
  providerCalls: unknown[];
};

const cycles = new Map<string, ReviewCycle>();
const REVIEW_FILE_PREFIX = 'nemory-user-review';
const CYCLE_TTL_MS = 2 * 60 * 60 * 1000;
let reviewWriteQueue: Promise<void> = Promise.resolve();

export function rememberMemoryReviewStep(params: MemoryReviewStep) {
  if (process.env.NODE_ENV === 'production' || !params.traceId) return;

  const cycle = getCycle(params.traceId);
  cycle.sourceType = params.sourceType;
  const existingStep = cycle.steps.get(params.step);
  cycle.steps.set(
    params.step,
    existingStep
      ? {
          ...existingStep,
          sourceType: params.sourceType,
          traceId: params.traceId,
          sections: mergeSections(existingStep.sections, params.sections),
        }
      : params,
  );
  cycle.expiresAt = Date.now() + CYCLE_TTL_MS;

  if (params.step !== 4) return;
  scheduleReviewTask(() => flushReview(params.traceId!), 1_000);
}

export function rememberMemoryReviewProviderUsage(
  usage: MemoryReviewProviderUsage,
) {
  if (process.env.NODE_ENV === 'production' || !usage.traceId) return;
  const cycle = getCycle(usage.traceId);
  cycle.providerCalls.push(usage);
  cycle.expiresAt = Date.now() + CYCLE_TTL_MS;
  clearExpiredCycles();
}

function getCycle(traceId: string): ReviewCycle {
  const existing = cycles.get(traceId);
  if (existing) return existing;
  const created: ReviewCycle = {
    steps: new Map(),
    providerCalls: [],
    expiresAt: Date.now() + CYCLE_TTL_MS,
  };
  cycles.set(traceId, created);
  return created;
}

function flushReview(traceId: string) {
  const cycle = cycles.get(traceId);
  if (!cycle) return;
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

function buildReadableReview(
  traceId: string,
  cycle: ReviewCycle,
): ReadableReview {
  const encoder = encoding_for_model('gpt-5');
  try {
    const sourceType = cycle.sourceType ?? 'entry';
    const isDialogFlow =
      sourceType === 'dialog' || sourceType === 'checkin_dialog';
    const extraction = cycle.steps.get(1);
    const context = cycle.steps.get(2);
    const response = cycle.steps.get(3);
    const finalCapsule = cycle.steps.get(4);
    if (sourceType === 'consolidation') {
      const sections = (finalCapsule?.sections ?? [])
        .map(normalizeReadableSectionValue)
        .map((section) => withUsage(section, encoder, 0, 'output'));
      return {
        traceId,
        source: sourceLabel(sourceType),
        blocks: [
          {
            step: 4,
            title:
              finalCapsule?.title ?? 'BACKGROUND USER MEMORY CONSOLIDATION',
            sections,
            providerUsage: formatProviderUsage(cycle.providerCalls),
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
    const responseOutputRate = outputRate(responseCalls);
    const finalRate = outputRate(finalCalls);

    const extractionSections = (
      isDialogFlow
        ? (extraction?.sections ?? []).map(normalizeReadableSectionValue)
        : normalizeExtractionSections(extraction?.sections ?? [], sourceType)
    ).map((section) => withUsage(section, encoder, extractionRate, 'output'));
    const contextSections = (
      isDialogFlow
        ? (context?.sections ?? []).map(normalizeReadableSectionValue)
        : normalizeContextSections(context?.sections ?? [])
    ).map((section) => withUsage(section, encoder, responseInputRate, 'input'));
    const responseSections = normalizeResponseSections(
      response?.sections ?? [],
    ).map((section) =>
      withUsage(section, encoder, responseOutputRate, 'output'),
    );
    const finalSections = (
      isDialogFlow
        ? (finalCapsule?.sections ?? []).map(normalizeReadableSectionValue)
        : normalizeFinalSections(
            extraction?.sections ?? [],
            finalCapsule?.sections ?? [],
            sourceType,
          )
    ).map((section) => withUsage(section, encoder, finalRate, 'output'));

    return {
      traceId,
      source: sourceLabel(sourceType),
      blocks: [
        {
          step: 1,
          title: isDialogFlow
            ? 'ЩО МОДЕЛЬ ВИТЯГЛА З ХОДУ ДІАЛОГУ'
            : 'ЩО МОДЕЛЬ ВИТЯГЛА З ТЕКСТУ',
          sections: extractionSections,
          providerUsage: formatProviderUsage(extractionCalls),
        },
        {
          step: 2,
          title: 'КОНТЕКСТ, ВІДПРАВЛЕНИЙ НА АНАЛІЗ',
          sections: contextSections,
        },
        {
          step: 3,
          title: 'ВІДПОВІДЬ МОДЕЛІ',
          sections: responseSections,
          providerUsage: formatProviderUsage(responseCalls),
        },
        {
          step: 4,
          title: isDialogFlow
            ? 'ВИТЯГНУТА ПАМ’ЯТЬ ТА ОБІЦЯНКИ ПІСЛЯ ДІАЛОГУ'
            : `ФІНАЛЬНА КАПСУЛА ${sourceType === 'checkin' ? 'ЧЕКІНУ' : 'ЗАПИСУ'}`,
          sections: finalSections,
          providerUsage: formatProviderUsage(finalCalls),
        },
      ],
      cycleProviderUsage: formatProviderUsage(cycle.providerCalls),
      providerCalls: cycle.providerCalls.map(formatProviderCall),
    };
  } finally {
    encoder.free();
  }
}

function normalizeExtractionSections(
  sections: MemoryReviewSection[],
  sourceType: MemoryReviewStep['sourceType'],
): MemoryReviewSection[] {
  const normalized = [
    sectionByPrefix(sections, 'ТЕГИ') ?? emptySection('ТЕГИ', []),
    sectionByPrefix(sections, 'НОВІ ТЕГИ') ?? emptySection('НОВІ ТЕГИ', []),
    sectionContaining(sections, 'СТИСЛИЙ ПІДСУМОК') ??
      emptySection(
        sourceType === 'checkin'
          ? 'СТИСЛИЙ ПІДСУМОК ЧЕКІНУ'
          : 'СТИСЛИЙ ПІДСУМОК ЗАПИСУ',
        readableText(''),
      ),
    normalizeUserMemorySection(
      sectionContaining(sections, "ПАМ'ЯТЬ КОРИСТУВАЧА") ??
        emptySection("ДОВГОТРИВАЛА ПАМ'ЯТЬ КОРИСТУВАЧА", []),
    ),
  ].map(normalizeReadableSectionValue);
  const diagnostics = sections.filter(
    (section) =>
      section.label.includes('EXTRACT_USER_MEMORY_DETAILS_V2') ||
      section.label.includes('ДІАГНОСТИКА НОРМАЛІЗАЦІЇ'),
  );
  return [...normalized, ...diagnostics];
}

function normalizeContextSections(
  sections: MemoryReviewSection[],
): MemoryReviewSection[] {
  const current =
    sectionContaining(sections, 'ПОТОЧНИЙ ЧЕКІН') ??
    sectionContaining(sections, 'ПОТОЧНИЙ ЗАПИС') ??
    emptySection('ПОТОЧНИЙ ЗАПИС', {});
  const relevant =
    sectionContaining(sections, 'РЕЛЕВАНТНІ') ??
    emptySection('РЕЛЕВАНТНІ КАПСУЛИ', []);
  const commitments =
    sectionContaining(sections, 'АКТИВНІ ОБІЦЯНКИ') ??
    emptySection('АКТИВНІ ОБІЦЯНКИ NEMORY', []);
  const userMemory =
    sectionContaining(sections, "ПАМ'ЯТЬ КОРИСТУВАЧА") ??
    emptySection("ДОВГОТРИВАЛА ПАМ'ЯТЬ КОРИСТУВАЧА", []);
  const total =
    sectionContaining(sections, 'ПІДСУМОК MEMORY V2') ??
    sectionContaining(sections, 'УСЬОГО MEMORY V2') ??
    emptySection('УСЬОГО MEMORY V2 КОНТЕКСТ', null);

  return [
    normalizeCurrentSection(current),
    {
      ...relevant,
      label: 'РЕЛЕВАНТНІ КАПСУЛИ',
      value: parseRelevantCapsules(stringValue(relevant.value)),
    },
    {
      ...commitments,
      label: 'АКТИВНІ ОБІЦЯНКИ NEMORY',
      value: parsePromptList(stringValue(commitments.value), 'commitment'),
    },
    {
      ...userMemory,
      label: "ДОВГОТРИВАЛА ПАМ'ЯТЬ КОРИСТУВАЧА",
      value: parsePromptList(stringValue(userMemory.value), 'userMemory'),
    },
    {
      ...total,
      label: 'УСЬОГО MEMORY V2 КОНТЕКСТ',
      value: null,
    },
  ];
}

function normalizeResponseSections(
  sections: MemoryReviewSection[],
): MemoryReviewSection[] {
  return sections
    .filter(
      (section) =>
        section.label.includes('КОРОТКА') || section.label.includes('ПОВНА'),
    )
    .map(normalizeReadableSectionValue);
}

function normalizeFinalSections(
  extractionSections: MemoryReviewSection[],
  finalSections: MemoryReviewSection[],
  sourceType: MemoryReviewStep['sourceType'],
): MemoryReviewSection[] {
  const base = normalizeExtractionSections(
    extractionSections,
    sourceType,
  ).slice(0, 3);
  return [
    ...base,
    ...finalSections
      .filter(
        (section) =>
          section.label.includes("ПАМ'ЯТЬ NEMORY") ||
          section.label.includes('ОБІЦЯНК'),
      )
      .map((section) =>
        isUnclassifiedMemoryList(section.value)
          ? normalizeMemoryContentSection(section)
          : normalizeReadableSectionValue(section),
      ),
  ];
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
  encoder: ReturnType<typeof encoding_for_model>,
  ratePer1M: number,
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
  const source =
    section.tokenText ??
    (typeof section.value === 'string'
      ? section.value
      : JSON.stringify(section.value ?? null));
  const tokens = source ? encoder.encode(source).length : 0;
  return {
    label: section.label,
    usage: {
      tokens,
      credits: Number(((tokens * ratePer1M) / 1_000_000).toFixed(4)),
      tokenizer: 'o200k_base',
    },
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
        : call.operation.includes('extract_user_memory');
    }
    if (step === 3) return call.operation.startsWith('generate_');
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
      const indexedPrefix = `${REVIEW_FILE_PREFIX}-${day}-${String(index).padStart(3, '0')}`;
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
    operation: call.operation,
    model: call.model,
    usageSource: call.usageSource,
    estimated: call.estimated,
    finishReason: call.finishReason,
    tokensFromProvider: call.tokensFromProvider,
    creditsByFormula: call.creditsByFormula,
    chargedCredits: call.chargedCredits,
  };
}

async function nextReviewFileIndex(directory: string, day: string) {
  const names = await readdir(directory);
  const pattern = new RegExp(
    `^${REVIEW_FILE_PREFIX}-${day}-(\\d+)\\.(?:jsonl|pretty\\.log)$`,
  );
  return (
    names.reduce((max, name) => {
      const match = name.match(pattern);
      const index = match ? Number(match[1]) : 0;
      return Number.isFinite(index) ? Math.max(max, index) : max;
    }, 0) + 1
  );
}

function renderPrettyReport(report: ReadableReview) {
  const lines = [
    '='.repeat(96),
    `${report.source} · traceId: ${report.traceId}`,
    '='.repeat(96),
  ];
  for (const block of report.blocks) {
    lines.push('', `${block.step}. ${block.title}`);
    for (const section of block.sections) {
      const countSuffix =
        typeof section.count === 'number'
          ? ` · кількість об'єктів: ${section.count}`
          : '';
      lines.push(
        '',
        section.usage
          ? `   ${section.label} · ${section.usage.credits} кредитів · ${section.usage.tokens} токенів o200k`
          : `   ${section.label} · ДІАГНОСТИКА · НЕ ОКРЕМИЙ AI-ВИКЛИК`,
        indent(JSON.stringify(section.value, null, 2), 6),
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
    'ВИКЛИКИ ПРОВАЙДЕРА ОКРЕМО',
    indent(JSON.stringify(report.providerCalls, null, 2), 3),
    '',
    'ПІДСУМОК УСЬОГО AI-ЦИКЛУ',
    indent(JSON.stringify(report.cycleProviderUsage, null, 2), 3),
  );
  return `${lines.join('\n')}\n\n`;
}

function parseRelevantCapsules(content: string) {
  return extractBlocks(content, 'RELEVANT_ENTRY_DIGEST').map((block) => {
    const date = firstMatch(block, /^Date:\s*(.+)$/m);
    const source = firstMatch(block, /^Source:\s*(.+)$/m);
    const summary = firstMatch(
      block,
      /^Summary of the user's previous writing:\s*(.+)$/m,
    );
    const dialogs = extractBlocks(block, 'FOLLOW_UP_DIALOG_PAIR', true).map(
      (dialog) => ({
        date: firstMatch(dialog, /^\[FOLLOW_UP_DIALOG_PAIR date=(.+)\]$/m),
        userFollowUpMessageDigest: stripSection(
          dialog,
          'USER_FOLLOW_UP_MESSAGE_DIGEST',
        ),
        nemoryMemoryFromResponseToThisMessage: parsePromptList(
          stripSection(dialog, 'NEMORY_MEMORY_FROM_RESPONSE_TO_THIS_MESSAGE'),
          'assistantMemory',
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
      followUpDialogPairsOldestToNewest: dialogs,
    };
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
