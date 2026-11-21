import { describe, expect, it, jest } from '@jest/globals';
import { AiService } from './ai.service';
import { AiModel } from '../users/types';
import { buildNemoryCapabilitiesPrompt } from './utils/nemory-capabilities';

jest.mock('../logs/context-audit', () => ({ writeContextAudit: jest.fn() }));
jest.mock('./entry-flow-debug', () => ({
  ...jest.requireActual<any>('./entry-flow-debug'),
  writeFullServerDebugLog: jest.fn(),
  logServerMemoryReview: jest.fn(),
}));

describe.each(['actions', 'assistant', 'dialog'])(
  'named colors via %s',
  (adapter) => {
    it.each([
      ['синій', '#2196F3', 'портфель', '💼'],
      ['помаранчевий', '#FF9800', 'кошик', '🛒'],
      ['зелений', '#4CAF50', 'книга', '📚'],
      ['#4A90E2', '#4A90E2', '🎯', '🎯'],
      ['', undefined, '', undefined],
    ])(
      'delivers the general rule and preserves the selected appearance (%s)',
      async (name, color, iconName, icon) => {
        const subject: any = Object.create(AiService.prototype);
        subject.configService = { get: jest.fn(() => AiModel.GPT_5_6_LUNA) };
        subject.buildMemoryCapsuleOutputRules = jest.fn(
          async () => 'Українською',
        );
        subject.countStringTokens = jest.fn(() => 10);
        subject.memoryTagCatalogV2Service = {
          getGroupedCatalog: jest.fn(async () => ({})),
          markUsed: jest.fn(),
        };
        subject.persistAiUsage = jest.fn(async () => undefined);
        subject.completeAiPromptUsageCycle = jest.fn();
        const action = {
          version: 2,
          kind: 'goal',
          title: 'Портфоліо',
          startDate: '2026-11-10',
          endDate: '2026-11-30',
          ...(color ? { color } : {}),
          ...(icon ? { icon } : {}),
        };
        // Mocked provider: verifies instruction delivery and field preservation,
        // not real-model color selection (manual G01.1 remains required).
        const create = jest.fn(async () => ({
          choices: [
            {
              finish_reason: 'stop',
              message: {
                content: JSON.stringify({ plannerCreations: [action] }),
              },
            },
          ],
          usage: { prompt_tokens: 100, completion_tokens: 20 },
        }));
        subject.openai = { chat: { completions: { create } } };
        const dto = {
          userText:
            `Створи ціль Портфоліо до 30 листопада. ${name ? `Колір ${name}. Іконка ${iconName}.` : ''}`.trim(),
          plannerCreationSupported: true,
          plannerCreationVersion: 2,
        };
        const result =
          adapter === 'dialog'
            ? await subject.extractDialogMemoryCapsuleV2(7, {
                ...dto,
                assistantText: 'Створюю',
              })
            : await subject.extractAssistantMemoryCapsuleV2(7, {
                ...dto,
                text: 'Створюю',
                actionsOnly: adapter === 'actions',
              });
        const messages = JSON.stringify(
          (create.mock.calls[0] as unknown as [any])[0].messages,
        );
        expect(messages).toContain(
          'Named colors/icons→matching HEX/emoji:choose shade/symbol,never ask codes/emoji;preserve explicit values.',
        );
        expect(messages).toContain(
          'Appearance only if requested; null=theme/default.',
        );
        expect(messages).toContain(dto.userText);
        expect(result.plannerCreations).toEqual([action]);
        expect(result.plannerCreationError).toBeUndefined();
      },
    );
  },
);

it.each(['uk', 'en', 'de', 'pl'])(
  'informs the main model without asking for technical color values (%s)',
  (locale) => {
    const prompt = buildNemoryCapabilitiesPrompt(true, true, locale, 2, true);
    expect(prompt).toContain('color/icon names suffice');
    expect(prompt).toContain('No guessing,HEX/emoji questions');
    expect(prompt).toContain('no pressure/duplicates');
    expect(buildNemoryCapabilitiesPrompt(false, false, locale)).not.toContain(
      'color/icon names suffice',
    );
  },
);
