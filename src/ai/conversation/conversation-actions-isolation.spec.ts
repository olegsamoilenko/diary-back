import { describe, expect, it, jest } from '@jest/globals';
import { AiService } from '../ai.service';
import {
  conversationMessages,
  CONVERSATION_TASK,
} from './conversation.context';
import { buildNemoryCapabilitiesPrompt } from '../utils/nemory-capabilities';

jest.mock('../../logs/context-audit', () => ({ writeContextAudit: jest.fn() }));

const promise = {
  kind: 'promise',
  promiseKey: 'follow_up.work',
  promiseKind: 'follow_up',
  topic: 'work',
  content: 'Повернутися до питання',
  importance: 3,
  duration: 'one_time',
  status: 'open',
  triggerTags: [],
};
const reminder = {
  version: 2,
  kind: 'reminder',
  title: 'Перевірити пошту',
  startDate: '2026-11-11',
  time: '19:00',
  frequency: 'daily',
  recurrenceEnd: { type: 'count', count: 3 },
};
const goal = {
  version: 2,
  kind: 'goal',
  title: 'Портфоліо',
  startDate: '2026-11-10',
  endDate: '2026-11-30',
  milestones: [
    { title: 'Перший', dueDate: '2026-11-14' },
    { title: 'Другий', dueDate: '2026-11-22' },
    { title: 'Третій', dueDate: '2026-11-30' },
  ],
  goalReminder: {
    enabled: true,
    offsetDays: 1,
    hour: 18,
    minute: 0,
    includeMilestones: true,
  },
};

function setup(raw: unknown) {
  const ai: any = Object.create(AiService.prototype);
  ai.buildMemoryCapsuleOutputRules = jest.fn(async () => '');
  ai.countStringTokens = jest.fn(() => 10);
  ai.completeAiPromptUsageCycle = jest.fn();
  ai.runMemoryCapsuleExtraction = jest.fn(async () => raw);
  ai.looksLikeFutureNemoryCommitment = jest.fn(() => true);
  ai.repairMissingCommitmentV2 = jest.fn(async () => ({
    commitments: [promise],
  }));
  const call = (extra: object = {}) =>
    ai.extractAssistantMemoryCapsuleV2(1, {
      conversationOnly: true,
      sourceType: 'dialog',
      actionsOnly: true,
      text: 'Створюю ціль',
      userText: 'Третій до 30 листопада. Створюй.',
      previousAssistantText: 'Коли завершується третій етап?',
      plannerContext: '{"turns":["Перший до 14, другий до 22"]}',
      plannerCreationVersion: 2,
      plannerCreationSupported: true,
      activeCommitments: [
        {
          key: 'foreign',
          text: 'FOREIGN_GLOBAL_PROMISE',
          status: 'open',
          triggerTags: [],
        },
      ],
      activeScheduledReminders: [{ text: 'FOREIGN_GLOBAL_REMINDER' }],
      periodMemoryContext: 'FOREIGN_PERIOD_MEMORY',
      ...extra,
    });
  return { ai, call };
}

describe('isolated conversation action extraction', () => {
  it.each([[goal], [reminder], [goal, reminder]])(
    'keeps authorized planner commands and ignores global outputs',
    async (...commands) => {
      const { ai, call } = setup({
        plannerCreations: commands,
        commitments: [promise],
        commitmentUpdates: [{ promiseKey: 'foreign', status: 'fulfilled' }],
        scheduledReminders: [
          {
            reminderKey: 'legacy',
            text: 'Leak',
            localDate: '2026-11-11',
            localTime: '19:00',
          },
        ],
      });
      const result = await call();
      expect(result.plannerCreations).toEqual(commands);
      expect(result).toMatchObject({
        assistantMemory: [],
        commitments: [],
        commitmentUpdates: [],
        scheduledReminders: [],
        scheduledReminderUpdates: [],
      });
      const prompt = JSON.stringify(
        ai.runMemoryCapsuleExtraction.mock.calls[0][1],
      );
      expect(prompt).not.toContain('FOREIGN_');
      expect(prompt).toContain('Перший до 14, другий до 22');
      expect(prompt).toContain('Коли завершується третій етап?');
      expect(ai.repairMissingCommitmentV2).not.toHaveBeenCalled();
    },
  );
  it('does not repair local promises into global commitments or create during clarification', async () => {
    const { ai, call } = setup({ plannerCreations: [goal] });
    const result = await call({
      plannerCreationSupported: false,
      text: 'Нагадаю про це, коли продовжимо цю розмову.',
    });
    expect(result.plannerCreations).toEqual([]);
    expect(result.commitments).toEqual([]);
    expect(ai.repairMissingCommitmentV2).not.toHaveBeenCalled();
    expect(ai.runMemoryCapsuleExtraction).toHaveBeenCalledTimes(1);
    expect(ai.completeAiPromptUsageCycle).toHaveBeenCalled();
  });
  it('preserves ordinary diary commitment extraction', async () => {
    const { call } = setup({ commitments: [promise] });
    const result = await call({
      conversationOnly: false,
      periodMemoryContext: undefined,
      plannerCreationSupported: false,
    });
    expect(result.commitments).toEqual([
      expect.objectContaining({ promiseKey: promise.promiseKey }),
    ]);
  });
  it('keeps promises in this conversation history and scopes the main instructions', () => {
    const answer = 'Повернемось до цього, коли продовжиш цю розмову.';
    const { messages } = conversationMessages(
      'System',
      {
        question: 'Продовжимо',
        createdAt: '2026-11-10T10:00:00Z',
        timezone: 'Europe/Kyiv',
        omittedTurns: 0,
        history: [
          {
            question: 'Нагадай тут',
            answer,
            createdAt: '2026-11-09T10:00:00Z',
          },
        ],
      } as any,
      100,
      (m) => m.length,
    );
    expect(messages.some((m) => m.content === answer)).toBe(true);
    expect(CONVERSATION_TASK.instructions).toContain(
      'Agreements apply only while continuing this chat',
    );
    expect(CONVERSATION_TASK.instructions).toContain(
      'actual reminder creation',
    );
    expect(
      buildNemoryCapabilitiesPrompt(true, true, 'uk', 2, true, true),
    ).not.toContain('Commitments:');
    expect(buildNemoryCapabilitiesPrompt(true, true, 'uk', 2, true)).toContain(
      'Commitments:',
    );
  });
});
