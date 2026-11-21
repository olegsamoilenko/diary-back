import { describe, expect, it, jest } from '@jest/globals';
import { AiService } from './ai.service';

jest.mock('../logs/context-audit', () => ({ writeContextAudit: jest.fn() }));

const legacyReminder = {
  reminderKey: 'goal.home_workspace_deadline',
  text: 'Дедлайн цілі',
  localDate: '2026-11-29',
  localTime: '18:00',
};
const goal = {
  version: 2,
  kind: 'goal',
  title: 'Підготувати домашнє робоче місце',
  description: 'Зробити робочий простір зручним і прибрати зайве',
  startDate: '2026-11-10',
  endDate: '2026-11-30',
  milestones: [
    { title: 'Розібрати стіл і документи', dueDate: '2026-11-14' },
    { title: 'Налаштувати освітлення', dueDate: '2026-11-22' },
    { title: 'Організувати кабелі та приладдя', dueDate: '2026-11-30' },
  ],
  goalReminder: {
    enabled: true,
    offsetDays: 1,
    hour: 18,
    minute: 0,
    includeMilestones: true,
  },
};
const reminder = {
  version: 2,
  kind: 'reminder',
  title: 'Перевірити пошту',
  startDate: '2026-11-10',
  time: '19:00',
  frequency: 'daily',
  recurrenceEnd: { type: 'count', count: 3 },
};

// Exercise the actual extraction adapters/normalizers, replacing only provider I/O.
describe.each(['actions', 'assistant', 'dialog'])(
  '%s planner boundary',
  (adapter) => {
    function setup(raw: unknown) {
      const subject: any = Object.create(AiService.prototype);
      subject.buildMemoryCapsuleOutputRules = jest.fn(async () => '');
      subject.countStringTokens = jest.fn(() => 10);
      subject.memoryTagCatalogV2Service = {
        getGroupedCatalog: jest.fn(async () => ({})),
        markUsed: jest.fn(),
      };
      subject.completeAiPromptUsageCycle = jest.fn();
      subject.runMemoryCapsuleExtraction = jest.fn(async () => raw);
      const call = (extra: object = {}) => {
        const dto = {
          userText: 'Створи ціль із нагадуванням напередодні о 18:00.',
          plannerCreationVersion: 2,
          plannerCreationSupported: false,
          ...extra,
        };
        return adapter === 'dialog'
          ? subject.extractDialogMemoryCapsuleV2(1, {
              ...dto,
              assistantText: 'Уточніть дедлайни етапів.',
            })
          : subject.extractAssistantMemoryCapsuleV2(1, {
              ...dto,
              text: 'Уточніть дедлайни етапів.',
              actionsOnly: adapter === 'actions',
            });
      };
      return { subject, call };
    }

    it('waits through both clarifications, then returns one complete goal and no legacy notification', async () => {
      const { subject, call } = setup({
        plannerCreations: [goal],
        scheduledReminders: [legacyReminder],
      });
      for (const userText of [
        'Створи ціль з етапами.',
        'Перший до 14-го, другий до 22-го. Третій скажу пізніше.',
      ]) {
        const result = await call({ userText });
        expect(result.plannerCreations).toEqual([]);
        expect(result.scheduledReminders).toEqual([]);
        expect(result.scheduledReminderUpdates).toEqual([]);
        if (adapter === 'dialog')
          expect(result.assistant.text).toBe('Уточніть дедлайни етапів.');
        else if (adapter === 'assistant')
          expect(result.assistantMemory[0].content).toBe(
            'Уточніть дедлайни етапів.',
          );
      }
      const result = await call({
        userText: 'Третій до 30-го. Створюй.',
        plannerCreationSupported: true,
      });
      expect(result.plannerCreations).toEqual([goal]);
      expect(result.scheduledReminders).toEqual([]);
      expect(subject.runMemoryCapsuleExtraction).toHaveBeenCalledTimes(3);
    });

    it.each([{ commands: [reminder] }, { commands: [goal, reminder] }])(
      'preserves explicitly authorized V2 commands $commands',
      async ({ commands }) => {
        const { call } = setup({
          plannerCreations: commands,
          scheduledReminders: [legacyReminder],
        });
        const result = await call({ plannerCreationSupported: true });
        expect(result.plannerCreations).toEqual(commands);
        expect(result.scheduledReminders).toEqual([]);
      },
    );

    it('preserves the remaining-deadline clarification with no planner or reminder commands', async () => {
      const question =
        'Який дедлайн етапу «Організувати кабелі та приладдя»? Відповідай тут, щоб продовжити.';
      const { call } = setup({
        plannerCreations: [],
        plannerCreationError: 'CLARIFICATION_REQUIRED',
        plannerCreationQuestion: question,
        scheduledReminders: [legacyReminder],
      });
      const result = await call({
        userText:
          'Перший до 14 листопада, другий до 22 листопада. Дату третього повідомлю окремо.',
        plannerCreationSupported: true,
        conversationOnly: true,
      });
      expect(result.plannerCreationError).toBe('CLARIFICATION_REQUIRED');
      expect(result.plannerCreationQuestion).toBe(question);
      expect(result.plannerCreations).toEqual([]);
      expect(result.scheduledReminders).toEqual([]);
      expect(result.commitments).toEqual([]);
    });

    it('keeps legacy reminder creation for older clients', async () => {
      const { call } = setup({ scheduledReminders: [legacyReminder] });
      const result = await call({ plannerCreationVersion: undefined });
      expect(result.scheduledReminders).toEqual([
        expect.objectContaining(legacyReminder),
      ]);
    });

    it('applies the boundary after fallback repair without dropping conversational commitments', async () => {
      const { subject, call } = setup({});
      const commitment = {
        promiseKey: 'check_in',
        content: 'Повернутися до теми',
        duration: 'one_time',
      };
      subject.looksLikeFutureNemoryCommitment = jest.fn(() => true);
      subject.repairMissingCommitmentV2 = jest.fn(async () => ({
        commitments: [commitment],
        commitmentUpdates: [],
        scheduledReminders: [legacyReminder],
      }));
      const result = await call();
      expect(subject.repairMissingCommitmentV2).toHaveBeenCalledTimes(1);
      expect(result.commitments).toEqual([commitment]);
      expect(result.scheduledReminders).toEqual([]);
      expect(result.plannerCreations).toEqual([]);
    });
  },
);
