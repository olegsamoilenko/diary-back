import { AiService } from './ai.service';
import { MEMORY_FACT_FIDELITY } from './utils/memory-fact-fidelity';
import { describe, expect, it, jest } from '@jest/globals';

jest.mock('./utils/ai-request-debug', () => ({
  ...jest.requireActual<typeof import('./utils/ai-request-debug')>(
    './utils/ai-request-debug',
  ),
  writeAiRequestDebug: jest.fn(),
}));
import { AiModel } from '../users/types';
import { TokenType } from '../tokens/types';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ExtractAssistantMemoryCapsuleV2Dto } from './dto/extract-assistant-memory-capsule-v2.dto';
import { ExtractDialogMemoryCapsuleV2Dto } from './dto/extract-dialog-memory-capsule-v2.dto';
import { writeFullServerDebugLog } from './entry-flow-debug';

jest.mock('./entry-flow-debug', () => {
  const actual =
    jest.requireActual<typeof import('./entry-flow-debug')>(
      './entry-flow-debug',
    );
  return {
    ...actual,
    writeFullServerDebugLog: jest.fn(),
    logServerMemoryReview: jest.fn(),
  };
});

function writtenAiUsageLog(logType: 'ai_call' | 'cycle_summary') {
  const payload = jest
    .mocked(writeFullServerDebugLog)
    .mock.calls.map(([, value]) => value)
    .find(
      (value): value is Record<string, unknown> =>
        typeof value === 'object' &&
        value !== null &&
        'logType' in value &&
        value.logType === logType,
    );
  if (!payload) throw new Error(`Missing ${logType} file log`);
  return payload;
}

describe('AiService memory capsule V2 normalization', () => {
  const service = Object.create(AiService.prototype) as AiService;

  it('returns a rolling period brief through the existing action call without enabling assistant capsules', async () => {
    const subject = Object.create(AiService.prototype) as AiService;
    jest.spyOn(subject as any, 'buildMemoryCapsuleOutputRules').mockResolvedValue('');
    const extraction = jest.spyOn(subject as any, 'runMemoryCapsuleExtraction').mockResolvedValue({
      briefMemory: 'User rejected the initial hypothesis. A short pause remains untested.',
      assistantMemory: [{ kind:'other', topic:'other', content:'Must not become a second capsule' }],
      commitments: [], commitmentUpdates: [], scheduledReminders: [], scheduledReminderUpdates: [],
    });
    const result = await subject.extractAssistantMemoryCapsuleV2(1, { actionsOnly:true, text:'Try a short pause.',userText:'That hypothesis does not fit.',periodMemoryContext:JSON.stringify({previousBrief:'Initial hypothesis',pendingDialogs:[{question:'Correction',answer:'New explanation'}]}) });
    expect(result.briefMemory).toContain('User rejected');
    expect(result.assistantMemory).toEqual([]);
    expect(extraction).toHaveBeenCalledTimes(1);
    expect(extraction.mock.calls[0][1]).toContain('derive action arrays only from CURRENT USER/ASSISTANT TEXT');
    expect(extraction.mock.calls[0][1]).toContain('50–100 token');
  });

  it('preserves an explicit promise expiry but invents no deadline for an ongoing agreement', () => {
    const draft = { promiseKey: 'follow_up.work', promiseKind: 'follow_up', topic: 'work', content: 'Check this while the project runs', duration: 'ongoing' };
    expect((service as any).normalizePromiseItem(draft)).not.toHaveProperty('expiresAt');
    expect((service as any).normalizePromiseItem({ ...draft, expiresAt: '2026-10-03T15:00:00+03:00' })).toHaveProperty('expiresAt', '2026-10-03T12:00:00.000Z');
    expect((service as any).normalizePromiseItem({ ...draft, expiresAt: 'next month' })).not.toHaveProperty('expiresAt');
  });

  it('keeps local reminder keys unchanged for exact cancellation', () => {
    const reminderKey = 'nemory:entry%3AUUID%3Acall';
    expect((service as any).normalizeScheduledReminderUpdateItem({ reminderKey, status: 'cancelled' })).toEqual({ reminderKey, status: 'cancelled' });
  });

  it('allows a replacement promise with the same key only when the previous one is cancelled', async () => {
    const subject = Object.create(AiService.prototype) as AiService;
    jest.spyOn(subject as any, 'buildMemoryCapsuleOutputRules').mockResolvedValue('');
    jest.spyOn(subject as any, 'runMemoryCapsuleExtraction').mockResolvedValue({
      assistantMemory: [],
      commitments: [{ promiseKey: 'follow_up.work', promiseKind: 'follow_up', topic: 'work', content: 'New scope', importance: 3, duration: 'ongoing' }],
      commitmentUpdates: [{ promiseKey: 'follow_up.work', status: 'cancelled', content: 'User replaced the agreement' }],
    });
    const result = await subject.extractAssistantMemoryCapsuleV2(1, { text: 'Agreed to the replacement.', userText: 'Replace the previous scope.', activeCommitments: [{ key: 'follow_up.work', text: 'Old scope', status: 'open', duration: 'ongoing', triggerTags: [] }] });
    expect(result.commitments).toHaveLength(1);
    expect(result.commitmentUpdates).toEqual([expect.objectContaining({ promiseKey: 'follow_up.work', status: 'cancelled' })]);
  });

  it('extracts only actions for periodic responses without producing a second response capsule', async () => {
    const subject = Object.create(AiService.prototype) as AiService;
    jest.spyOn(subject as any, 'buildMemoryCapsuleOutputRules').mockResolvedValue('');
    jest.spyOn(subject as any, 'runMemoryCapsuleExtraction').mockResolvedValue({ assistantMemory: [{ kind: 'other', topic: 'other', content: 'Unwanted summary' }], commitments: [], commitmentUpdates: [], scheduledReminders: [], scheduledReminderUpdates: [] });
    const result = await subject.extractAssistantMemoryCapsuleV2(1, { actionsOnly: true, text: 'A completed daily analysis.', userText: '', activeCommitments: [] });
    expect(result.assistantMemory).toEqual([]);
    const args = (subject as any).runMemoryCapsuleExtraction.mock.calls[0];
    expect(args[2]).toBe(TokenType.NEMORY_ACTIONS);
    expect(args[3]).toBe('extract_nemory_actions');
    expect(args[1]).toContain('assistantMemory MUST be []');
    expect(args[1]).not.toContain('SOURCE CAPSULE');
    expect(args[1]).not.toContain('Compress EVERY distinct explanation');
  });

  it('action-only extraction preserves cancellation, reminder data and source time in a shorter prompt', async () => {
    const subject = Object.create(AiService.prototype) as AiService;
    jest.spyOn(subject as any, 'buildMemoryCapsuleOutputRules').mockResolvedValue('Return human-readable content in Ukrainian.');
    const extraction = jest.spyOn(subject as any, 'runMemoryCapsuleExtraction').mockResolvedValue({
      commitments: [],
      commitmentUpdates: [{ promiseKey: 'follow_up.work', status: 'cancelled', content: 'Cancelled explicitly' }],
      scheduledReminders: [{ reminderKey: 'reminder.call', text: 'Call', localDate: '2026-10-02', localTime: '13:00' }],
      scheduledReminderUpdates: [{ reminderKey: 'existing:key', status: 'cancelled' }],
    });
    const dto: ExtractAssistantMemoryCapsuleV2Dto = {
      sourceType: 'dialog', text: 'The notification request is acknowledged.', userText: 'Cancel the agreement and the old notification; remind me tomorrow at 13:00 to call.',
      sourceAt: '2026-10-01T11:00:00Z', currentLocalDate: '2026-10-01', currentLocalTime: '14:00', timezone: 'Europe/Kyiv',
      activeCommitments: [{ key: 'follow_up.work', text: 'Revisit work', status: 'open', duration: 'ongoing', triggerTags: [] }],
      activeScheduledReminders: [{ reminderKey: 'existing:key', text: 'Old call', localDate: '2026-10-02', localTime: '09:00' }],
    };
    await subject.extractAssistantMemoryCapsuleV2(1, dto);
    const original = extraction.mock.calls[0][1] as string;
    const result = await subject.extractAssistantMemoryCapsuleV2(1, { ...dto, actionsOnly: true });
    const compact = extraction.mock.calls[1][1] as string;
    const before = subject.countStringTokens([original], AiModel.GPT_5_6_LUNA);
    const after = subject.countStringTokens([compact], AiModel.GPT_5_6_LUNA);
    expect(after).toBeLessThan(before * 0.5);
    expect(compact).toContain('2026-10-01T11:00:00Z');
    expect(compact).toContain('existing:key');
    expect(compact).toContain('Return human-readable content in Ukrainian.');
    expect(result.commitmentUpdates).toHaveLength(1);
    expect(result.scheduledReminders).toHaveLength(1);
    expect(result.scheduledReminderUpdates).toHaveLength(1);
    expect(result.assistantMemory).toEqual([]);
  });

  it.each(['entry', 'checkin'] as const)(
    'labels the %s source capsule usage separately',
    async (sourceType) => {
      const subject = Object.create(AiService.prototype) as AiService;
      jest
        .spyOn(subject as any, 'buildMemoryCapsuleOutputRules')
        .mockResolvedValue('');
      const extraction = jest
        .spyOn(subject as any, 'runMemoryCapsuleExtraction')
        .mockResolvedValue({ userDigest: 'Facts', userMemory: [] });
      await subject.extractUserMemoryDetailsV2(1, {
        sourceType,
        text: 'A factual note.',
      });
      expect(extraction.mock.calls[0][2]).toBe(`${sourceType}_capsule`);
      expect(extraction.mock.calls[0][3]).toBe(
        'extract_user_memory_details_v2',
      );
    },
  );

  it.each<[ExtractAssistantMemoryCapsuleV2Dto['sourceType'], TokenType]>([
    ['entry', TokenType.ENTRY_RESPONSE_CAPSULE],
    ['checkin', TokenType.CHECKIN_RESPONSE_CAPSULE],
    ['dialog', TokenType.DIALOG_CAPSULE],
    [undefined, TokenType.ENTRY_RESPONSE_CAPSULE],
  ])(
    'labels the %s response capsule usage separately',
    async (sourceType, expected) => {
      const subject = Object.create(AiService.prototype) as AiService;
      jest
        .spyOn(subject as any, 'buildMemoryCapsuleOutputRules')
        .mockResolvedValue('');
      (subject as any).completeAiPromptUsageCycle = jest.fn();
      const extraction = jest
        .spyOn(subject as any, 'runMemoryCapsuleExtraction')
        .mockResolvedValue({ assistantMemory: [], commitments: [] });
      await subject.extractAssistantMemoryCapsuleV2(1, {
        sourceType,
        text: 'A factual reflection.',
      });
      expect(extraction.mock.calls[0][2]).toBe(expected);
      expect(extraction.mock.calls[0][3]).toBe(
        'extract_assistant_memory_capsule_v2',
      );
    },
  );

  it('includes an optional entry title in extraction and reflection prompts', () => {
    expect(
      (service as any).formatCurrentMemoryCapsuleInput(
        'entry',
        'Journal body',
        '<div>Demo preparation</div>',
      ),
    ).toBe(
      'CURRENT ENTRY TITLE:\n"""Demo preparation"""\n\n' +
        'CURRENT USER TEXT:\n"""Journal body"""',
    );
    expect(
      (service as any).formatCurrentJournalEntryForPrompt(
        '2026-07-12 21:48 Europe/Kiev',
        'Journal body',
        'tired',
        'Demo preparation',
      ),
    ).toBe(
      'Current journal entry (2026-07-12 21:48 Europe/Kiev):\n' +
        'Title: Demo preparation\nContent: Journal body\nMood: tired',
    );
  });

  it('preserves legacy prompt formatting when old clients omit the title', () => {
    expect(
      (service as any).formatCurrentMemoryCapsuleInput('entry', 'Journal body'),
    ).toBe('CURRENT USER TEXT:\n"""Journal body"""');
    expect(
      (service as any).formatCurrentJournalEntryForPrompt(
        '2026-07-12 21:48 Europe/Kiev',
        'Journal body',
        'tired',
      ),
    ).toBe(
      'Current journal entry (2026-07-12 21:48 Europe/Kiev): Journal body. mood: tired',
    );
  });

  it('normalizes exact scheduled reminders separately from ongoing promises', () => {
    const result = (service as any).normalizeAssistantMemoryCapsuleV2({
      assistantMemory: [],
      commitments: [],
      commitmentUpdates: [],
      scheduledReminders: [
        {
          reminderKey: 'reminder.presentation',
          text: 'Підготувати презентацію',
          localDate: '2026-08-10',
          localTime: '09:30',
        },
        {
          reminderKey: 'reminder.invalid',
          text: 'Invalid',
          localDate: 'tomorrow',
          localTime: 'morning',
        },
      ],
      scheduledReminderUpdates: [
        { reminderKey: 'reminder.old', status: 'cancelled' },
      ],
    });

    expect(result.scheduledReminders).toEqual([
      {
        reminderKey: 'reminder.presentation',
        text: 'Підготувати презентацію',
        localDate: '2026-08-10',
        localTime: '09:30',
      },
    ]);
    expect(result.scheduledReminderUpdates).toEqual([
      { reminderKey: 'reminder.old', status: 'cancelled' },
    ]);
  });

  it('keeps dialog length in the system prompt without a reduced provider cap', () => {
    expect(service.getMaxOutTokens('dialog')).toBe(2500);
    expect(service.getMaxOutTokens('checkin_dialog')).toBe(2500);

    const entryRules = (service as any).buildDialogResponseDiscipline('dialog');
    const checkinRules = (service as any).buildDialogResponseDiscipline(
      'checkin_dialog',
    );
    expect(entryRules).toContain('maximum 2000 characters');
    expect(checkinRules).toContain('maximum 1500 characters');
    expect(checkinRules).toContain(
      'normal average-length target is 1100-1350 characters',
    );
    expect(checkinRules).toContain(
      'may expand beyond the average target up to 1500 characters',
    );
    expect(checkinRules).toContain('rewrite it shorter before emitting');
    expect(entryRules).toContain('Якщо хочеш, можу...');
    expect(entryRules).toContain('do not routinely offer additional help');
  });

  it('stores check-in response usage separately from entry usage', () => {
    expect((service as any).getResponseTokenType('entry')).toBe(
      TokenType.ENTRY,
    );
    expect((service as any).getResponseTokenType('checkin')).toBe(
      TokenType.CHECKIN,
    );
    expect((service as any).getResponseTokenType('dialog')).toBe(
      TokenType.ENTRY_DIALOG,
    );
    expect((service as any).getResponseTokenType('checkin_dialog')).toBe(
      TokenType.CHECKIN_DIALOG,
    );
  });

  it('keeps normalized tags and clamps unsupported claims', () => {
    const result = (service as any).normalizeUserMemoryCapsuleV2({
      importance: 99,
      userDigest: '  Current   situation\nwith useful details.  ',
      tags: [
        { key: 'domain.work', type: 'domain', confidence: 2 },
        { key: 'wrong.tag', type: 'state', confidence: 1 },
      ],
      userMemory: [
        {
          kind: 'goal',
          topic: 'work',
          content: '  Завершити   перший реліз ',
          importance: 4,
        },
      ],
    });

    expect(result.schemaVersion).toBe(2);
    expect(result.importance).toBe(5);
    expect(result.tags).toEqual([
      { key: 'domain.work', type: 'domain', confidence: 1 },
    ]);
    expect(result.userDigest).toBe('Current situation with useful details.');
    expect(result.userMemory).toEqual([
      {
        kind: 'goal',
        topic: 'work',
        content: 'Завершити перший реліз',
        importance: 4,
      },
    ]);
  });

  it('keeps every distinct valid long-term user memory item', () => {
    const userMemory = Array.from({ length: 14 }, (_, index) => ({
      kind: 'fact',
      topic: 'self',
      content: `Distinct durable insight ${index + 1}`,
      importance: 3,
    }));

    const result = (service as any).normalizeUserMemoryCapsuleV2({
      userDigest: 'Dense entry digest',
      userMemory,
    });

    expect(result.userMemory).toHaveLength(14);
    expect(result.userMemory).toEqual(userMemory);
  });

  it('deduplicates overlapping memory from one source without collapsing distinct insights', () => {
    const result = (service as any).normalizeUserMemoryCapsuleV2({
      userDigest: 'Dense entry digest',
      problems: [
        {
          topic: 'work',
          content:
            'Opening work email on a day off prevented detachment from a new task and caused prolonged rumination about it',
          importance: 4,
        },
        {
          topic: 'work',
          content:
            'Opening work email on a day off made detachment from the new task difficult',
          importance: 3,
        },
        {
          topic: 'work',
          content:
            'New work tasks are perceived as urgent even without a direct request, making priorities difficult to determine',
          importance: 4,
        },
      ],
      userMemory: [
        {
          kind: 'pattern',
          topic: 'work',
          content:
            'New work tasks are usually perceived as urgent even without a direct request',
          importance: 3,
        },
        {
          kind: 'boundary',
          topic: 'work',
          content: 'Wants to keep weekends protected from work email',
          importance: 4,
        },
      ],
    });

    expect(result.userMemory).toEqual([
      {
        kind: 'vulnerability',
        topic: 'work',
        content:
          'Opening work email on a day off prevented detachment from a new task and caused prolonged rumination about it',
        importance: 4,
      },
      {
        kind: 'vulnerability',
        topic: 'work',
        content:
          'New work tasks are perceived as urgent even without a direct request, making priorities difficult to determine',
        importance: 4,
      },
      {
        kind: 'boundary',
        topic: 'work',
        content: 'Wants to keep weekends protected from work email',
        importance: 4,
      },
    ]);
  });

  it('instructs user-memory extraction to deduplicate only the current source', async () => {
    const extractionService = Object.create(AiService.prototype) as AiService;
    let extractionPrompt = '';
    (extractionService as any).logger = { log: jest.fn() };
    (extractionService as any).memoryTagCatalogV2Service = {
      getGroupedCatalog: jest.fn(async () => ({
        domains: [],
        states: [],
        mechanisms: [],
        knownEntities: [],
        knownThreads: [],
      })),
      markUsed: jest.fn(async () => undefined),
    };
    jest
      .spyOn(extractionService as any, 'buildMemoryCapsuleOutputRules')
      .mockResolvedValue('Write output in Ukrainian.');
    jest
      .spyOn(extractionService as any, 'runMemoryCapsuleExtraction')
      .mockImplementation(async (_userId: number, prompt: string) => {
        extractionPrompt = prompt;
        return {
          schemaVersion: 2,
          tags: [],
          newTags: [],
          importance: 1,
          userDigest: 'Digest',
          problems: [],
          userMemory: [],
        };
      });

    await extractionService.extractUserMemoryCapsuleV2(1, {
      sourceType: 'entry',
      text: 'A meaningful current entry.',
    });

    expect(extractionPrompt).toMatch(
      /compare every candidate across problems and\s+userMemory/,
    );
    expect(extractionPrompt).toMatch(
      /durable insight\s+must appear only once in this extraction/,
    );
    expect(extractionPrompt).toContain(
      'Recurrence across different dated entries is handled outside this request',
    );
    expect(extractionPrompt).toContain(
      'The kind and topic fields are machine-readable enums',
    );
    expect(extractionPrompt).toContain('Treat explicit continuation language');
    expect(extractionPrompt).toContain(
      'exactly one catalog thread is a strong subject',
    );
    expect(extractionPrompt).toContain(
      'Extract EVERY emotional, bodily-energy or functional',
    );
    expect(extractionPrompt).toContain(
      'work fatigue and family fatigue are both state.fatigue',
    );
  });

  it('skips retrieval-tag generation while the feature is disabled', async () => {
    const extractionService = Object.create(AiService.prototype) as AiService;
    let extractionPrompt = '';
    const markUsed = jest.fn(async () => undefined);
    (extractionService as any).memoryTagCatalogV2Service = {
      getGroupedCatalog: jest.fn(async () => ({
        domains: [{ key: 'domain.work' }],
        states: [],
        mechanisms: [],
        knownEntities: [],
        knownThreads: [],
      })),
      markUsed,
    };
    jest
      .spyOn(extractionService as any, 'buildMemoryCapsuleOutputRules')
      .mockResolvedValue('Write output in Ukrainian.');
    jest
      .spyOn(extractionService as any, 'runMemoryCapsuleExtraction')
      .mockImplementation(async (_userId: number, prompt: string) => {
        extractionPrompt = prompt;
        return {
          schemaVersion: 2,
          tags: [{ key: 'domain.work', type: 'domain', confidence: 0.9 }],
          newTags: [],
          userDigest: 'Final journal update.',
          importance: 4,
        };
      });

    const result = await extractionService.buildRetrievalIndexV2(1, {
      sourceType: 'entry',
      text: 'Final saved journal text.',
      personalTagCatalog: {
        domains: [],
        states: [],
        mechanisms: [],
        knownEntities: [],
        knownThreads: [
          {
            key: 'thread.existing_project',
            label: 'Existing project',
            description: 'A continuing work project',
            distinctRecordCount: 3,
            associatedDomains: ['domain.work'],
          },
        ],
      },
    });

    expect(result.tags).toEqual([]);
    expect(result.newTags).toEqual([]);
    expect(result.userDigest).toBe('Final saved journal text.');
    expect(extractionPrompt).toBe('');
    expect(markUsed).not.toHaveBeenCalled();
  });

  it('falls back to the cleaned source when the retrieval digest is not shorter', async () => {
    const extractionService = Object.create(AiService.prototype) as AiService;
    (extractionService as any).memoryTagCatalogV2Service = {
      getGroupedCatalog: jest.fn(async () => ({
        domains: [],
        states: [],
        mechanisms: [],
        knownEntities: [],
        knownThreads: [],
      })),
      markUsed: jest.fn(async () => undefined),
    };
    jest
      .spyOn(extractionService as any, 'buildMemoryCapsuleOutputRules')
      .mockResolvedValue('Write output in Ukrainian.');
    jest
      .spyOn(extractionService as any, 'runMemoryCapsuleExtraction')
      .mockResolvedValue({
        schemaVersion: 2,
        tags: [],
        newTags: [],
        userDigest:
          'The model expanded this short entry into a longer and unnecessary explanation.',
        importance: 2,
      });

    const result = await extractionService.buildRetrievalIndexV2(1, {
      sourceType: 'entry',
      text: '  A short saved entry.  ',
      personalTagCatalog: {
        domains: [],
        states: [],
        mechanisms: [],
        knownEntities: [],
        knownThreads: [],
      },
    });

    expect(result.userDigest).toBe('A short saved entry.');
  });

  it('extracts digest and durable user memory without sending tag catalogs', async () => {
    const extractionService = Object.create(AiService.prototype) as AiService;
    let extractionPrompt = '';
    jest
      .spyOn(extractionService as any, 'buildMemoryCapsuleOutputRules')
      .mockResolvedValue('Write output in Ukrainian.');
    jest
      .spyOn(extractionService as any, 'runMemoryCapsuleExtraction')
      .mockImplementation(
        async (
          _userId: number,
          prompt: string,
          _tokenType: unknown,
          _operation: string,
          _traceId: string | undefined,
          _cycleComplete: boolean,
          options: { onUsage?: (value: unknown) => void } | undefined,
        ) => {
          extractionPrompt = prompt;
          options?.onUsage?.({
            model: 'gpt-5-mini',
            estimated: false,
            finishReason: 'stop',
            tokensFromProvider: {
              inputTotal: 100,
              standardInput: 100,
              cacheReadInput: 0,
              cacheWriteInput: 0,
              output: 20,
              total: 120,
            },
            chargedCredits: { input: 1, output: 1, total: 2 },
          });
          return {
            schemaVersion: 2,
            importance: 4,
            userDigest: 'Dense digest',
            problems: [
              {
                topic: 'work',
                content: 'Experienced anxiety before the presentation',
                importance: 4,
              },
            ],
            userMemory: [],
          };
        },
      );

    const result = await extractionService.extractUserMemoryDetailsV2(1, {
      sourceType: 'entry',
      text: 'Final saved journal text.',
    });

    expect(result.userDigest).toBe('Dense digest');
    expect(result.userMemory).toEqual([
      {
        kind: 'vulnerability',
        topic: 'work',
        content: 'Experienced anxiety before the presentation',
        importance: 4,
      },
    ]);
    expect(result.usage).toEqual(
      expect.objectContaining({ model: 'gpt-5-mini' }),
    );
    expect(extractionPrompt).toContain('USER DIGEST RULES');
    expect(extractionPrompt).toContain(MEMORY_FACT_FIDELITY);
    expect(extractionPrompt).toContain('LONG-TERM USER MEMORY RULES');
    expect(extractionPrompt).toContain('DURABLE MEMORY SELECTION');
    expect(extractionPrompt).toContain('Apply the same criteria to problems');
    expect(extractionPrompt).toContain('initial interpretation');
    expect(extractionPrompt).toContain(
      'The current source text has 25 characters',
    );
    expect(extractionPrompt).not.toContain('searchQueries');
    expect(extractionPrompt).not.toContain('full-text index');
    expect(extractionPrompt).toContain('meaningful block');
    expect(extractionPrompt).toContain('BLOCK-BY-BLOCK COMPRESSION');
    expect(extractionPrompt).toContain('at most 5 high-quality');
    expect(extractionPrompt).toContain(
      'kind and topic are machine-readable enum fields',
    );
    expect(extractionPrompt).toContain('never translate or transliterate them');
    expect(extractionPrompt).not.toContain('GLOBAL TAG CATALOG');
    expect(extractionPrompt).not.toContain('PERSONAL TAG CATALOG');
    expect(extractionPrompt).toContain('Do not generate tags');
  });

  it('stores explicit problems as dated vulnerability memory items', () => {
    const result = (service as any).normalizeUserMemoryCapsuleV2({
      userDigest: 'Presentation reflection',
      problems: [
        {
          topic: 'work',
          content: 'Experiences strong physical anxiety before presentations',
          importance: 4,
        },
      ],
      userMemory: [
        {
          kind: 'coping_strategy',
          topic: 'mental_health',
          content: 'Uses slower breathing before presentations',
          importance: 3,
        },
      ],
    });

    expect(result.userMemory).toEqual([
      {
        kind: 'vulnerability',
        topic: 'work',
        content: 'Experiences strong physical anxiety before presentations',
        importance: 4,
      },
      {
        kind: 'coping_strategy',
        topic: 'mental_health',
        content: 'Uses slower breathing before presentations',
        importance: 3,
      },
    ]);
  });

  it('canonicalizes exact Ukrainian topic translations in V2 user memory', () => {
    const raw = {
      userDigest: 'Підсумок',
      problems: [
        {
          topic: 'робота',
          content: 'Розмова з керівником викликає значне напруження',
          importance: 4,
        },
        {
          topic: 'продуктивність',
          content: 'Відкладання підготовки завершується виснаженням',
          importance: 3,
        },
      ],
      userMemory: [
        {
          kind: 'goal',
          topic: 'психічне здоровʼя',
          content: 'Прагне спокійніше входити у складні робочі розмови',
          importance: 3,
        },
      ],
    };
    const diagnosticService = service as any;

    const normalized = diagnosticService.normalizeUserMemoryCapsuleV2(raw);
    const diagnostics =
      diagnosticService.buildUserMemoryNormalizationDiagnostics(
        raw,
        normalized.userMemory.length,
      );

    expect(normalized.userMemory).toEqual([
      expect.objectContaining({ kind: 'vulnerability', topic: 'work' }),
      expect.objectContaining({
        kind: 'vulnerability',
        topic: 'productivity',
      }),
      expect.objectContaining({ kind: 'goal', topic: 'mental_health' }),
    ]);
    expect(diagnostics).toEqual(
      expect.objectContaining({
        validCandidateCount: 3,
        rejectedCandidateCount: 0,
        normalizedUserMemoryCount: 3,
        normalizedCandidates: [
          expect.objectContaining({
            originalTopic: 'робота',
            normalizedTopic: 'work',
          }),
          expect.objectContaining({
            originalTopic: 'продуктивність',
            normalizedTopic: 'productivity',
          }),
          expect.objectContaining({
            originalTopic: 'психічне здоровʼя',
            normalizedTopic: 'mental_health',
          }),
        ],
      }),
    );
  });

  it('explains which raw user-memory candidates normalization rejected', () => {
    const raw = {
      problems: [
        {
          topic: 'work',
          content: 'Experiences anxiety before presentations',
          importance: 4,
        },
      ],
      userMemory: [
        {
          kind: 'goal',
          topic: 'career',
          content: 'Prepare for the demo',
        },
        'not-an-object',
      ],
    };
    const diagnosticService = service as unknown as {
      normalizeUserMemoryCapsuleV2(value: unknown): { userMemory: unknown[] };
      buildUserMemoryNormalizationDiagnostics(
        value: unknown,
        normalizedCount: number,
      ): {
        rawTopLevelType: string;
        totalCandidateCount: number;
        validCandidateCount: number;
        rejectedCandidateCount: number;
        rejectedCandidates: Array<{
          source: string;
          index: number;
          reasons: string[];
        }>;
        removedDuringCleanupOrDeduplication: number;
        normalizedUserMemoryCount: number;
      };
    };
    const normalized = diagnosticService.normalizeUserMemoryCapsuleV2(raw);
    const diagnostics =
      diagnosticService.buildUserMemoryNormalizationDiagnostics(
        raw,
        normalized.userMemory.length,
      );

    expect(diagnostics).toEqual(
      expect.objectContaining({
        rawTopLevelType: 'object',
        totalCandidateCount: 3,
        validCandidateCount: 1,
        rejectedCandidateCount: 2,
        removedDuringCleanupOrDeduplication: 0,
        normalizedUserMemoryCount: 1,
      }),
    );
    expect(diagnostics.rejectedCandidates).toEqual([
      expect.objectContaining({
        source: 'userMemory',
        index: 0,
        reasons: [
          'topic_is_missing_or_not_allowed',
          'importance_is_missing_or_not_numeric',
        ],
      }),
      expect.objectContaining({
        source: 'userMemory',
        index: 1,
        reasons: ['candidate_is_not_an_object'],
      }),
    ]);
  });

  it('normalizes assistant long-term memory, promises and lifecycle updates', () => {
    const result = (service as any).normalizeAssistantMemoryCapsuleV2({
      assistantMemory: [
        {
          kind: 'strategy',
          topic: 'work',
          content: '  Checks available capacity before accepting more work. ',
          importance: 7,
        },
      ],
      commitments: [
        {
          kind: 'promise',
          promiseKey: 'follow_up.sleep',
          promiseKind: 'follow_up',
          topic: 'sleep',
          content: 'Ask how sleep changed',
          importance: 4,
          duration: 'ongoing',
          status: 'anything',
          triggerTags: ['domain.sleep'],
        },
      ],
      commitmentUpdates: [
        {
          kind: 'promise_update',
          promiseKey: 'old.follow_up',
          status: 'fulfilled',
          content: 'Done',
        },
      ],
    });

    expect(result.assistantMemory).toEqual([
      {
        kind: 'strategy',
        topic: 'work',
        content: 'Checks available capacity before accepting more work.',
        importance: 5,
      },
    ]);
    expect(result.commitments[0].status).toBe('open');
    expect(result.commitments[0].duration).toBe('ongoing');
    expect(result.commitmentUpdates[0].status).toBe('fulfilled');
  });

  it('normalizes both sides of a dialog turn without retelling the user as assistant memory', () => {
    const result = (service as any).normalizeDialogMemoryCapsuleV2(
      {
        user: {
          representation: 'digest',
          text: '  Felt anxious before the meeting and moved it to Friday. ',
          tags: [{ key: 'state.anxiety', type: 'state', confidence: 0.9 }],
          userMemory: [
            {
              kind: 'vulnerability',
              topic: 'work',
              content: 'Feels anxious before important meetings',
              importance: 4,
            },
          ],
        },
        assistant: {
          text: ' Suggested writing one request and rehearsing its first sentence. ',
          assistantMemory: [
            {
              kind: 'strategy',
              topic: 'work',
              content:
                'Prepares one clear request before a difficult manager conversation',
              importance: 4,
            },
          ],
          continuationSummary:
            ' Suggested writing one request and rehearsing its first sentence. ',
          reflectionSummary:
            'Recommended preparing one request before the meeting.',
        },
        commitments: [],
        commitmentUpdates: [],
      },
      'What should I do before the meeting?',
    );

    expect(result.user).toMatchObject({
      representation: 'digest',
      text: 'Felt anxious before the meeting and moved it to Friday.',
      tags: [{ key: 'state.anxiety', type: 'state', confidence: 0.9 }],
      userMemory: ['Feels anxious before important meetings'],
    });
    expect(result.assistant).toEqual({
      text: 'Suggested writing one request and rehearsing its first sentence.',
      assistantMemory: [
        'Prepares one clear request before a difficult manager conversation',
      ],
      continuationSummary: '',
      reflectionSummary: '',
    });
  });

  it('treats an accepted reminder request as an ongoing Nemory promise', async () => {
    const dialogService = Object.create(AiService.prototype) as AiService;
    let extractionPrompt = '';
    let extractionOptions: Record<string, unknown> | undefined;
    (dialogService as any).memoryTagCatalogV2Service = {
      getGroupedCatalog: jest.fn(async () => ({
        domains: [],
        states: [],
        mechanisms: [],
        knownEntities: [],
        knownThreads: [],
      })),
      markUsed: jest.fn(async () => undefined),
    };
    jest
      .spyOn(dialogService as any, 'runMemoryCapsuleExtraction')
      .mockImplementation(async (...args: unknown[]) => {
        const prompt = args[1] as
          | string
          | { staticPrompt: string; dynamicPrompt: string };
        extractionPrompt =
          typeof prompt === 'string'
            ? prompt
            : `${prompt.staticPrompt}\n${prompt.dynamicPrompt}`;
        extractionOptions = args[6] as Record<string, unknown> | undefined;
        return {
          user: {
            representation: 'digest',
            text: 'Asked for a future overload reminder about weekly walks.',
            tags: [],
            newTags: [],
            importance: 4,
            userMemory: [],
          },
          assistant: {
            assistantMemory: [
              'Checks whether restorative walks remain protected during periods of overload',
            ],
            continuationSummary:
              'Agreed to remind about the walks when overload is discussed again.',
            reflectionSummary:
              'Confirmed a future reminder connected to overload.',
          },
          commitments: [
            {
              kind: 'promise',
              promiseKey: 'reminder.overload_walks',
              promiseKind: 'reminder',
              topic: 'productivity',
              content:
                'Remind about checking whether short walks remain in the week when overload is discussed',
              importance: 4,
              duration: 'ongoing',
              status: 'open',
              triggerTags: ['state.overwhelm'],
            },
          ],
          commitmentUpdates: [],
        };
      });

    const result = await dialogService.extractDialogMemoryCapsuleV2(1, {
      userText:
        'When we discuss overload again, remind me to check whether the walks are still in the week.',
      assistantText:
        'Agreed. When overload comes up again, I will remind you to check the walks.',
      activeCommitments: [],
    });

    expect(extractionPrompt).toContain('MANDATORY');
    expect(extractionPrompt).toContain(
      'assistantMemory preserves the meaningful blocks of THIS response',
    );
    expect(extractionPrompt).toContain(
      'do not reduce an explanatory answer to a list of recommendations',
    );
    expect(extractionPrompt).toContain('retain them as hypotheses, not facts');
    expect(extractionPrompt).toContain(
      'text is a compact summary of what Nemory actually answered',
    );
    expect(extractionPrompt).not.toContain('at most 500 characters');
    expect(extractionPrompt).toContain(
      'Follow the per-source compression policy in DYNAMIC INPUT',
    );
    expect(extractionPrompt).toContain('MANDATORY DURABLE-STRATEGY RULE');
    expect(extractionPrompt).toContain(
      'ordering 12 photos, identifying duplicates',
    );
    expect(extractionPrompt).toContain('commitments MUST contain an');
    expect(extractionPrompt).toContain('as user profile data is incorrect');
    expect(extractionPrompt).toContain('TAG GENERATION IS DISABLED');
    expect(extractionPrompt).toContain(
      'Return user.tags = [] and user.newTags = []',
    );
    expect(extractionPrompt).not.toContain('GLOBAL TAG CATALOG');
    expect(extractionPrompt).not.toContain('PERSONAL TAG CATALOG');
    expect(extractionPrompt).toContain('SOURCE TYPE: dialog');
    expect(extractionOptions).toEqual(
      expect.objectContaining({
        sourceType: 'dialog',
        cacheStaticPrefix: true,
      }),
    );
    expect(result.user.userMemory).toEqual([]);
    expect(result.assistant.assistantMemory).toEqual([
      expect.stringContaining('restorative walks'),
    ]);
    expect(result.commitments).toEqual([
      expect.objectContaining({
        promiseKey: 'reminder.overload_walks',
        promiseKind: 'reminder',
        duration: 'ongoing',
        status: 'open',
      }),
    ]);
  });

  it('repairs a missing commitment when an explicit future request was accepted', async () => {
    const dialogService = Object.create(AiService.prototype) as AiService;
    (dialogService as any).memoryTagCatalogV2Service = {
      getGroupedCatalog: jest.fn(async () => ({
        domains: [],
        states: [],
        mechanisms: [],
        knownEntities: [],
        knownThreads: [],
      })),
      markUsed: jest.fn(async () => undefined),
    };
    const extraction = jest
      .spyOn(dialogService as any, 'runMemoryCapsuleExtraction')
      .mockResolvedValueOnce({
        user: {
          representation: 'digest',
          text: 'Попросив нагадати про прогулянки під час наступної розмови про перевантаження.',
          tags: [],
          newTags: [],
          importance: 4,
          userMemory: [],
        },
        assistant: {
          continuationSummary:
            'Nemory погодилась нагадати про прогулянки при наступній розмові про перевантаження.',
          reflectionSummary:
            'Nemory погодилась на майбутнє нагадування про прогулянки.',
        },
        commitments: [],
        commitmentUpdates: [],
      })
      .mockResolvedValueOnce({
        commitment: {
          kind: 'promise',
          promiseKey: 'reminder.overload_walks',
          promiseKind: 'reminder',
          topic: 'productivity',
          content:
            'Нагадати перевірити, чи залишилися прогулянки в тижні, коли знову говоритимемо про перевантаження',
          importance: 4,
          duration: 'ongoing',
          status: 'open',
          triggerTags: ['state.overwhelm'],
        },
      });

    const result = await dialogService.extractDialogMemoryCapsuleV2(1, {
      userText:
        'Коли ми знову говоритимемо про перевантаження, нагадай мені перевірити, чи залишилися ці прогулянки в тижні.',
      assistantText:
        'Домовились. Коли повернемось до теми перевантаження, я нагадаю тобі перевірити прогулянки.',
      activeCommitments: [],
      timingTraceId: 'repair-test',
    });

    expect(extraction).toHaveBeenCalledTimes(2);
    expect(extraction.mock.calls[1][3]).toBe(
      'repair_missing_dialog_commitment_v2',
    );
    expect(result.commitments).toEqual([
      expect.objectContaining({
        promiseKey: 'reminder.overload_walks',
        promiseKind: 'reminder',
        duration: 'ongoing',
      }),
    ]);
  });

  it('creates a deterministic commitment when AI repair misses an accepted reminder', async () => {
    const dialogService = Object.create(AiService.prototype) as AiService;
    (dialogService as any).logger = { warn: jest.fn() };
    (dialogService as any).memoryTagCatalogV2Service = {
      getGroupedCatalog: jest.fn(async () => ({
        domains: [],
        states: [],
        mechanisms: [],
        knownEntities: [],
        knownThreads: [],
      })),
      markUsed: jest.fn(async () => undefined),
    };
    const extraction = jest
      .spyOn(dialogService as any, 'runMemoryCapsuleExtraction')
      .mockResolvedValueOnce({
        user: {
          representation: 'digest',
          text: 'Просить у наступних записах нагадувати перевіряти реальний обсяг роботи, перш ніж жертвувати сном.',
          tags: [
            { key: 'domain.work', type: 'domain', confidence: 0.95 },
            { key: 'domain.sleep', type: 'domain', confidence: 0.98 },
            {
              key: 'mechanism.load_management',
              type: 'mechanism',
              confidence: 0.95,
            },
          ],
          newTags: [],
          importance: 4,
          userMemory: [],
        },
        assistant: {
          assistantMemory: [],
          continuationSummary: 'Домовилися про майбутнє нагадування.',
          reflectionSummary: 'Погоджено майбутнє нагадування.',
        },
        commitments: [],
        commitmentUpdates: [],
      })
      .mockResolvedValueOnce({ commitment: null });

    const userText =
      'А можеш у наступних записах нагадувати мені спочатку перевіряти реальний обсяг роботи, перш ніж жертвувати сном?';
    const assistantText =
      'Домовилися: у наступних записах, де дедлайн або тривога підштовхуватимуть тебе жертвувати сном, я спершу нагадаю оцінити реальний обсяг роботи й визначити мінімально достатній результат.';
    const result = await dialogService.extractDialogMemoryCapsuleV2(1, {
      userText,
      assistantText,
      activeCommitments: [],
      timingTraceId: 'deterministic-repair-test',
    });

    expect(extraction).toHaveBeenCalledTimes(2);
    expect(result.commitments).toEqual([
      expect.objectContaining({
        promiseKey: expect.stringMatching(
          /^reminder\.other\.accepted_[a-f0-9]{16}$/,
        ),
        promiseKind: 'reminder',
        topic: 'other',
        content: expect.stringContaining('я спершу нагадаю'),
        duration: 'ongoing',
        status: 'open',
        triggerTags: [],
      }),
    ]);
    expect((dialogService as any).logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('deterministic fallback created'),
    );
  });

  it('repairs an explicit promise missed in an entry or check-in reflection', async () => {
    const reflectionService = Object.create(AiService.prototype) as AiService;
    const extraction = jest
      .spyOn(reflectionService as any, 'runMemoryCapsuleExtraction')
      .mockResolvedValueOnce({
        assistantMemory: [],
        commitments: [],
        commitmentUpdates: [],
      })
      .mockResolvedValueOnce({
        commitment: {
          kind: 'promise',
          promiseKey: 'follow_up.presentation_anxiety',
          promiseKind: 'follow_up',
          topic: 'work',
          content:
            'Запитати про рівень напруги перед наступним важливим виступом',
          importance: 4,
          duration: 'ongoing',
          status: 'open',
          triggerTags: ['state.anxiety'],
        },
      });

    const result = await reflectionService.extractAssistantMemoryCapsuleV2(1, {
      userText: 'Перед сьогоднішньою презентацією знову сильно нервував.',
      text: 'Наступного разу я запитаю, як змінилася напруга перед виступом.',
      activeCommitments: [],
      timingTraceId: 'reflection-repair-test',
    });

    expect(extraction).toHaveBeenCalledTimes(2);
    expect(extraction.mock.calls[1][3]).toBe(
      'repair_missing_assistant_commitment_v2',
    );
    expect(result.commitments).toEqual([
      expect.objectContaining({
        promiseKey: 'follow_up.presentation_anxiety',
        promiseKind: 'follow_up',
        duration: 'ongoing',
      }),
    ]);
  });

  it('does not repair ordinary reflection advice into a Nemory promise', async () => {
    const reflectionService = Object.create(AiService.prototype) as AiService;
    (reflectionService as any).completeAiPromptUsageCycle = jest.fn();
    const extraction = jest
      .spyOn(reflectionService as any, 'runMemoryCapsuleExtraction')
      .mockResolvedValue({
        assistantMemory: [],
        commitments: [],
        commitmentUpdates: [],
      });

    const result = await reflectionService.extractAssistantMemoryCapsuleV2(1, {
      userText: 'Що робити з хвилюванням перед презентацією?',
      text: 'Спробуй заздалегідь підготувати перше речення виступу.',
      activeCommitments: [],
      timingTraceId: 'reflection-no-repair-test',
    });

    expect(extraction).toHaveBeenCalledTimes(1);
    expect(result.commitments).toEqual([]);
    expect(
      (reflectionService as any).completeAiPromptUsageCycle,
    ).toHaveBeenCalledWith(
      'reflection-no-repair-test',
      'extract_assistant_memory_capsule_v2',
    );
  });

  it('does not run commitment repair for an ordinary advice request', async () => {
    const dialogService = Object.create(AiService.prototype) as AiService;
    (dialogService as any).memoryTagCatalogV2Service = {
      getGroupedCatalog: jest.fn(async () => ({
        domains: [],
        states: [],
        mechanisms: [],
        knownEntities: [],
        knownThreads: [],
      })),
      markUsed: jest.fn(async () => undefined),
    };
    (dialogService as any).completeAiPromptUsageCycle = jest.fn();
    const extraction = jest
      .spyOn(dialogService as any, 'runMemoryCapsuleExtraction')
      .mockResolvedValue({
        user: {
          representation: 'verbatim',
          text: 'Що мені робити?',
          tags: [],
          newTags: [],
          importance: 2,
          userMemory: [],
        },
        assistant: {
          continuationSummary: 'Запропонувала один наступний крок.',
          reflectionSummary: 'Запропонувала один наступний крок.',
        },
        commitments: [],
        commitmentUpdates: [],
      });

    const result = await dialogService.extractDialogMemoryCapsuleV2(1, {
      userText: 'Що мені робити?',
      assistantText: 'Спробуй сьогодні зробити один невеликий крок.',
      activeCommitments: [],
      timingTraceId: 'no-repair-test',
    });

    expect(extraction).toHaveBeenCalledTimes(1);
    expect(extraction.mock.calls[0][2]).toBe(TokenType.DIALOG_CAPSULE);
    expect(result.commitments).toEqual([]);
    expect(
      (dialogService as any).completeAiPromptUsageCycle,
    ).toHaveBeenCalledWith(
      'no-repair-test',
      'extract_dialog_memory_capsule_v2',
    );
  });

  it('marks exact soniac-prefixed dialog turns as developer exchanges during extraction', async () => {
    const dialogService = Object.create(AiService.prototype) as AiService;
    (dialogService as any).memoryTagCatalogV2Service = {
      getGroupedCatalog: jest.fn(async () => ({
        domains: [],
        states: [],
        mechanisms: [],
        knownEntities: [],
        knownThreads: [],
      })),
      markUsed: jest.fn(async () => undefined),
    };
    (dialogService as any).completeAiPromptUsageCycle = jest.fn();
    const extraction = jest
      .spyOn(dialogService as any, 'runMemoryCapsuleExtraction')
      .mockResolvedValue({
        user: {
          representation: 'digest',
          text: 'Технічне повідомлення розробника.',
          tags: [],
          newTags: [],
          importance: 1,
          userMemory: [],
        },
        assistant: {
          text: 'Nemory відповіла на технічне питання.',
          assistantMemory: [],
        },
        commitments: [],
        commitmentUpdates: [],
        scheduledReminders: [],
        scheduledReminderUpdates: [],
      });

    await dialogService.extractDialogMemoryCapsuleV2(1, {
      userText: 'soniac перевір системний промпт',
      assistantText: 'Перевірила системний промпт.',
      activeCommitments: [],
      timingTraceId: 'developer-marker-test',
    });

    const prompt = extraction.mock.calls[0][1] as {
      staticPrompt: string;
      dynamicPrompt: string;
    };
    expect(prompt.staticPrompt).toContain(
      'DEVELOPER MESSAGE MARKER (HARD RULE)',
    );
    expect(prompt.staticPrompt).toContain(MEMORY_FACT_FIDELITY);
    expect(prompt.staticPrompt).toContain(
      'return empty tags, newTags, userMemory, assistantMemory, commitments',
    );
    expect(prompt.dynamicPrompt).toContain(
      'CURRENT USER MESSAGE:\n"""soniac перевір системний промпт"""',
    );
  });

  it('uses the configured conversation language and preserves the Nemory brand', async () => {
    const languageService = Object.create(AiService.prototype) as AiService;
    (languageService as any).usersService = {
      findById: jest.fn(async () => ({
        settings: { conversationLanguage: 'uk', lang: 'en' },
      })),
    };
    (languageService as any).completeAiPromptUsageCycle = jest.fn();
    const extraction = jest
      .spyOn(languageService as any, 'runMemoryCapsuleExtraction')
      .mockResolvedValue({
        assistantMemory: [
          {
            kind: 'strategy',
            topic: 'self',
            content:
              '\u041d\u0435\u0439\u0442\u043e\u0440\u0438 \u0437\u0430\u043f\u0440\u043e\u043f\u043e\u043d\u0443\u0432\u0430\u043b\u0430 \u0434\u043e\u0434\u0430\u0442\u0438 \u0434\u0435\u0442\u0430\u043b\u0456',
            importance: 3,
          },
        ],
        commitments: [],
        commitmentUpdates: [],
      });

    const result = await languageService.extractAssistantMemoryCapsuleV2(1, {
      text: '\u0414\u043e\u0434\u0430\u0439 \u043a\u0456\u043b\u044c\u043a\u0430 \u0440\u0435\u0447\u0435\u043d\u044c \u043f\u0440\u043e \u0434\u0435\u043d\u044c.'.repeat(100),
      userText: '\u0422\u0435\u0441\u0442',
      activeCommitments: [],
    });

    const prompt = extraction.mock.calls[0][1] as string;
    expect(prompt).toContain(
      "The user's configured conversation language is Ukrainian",
    );
    expect(prompt).toContain(
      'This language rule applies only to human-readable prose',
    );
    expect(prompt).toContain(
      'enum values, identifiers, keys and other machine-readable fields',
    );
    expect(prompt).toContain('The assistant/product name is exactly "Nemory"');
    expect(prompt).toContain(MEMORY_FACT_FIDELITY);
    expect(result.assistantMemory[0].content).toBe(
      'Nemory \u0437\u0430\u043f\u0440\u043e\u043f\u043e\u043d\u0443\u0432\u0430\u043b\u0430 \u0434\u043e\u0434\u0430\u0442\u0438 \u0434\u0435\u0442\u0430\u043b\u0456',
    );
  });

  it('preserves a short reference-only dialog question when no capsule is returned', () => {
    const result = (service as any).normalizeDialogMemoryCapsuleV2(
      {
        user: {
          representation: 'verbatim',
          text: '',
        },
        assistant: {
          continuationSummary: 'Clarified the next step.',
          reflectionSummary: 'Clarified the next step.',
        },
      },
      'І що мені робити?',
    );

    expect(result.user.representation).toBe('verbatim');
    expect(result.user.text).toBe('І що мені робити?');
  });

  it('previews only safe duplicate and repeated-pattern memory merges', async () => {
    const previewService = Object.create(AiService.prototype) as AiService;
    jest
      .spyOn(previewService as any, 'buildMemoryCapsuleOutputRules')
      .mockResolvedValue('Write output in Ukrainian.');
    const extraction = jest
      .spyOn(previewService as any, 'runMemoryCapsuleExtraction')
      .mockResolvedValue({
        groups: [
          {
            sourceMemoryIds: ['memory-a', 'memory-b'],
            compressionMode: 'repeated_pattern',
            kind: 'vulnerability',
            topic: 'work',
            content:
              'Перед виступами повторюється тривога й бажання відкласти дію',
            importance: 4,
            occurrenceCount: 2,
            confidence: 0.92,
            rationale: 'The same reaction appears in two distinct episodes.',
          },
        ],
      });

    const result = await previewService.previewUserMemoryConsolidationV2(7, {
      timingTraceId: 'consolidation-test',
      items: [
        {
          id: 'memory-a',
          kind: 'vulnerability',
          topic: 'work',
          content:
            'Тривога перед першим виступом викликала бажання відкласти його',
          importance: 4,
          sourceType: 'entry',
          sourceId: 'entry-a',
          createdAt: 100,
        },
        {
          id: 'memory-b',
          kind: 'vulnerability',
          topic: 'work',
          content:
            'Перед іншим виступом тривога знову викликала бажання відкласти дію',
          importance: 4,
          sourceType: 'checkin',
          sourceId: 'checkin-b',
          createdAt: 200,
        },
        {
          id: 'empty-memory',
          kind: 'fact',
          topic: 'other',
          content: '   ',
          importance: 1,
          sourceType: 'entry',
          sourceId: 'entry-empty',
          createdAt: 300,
        },
      ],
    });

    expect(extraction).toHaveBeenCalledTimes(1);
    const prompt = extraction.mock.calls[0][1] as string;
    expect(prompt).toContain(
      'Do not aim for any row count, token count or reduction percentage.',
    );
    expect(prompt).toContain(
      'Do not rewrite, shorten or summarize standalone memory items.',
    );
    expect(prompt).toContain('Do not create broad thematic summaries');
    expect(prompt).not.toContain('empty-memory');
    expect(result).toEqual(
      expect.objectContaining({
        schemaVersion: 2,
        previewOnly: true,
        inputCount: 2,
        resultOutputCount: 1,
        achievedReductionCount: 1,
        discardedItems: [],
        ungroupedMemoryIds: [],
      }),
    );
    expect(result.groups).toEqual([
      expect.objectContaining({
        sourceMemoryIds: ['memory-a', 'memory-b'],
        compressionMode: 'repeated_pattern',
      }),
    ]);
    expect(result).not.toHaveProperty('targetReductionPercent');
    expect(result).not.toHaveProperty('targetOutputCount');
    expect(result).not.toHaveProperty('achievedReductionPercent');
    expect(result).not.toHaveProperty('rewrittenItems');
  });

  it('rejects broad thematic and single-episode pattern proposals', async () => {
    const previewService = Object.create(AiService.prototype) as AiService;
    jest
      .spyOn(previewService as any, 'buildMemoryCapsuleOutputRules')
      .mockResolvedValue('Write output in Ukrainian.');
    jest
      .spyOn(previewService as any, 'runMemoryCapsuleExtraction')
      .mockResolvedValue({
        groups: [
          {
            sourceMemoryIds: ['memory-a', 'memory-b'],
            compressionMode: 'repeated_pattern',
            kind: 'pattern',
            topic: 'work',
            content: 'Загальна робоча напруга',
            importance: 4,
            occurrenceCount: 2,
            confidence: 0.95,
            rationale: 'Shared theme.',
          },
        ],
      });

    const result = await previewService.previewUserMemoryConsolidationV2(7, {
      items: [
        {
          id: 'memory-a',
          kind: 'vulnerability',
          topic: 'work',
          content: 'Критика викликає сором',
          importance: 4,
          sourceType: 'entry',
          sourceId: 'entry-one',
          createdAt: 100,
        },
        {
          id: 'memory-b',
          kind: 'coping_strategy',
          topic: 'work',
          content: 'Просить назвати один незрозумілий абзац',
          importance: 4,
          sourceType: 'entry',
          sourceId: 'entry-one',
          createdAt: 101,
        },
      ],
    });

    expect(result.groups).toEqual([]);
    expect(result.achievedReductionCount).toBe(0);
    expect(result.ungroupedMemoryIds).toEqual(['memory-a', 'memory-b']);
  });
  it('keeps promise history but does not close an ongoing promise after one occurrence', async () => {
    const lifecycleService = Object.create(AiService.prototype) as AiService;
    jest
      .spyOn(lifecycleService as any, 'runMemoryCapsuleExtraction')
      .mockResolvedValue({
        assistantMemory: [
          {
            kind: 'strategy',
            topic: 'sleep',
            content: 'Protects sleep from evening rework',
            importance: 4,
          },
        ],
        commitments: [],
        commitmentUpdates: [
          {
            kind: 'promise_update',
            promiseKey: 'remind.walks',
            status: 'fulfilled',
          },
          {
            kind: 'promise_update',
            promiseKey: 'remind.water',
            status: 'cancelled',
          },
        ],
      });

    const result = await lifecycleService.extractAssistantMemoryCapsuleV2(1, {
      text: 'Assistant response',
      userText: 'Do not remind me about water anymore',
      activeCommitments: [
        {
          key: 'remind.walks',
          kind: 'reminder',
          topic: 'health',
          text: 'Remind about walks',
          importance: 4,
          duration: 'ongoing',
          status: 'open',
          triggerTags: [],
        },
        {
          key: 'remind.water',
          kind: 'reminder',
          topic: 'health',
          text: 'Remind about water',
          importance: 3,
          duration: 'ongoing',
          status: 'open',
          triggerTags: [],
        },
      ],
    });

    expect(result.assistantMemory).toEqual([
      {
        kind: 'strategy',
        topic: 'sleep',
        content: 'Protects sleep from evening rework',
        importance: 4,
      },
    ]);
    expect(result.commitments).toEqual([]);
    expect(result.commitmentUpdates).toEqual([
      {
        kind: 'promise_update',
        promiseKey: 'remind.water',
        status: 'cancelled',
      },
    ]);
  });

  it('accepts active commitment objects after request transformation', async () => {
    const dto = plainToInstance(
      ExtractAssistantMemoryCapsuleV2Dto,
      {
        text: 'Assistant response',
        activeCommitments: [
          {
            id: 'entry-1:follow-up',
            key: 'follow-up',
            kind: 'reminder',
            topic: 'sleep',
            text: 'Ask how the experiment changed',
            importance: 4,
            duration: 'ongoing',
            status: 'open',
            triggerTags: ['domain.sleep'],
          },
        ],
        timingTraceId: 'memory-cycle-test',
      },
      { enableImplicitConversion: true },
    );

    expect(await validate(dto)).toEqual([]);
    expect(dto.activeCommitments?.[0]).toMatchObject({
      key: 'follow-up',
      status: 'open',
      triggerTags: ['domain.sleep'],
    });
  });

  it('validates the combined dialog capsule request contract', async () => {
    const dto = plainToInstance(
      ExtractDialogMemoryCapsuleV2Dto,
      {
        sourceType: 'dialog',
        userText: 'I felt anxious during the meeting.',
        assistantText: 'Prepare one sentence before the next meeting.',
        activeCommitments: [],
        timingTraceId: 'dialog-memory-cycle',
      },
      { enableImplicitConversion: true },
    );

    expect(await validate(dto)).toEqual([]);
  });

  it('caches only the stable prefix of dialog memory extraction prompts', async () => {
    const cacheService = Object.create(AiService.prototype) as AiService;
    const requests: Record<string, unknown>[] = [];
    const create = jest.fn(async (request: Record<string, unknown>) => {
      requests.push(request);
      return {
        choices: [
          {
            message: { content: '{}' },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 1,
        },
      };
    });
    (cacheService as any).configService = {
      get: jest.fn(() => AiModel.GPT_5_6_LUNA),
    };
    (cacheService as any).openai = {
      chat: { completions: { create } },
    };
    (cacheService as any).persistAiUsage = jest.fn(async () => undefined);
    (cacheService as any).parseMemoryCapsuleJson = jest.fn(() => ({}));

    await (cacheService as any).runMemoryCapsuleExtraction(
      1,
      {
        staticPrompt: 'Stable extraction instructions',
        dynamicPrompt: 'Current dialog turn',
      },
      TokenType.ASSISTANT_MEMORY,
      'extract_dialog_memory_capsule_v2',
      'dialog-cache-test',
      false,
      { sourceType: 'dialog', cacheStaticPrefix: true },
    );

    const dialogRequest = requests[0];
    expect(dialogRequest.messages).toEqual([
      {
        role: 'system',
        content: [
          {
            type: 'text',
            text: 'Stable extraction instructions',
            prompt_cache_breakpoint: { mode: 'explicit' },
          },
        ],
      },
      { role: 'user', content: 'Current dialog turn' },
    ]);
    expect(dialogRequest.prompt_cache_key).toEqual(expect.any(String));
    expect(dialogRequest.prompt_cache_options).toEqual({ mode: 'explicit' });

    create.mockClear();
    requests.length = 0;
    await (cacheService as any).runMemoryCapsuleExtraction(
      1,
      'Entry extraction instructions and content',
      TokenType.USER_MEMORY,
      'extract_user_memory_capsule_v2',
      'entry-no-cache-test',
      false,
      { sourceType: 'entry' },
    );

    const entryRequest = requests[0];
    expect(entryRequest.messages).toEqual([
      {
        role: 'system',
        content: 'Entry extraction instructions and content',
      },
    ]);
    expect(entryRequest).not.toHaveProperty('prompt_cache_key');
    expect(entryRequest.prompt_cache_options).toEqual({ mode: 'explicit' });
  });

  it('rejects a consolidation response stopped at its output limit', async () => {
    const limitService = Object.create(AiService.prototype) as AiService;
    const create = jest.fn(async (request: Record<string, unknown>) => ({
      choices: [
        {
          message: { content: '{"groups":[],"discardedItems":[]}' },
          finish_reason: 'length',
        },
      ],
      usage: {
        prompt_tokens: 100,
        completion_tokens: 12000,
      },
      request,
    }));
    (limitService as any).configService = {
      get: jest.fn(() => AiModel.GPT_5_6_LUNA),
    };
    (limitService as any).openai = {
      chat: { completions: { create } },
    };
    (limitService as any).persistAiUsage = jest.fn(async () => undefined);

    await expect(
      (limitService as any).runMemoryCapsuleExtraction(
        1,
        'Consolidate memory',
        TokenType.USER_MEMORY,
        'consolidate_and_prune_user_memory_v2',
        'consolidation-limit-test',
        false,
        { maxCompletionTokens: 12000, rejectLengthFinish: true },
      ),
    ).rejects.toThrow('provider stopped at the output-token limit');
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ max_completion_tokens: 12000 }),
    );
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('disables automatic Terra writes when no reusable prefix is supplied', async () => {
    const responseService = Object.create(AiService.prototype) as AiService;
    const create = jest.fn(async (_request: Record<string, unknown>) => ({
      choices: [
        {
          message: { content: '{"shortText":"ok","fullText":"ok"}' },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: 1500,
        completion_tokens: 20,
        total_tokens: 1520,
        prompt_tokens_details: {
          cached_tokens: 0,
          cache_write_tokens: 0,
        },
      },
    }));
    (responseService as any).openai = {
      chat: { completions: { create } },
    };

    await (responseService as any).generateOpenAiChat(
      AiModel.GPT_5_6_TERRA,
      'gpt-5.6-terra',
      [
        { role: 'system', content: 'Stable system prompt' },
        { role: 'user', content: 'Changing entry text' },
      ],
      'entry',
      true,
    );

    const request = create.mock.calls[0][0];
    expect(request.prompt_cache_options).toEqual({ mode: 'explicit' });
    expect(request).not.toHaveProperty('prompt_cache_key');
    expect(request.messages).toEqual([
      { role: 'system', content: 'Stable system prompt' },
      { role: 'user', content: 'Changing entry text' },
    ]);
  });

  it('normalizes proposed personal tags and includes them in selected tags', () => {
    const result = (service as any).normalizeUserMemoryCapsuleV2({
      tags: [{ key: 'domain.running', type: 'domain', confidence: 0.9 }],
      newTags: [
        {
          key: 'thread.kyiv_half_marathon_2026',
          type: 'thread',
          label: 'Київський напівмарафон 2026',
          description: 'Підготовка користувача до Київського напівмарафону',
          aliases: ['thread.kyiv_half_marathon'],
        },
        {
          key: 'invalid_without_prefix',
          type: 'thread',
          label: 'Invalid',
          description: 'Invalid',
        },
      ],
    });

    expect(result.newTags).toEqual([
      {
        key: 'thread.kyiv_half_marathon_2026',
        type: 'thread',
        label: 'Київський напівмарафон 2026',
        description: 'Підготовка користувача до Київського напівмарафону',
        aliases: ['thread.kyiv_half_marathon'],
      },
    ]);
    expect(result.tags).toContainEqual({
      key: 'thread.kyiv_half_marathon_2026',
      type: 'thread',
      confidence: 0.8,
    });
  });

  it('does not recreate catalog tags but keeps them selected', () => {
    const result = (service as any).normalizeUserMemoryCapsuleV2(
      {
        tags: [{ key: 'domain.work', type: 'domain', confidence: 0.9 }],
        newTags: [
          {
            key: 'domain.work',
            type: 'domain',
            label: 'Work again',
            description: 'An existing global tag returned as new by mistake',
          },
          {
            key: 'thread.existing_project',
            type: 'thread',
            label: 'Existing project again',
            description: 'An existing personal tag returned as new by mistake',
          },
          {
            key: 'thread.new_project',
            type: 'thread',
            label: 'New project',
            description: 'A genuinely new personal tag',
          },
        ],
      },
      new Set(['domain.work', 'thread.existing_project']),
    );

    expect(result.newTags.map((tag: { key: string }) => tag.key)).toEqual([
      'thread.new_project',
    ]);
    expect(result.tags).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'domain.work' }),
        expect.objectContaining({ key: 'thread.existing_project' }),
        expect.objectContaining({ key: 'thread.new_project' }),
      ]),
    );
  });

  it('does not repeat global tags inside the personal prompt catalog', () => {
    const result = (service as any).normalizePersonalTagCatalogV2(
      {
        domains: [
          {
            key: 'domain.work',
            label: 'Duplicate work',
            description: 'A stale local copy of a global tag',
          },
          {
            key: 'domain.personal_project',
            label: 'Personal project',
            description: 'A genuinely personal domain',
            distinctRecordCount: 999,
          },
        ],
        knownThreads: [
          {
            key: 'thread.existing_project',
            label: 'Existing project',
            description: 'A continuing work project',
            distinctRecordCount: 3.9,
            associatedDomains: ['domain.work', 'domain.work', 'invalid'],
          },
        ],
      },
      new Set(['domain.work']),
    );

    expect(result.domains).toEqual([
      expect.objectContaining({
        key: 'domain.personal_project',
        distinctRecordCount: 999,
      }),
    ]);
    expect(result.knownThreads).toEqual([
      expect.objectContaining({
        key: 'thread.existing_project',
        distinctRecordCount: 3,
        associatedDomains: ['domain.work'],
      }),
    ]);
  });

  it('diagnoses a new thread that drops a stable same-domain thread', () => {
    const result = (service as any).buildThreadContinuityWarningsV2(
      {
        tags: [
          { key: 'domain.work', type: 'domain', confidence: 0.9 },
          { key: 'thread.new_phase', type: 'thread', confidence: 0.8 },
        ],
        newTags: [
          {
            key: 'thread.new_phase',
            type: 'thread',
            label: 'New phase',
            description: 'A newly proposed phase of the work',
          },
        ],
      },
      {
        knownThreads: [
          {
            key: 'thread.established_project',
            distinctRecordCount: 4,
            associatedDomains: ['domain.work'],
          },
        ],
      },
    );

    expect(result).toEqual([
      {
        currentDomains: ['domain.work'],
        proposedThreads: ['thread.new_phase'],
        omittedStableThreads: ['thread.established_project'],
      },
    ]);
  });

  it('parses a JSON capsule and adds safe diagnostics to malformed JSON', () => {
    expect(
      (service as any).parseMemoryCapsuleJson(
        '{"schemaVersion":2,"tags":[]}',
        'stop',
      ),
    ).toEqual({ schemaVersion: 2, tags: [] });

    expect(() =>
      (service as any).parseMemoryCapsuleJson(
        '{"schemaVersion":2,"tags":[}',
        'stop',
      ),
    ).toThrow('Memory capsule JSON parse failed (finishReason=stop, chars=28)');
  });

  it('persists and totals both retrieval branches in one memory cycle', async () => {
    jest.mocked(writeFullServerDebugLog).mockClear();
    const cycleService = Object.create(AiService.prototype) as AiService;
    const addTokenUserHistory = jest.fn(async () => undefined);
    const recordAiUsage = jest.fn(async () => undefined);
    const log = jest.fn();
    (cycleService as any).tokensService = { addTokenUserHistory };
    (cycleService as any).subscriptionUsageService = { recordAiUsage };
    (cycleService as any).logger = { log };
    (cycleService as any).aiPromptUsageCycles = new Map();

    const traceId = 'memory-cycle-test';
    const calls = [
      {
        type: TokenType.USER_MEMORY,
        operation: 'extract_user_memory_capsule_v2',
        inputTokens: 10,
        outputTokens: 2,
      },
      {
        type: TokenType.ENTRY,
        operation: 'generate_entry_response',
        inputTokens: 20,
        outputTokens: 4,
        traceId: `${traceId}:embeddings`,
      },
      {
        type: TokenType.ENTRY,
        operation: 'generate_entry_response',
        inputTokens: 30,
        outputTokens: 6,
        traceId: `${traceId}:tags`,
      },
      {
        type: TokenType.ASSISTANT_MEMORY,
        operation: 'extract_assistant_memory_capsule_v2',
        inputTokens: 25,
        outputTokens: 5,
      },
    ];

    for (const call of calls) {
      await (cycleService as any).persistAiUsage({
        userId: 1,
        model: AiModel.GPT_5_MINI,
        modelLabel: AiModel.GPT_5_MINI,
        traceId,
        finishReason: 'stop',
        estimated: false,
        cycleComplete: false,
        ...call,
      });
    }
    (cycleService as any).completeAiPromptUsageCycle(
      traceId,
      'extract_assistant_memory_capsule_v2',
    );

    expect(addTokenUserHistory).toHaveBeenCalledTimes(4);
    expect(recordAiUsage).toHaveBeenCalledTimes(4);
    expect(addTokenUserHistory).toHaveBeenNthCalledWith(
      1,
      1,
      TokenType.USER_MEMORY,
      AiModel.GPT_5_MINI,
      10,
      2,
      'stop',
      false,
      {
        traceId,
        operation: 'extract_user_memory_capsule_v2',
        cachedInputTokens: 0,
        cacheWriteInputTokens: 0,
      },
    );

    const completed = writtenAiUsageLog('cycle_summary');
    expect(completed).toMatchObject({
      marker: 'NEMORY_AI_PROMPT_USAGE',
      logType: 'cycle_summary',
      callsCount: 4,
      tokensFromProvider: {
        inputTotal: 85,
        standardInput: 85,
        cacheReadInput: 0,
        cacheWriteInput: 0,
        output: 17,
        total: 102,
      },
      creditsByFormula: {
        standardInput: 0.2125,
        cacheReadInput: 0,
        cacheWriteInput: 0,
        output: 0.34,
      },
      calls: calls.map((item) => ({ operation: item.operation })),
    });
    expect(completed).not.toHaveProperty('ratesPer1MTokens');
  });

  it('uses provider-reported cache usage for pricing regardless of request cache mode', async () => {
    jest.mocked(writeFullServerDebugLog).mockClear();
    const service = Object.create(AiService.prototype) as AiService;
    const addTokenUserHistory = jest.fn(async () => undefined);
    const recordAiUsage = jest.fn(async () => undefined);
    const log = jest.fn();
    (service as any).tokensService = { addTokenUserHistory };
    (service as any).subscriptionUsageService = { recordAiUsage };
    (service as any).logger = { log };
    (service as any).aiPromptUsageCycles = new Map();

    await (service as any).persistAiUsage({
      userId: 1,
      type: TokenType.ENTRY,
      model: AiModel.GPT_5_6_TERRA,
      modelLabel: AiModel.GPT_5_6_TERRA,
      inputTokens: 1000,
      cachedInputTokens: 800,
      cacheWriteInputTokens: 100,
      outputTokens: 0,
      operation: 'generate_entry_response',
    });

    expect(addTokenUserHistory).toHaveBeenCalledWith(
      1,
      TokenType.ENTRY,
      AiModel.GPT_5_6_TERRA,
      1000,
      0,
      undefined,
      undefined,
      {
        traceId: expect.any(String),
        operation: 'generate_entry_response',
        cachedInputTokens: 800,
        cacheWriteInputTokens: 100,
      },
    );
    expect(recordAiUsage).toHaveBeenCalledWith(
      1,
      AiModel.GPT_5_6_TERRA,
      1000,
      0,
      800,
      100,
    );

    const usageLog = writtenAiUsageLog('ai_call');
    expect(usageLog).toMatchObject({
      logType: 'ai_call',
      title: 'ЗАПИС · AI-РЕФЛЕКСІЯ',
      usageSource: 'provider_usage',
      tokensFromProvider: {
        standardInput: 100,
        cacheReadInput: 800,
        cacheWriteInput: 100,
      },
      creditsByFormula: {
        standardInput: 3,
        cacheReadInput: 2.4,
        cacheWriteInput: 3.75,
        output: 0,
      },
      chargedCredits: { input: 10 },
    });
    expect(usageLog).not.toHaveProperty('ratesPer1MTokens');
  });
});
