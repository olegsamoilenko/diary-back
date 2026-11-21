import { describe, expect, it, jest } from '@jest/globals';
import { AiService } from './ai.service';
import { AiModel } from '../users/types';
import { withExtractionAudioContext } from './utils/extraction-audio-context';
import type { MediaAnalysisService } from './media/media-analysis.service';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ExtractDialogMemoryCapsuleV2Dto } from './dto/extract-dialog-memory-capsule-v2.dto';

jest.mock('../logs/context-audit', () => ({ writeContextAudit: jest.fn() }));
jest.mock('./entry-flow-debug', () => ({
  ...jest.requireActual<any>('./entry-flow-debug'),
  writeFullServerDebugLog: jest.fn(),
  logServerMemoryReview: jest.fn(),
}));
const original = '11111111-1111-4111-8111-111111111111';
const reply = '22222222-2222-4222-8222-222222222222';
const goal = {
  version: 2,
  kind: 'goal',
  title: 'Портфоліо',
  startDate: '2026-11-10',
  endDate: '2026-11-30',
  milestones: [{ title: 'Відібрати роботи', dueDate: '2026-11-14' }],
};

describe.each(['actions', 'assistant', 'dialog'])(
  'audio extraction via %s',
  (adapter) => {
    it.each(['audio-first', 'audio-clarification', 'text-clarification'])(
      'delivers %s to the real extraction adapter before empty-text handling',
      async (scenario) => {
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
        subject.mediaAnalysis = {
          readReadyAudioTranscripts: jest.fn(async () => ({
            [original]:
              'Створи ціль Портфоліо до 30 листопада. Етап Відібрати роботи до 14 листопада.',
            [reply]: 'Іконка портфеля, синій колір.',
          })),
        };
        const create = jest.fn(async () => ({
          choices: [
            {
              finish_reason: 'stop',
              message: {
                content: JSON.stringify({ plannerCreations: [goal] }),
              },
            },
          ],
          usage: { prompt_tokens: 100, completion_tokens: 20 },
        }));
        subject.openai = { chat: { completions: { create } } };
        const first = scenario === 'audio-first';
        const dto = {
          userText:
            scenario === 'text-clarification'
              ? 'Іконка портфеля, синій колір.'
              : '',
          plannerCreationSupported: true,
          plannerCreationVersion: 2,
          audioContext: {
            currentIds: first
              ? [original]
              : scenario === 'audio-clarification'
                ? [reply]
                : [],
            history: first
              ? []
              : [
                  { role: 'user', text: '', mediaIds: [original] },
                  { role: 'assistant', text: 'Яку іконку?', mediaIds: [] },
                ],
          },
          plannerContext: '{"source":null,"turns":[]}',
        };
        const result =
          adapter === 'dialog'
            ? await subject.extractDialogMemoryCapsuleV2(7, {
                ...dto,
                assistantText: 'Створюю ціль',
              })
            : await subject.extractAssistantMemoryCapsuleV2(7, {
                ...dto,
                text: 'Створюю ціль',
                actionsOnly: adapter === 'actions',
              });
        expect(create).toHaveBeenCalledTimes(1);
        const sent = JSON.stringify(
          (create.mock.calls[0] as unknown as [any])[0].messages,
        );
        expect(sent).toContain('Етап Відібрати роботи до 14 листопада.');
        if (!first) {
          expect(sent).toContain('Іконка портфеля');
          expect(sent).toContain('Яку іконку?');
        }
        expect(result.plannerCreations).toEqual([goal]);
        expect(subject.persistAiUsage).toHaveBeenCalledTimes(1);
        expect(dto.userText).toBe(
          scenario === 'text-clarification'
            ? 'Іконка портфеля, синій колір.'
            : '',
        );
      },
    );
  },
);

it('retains legacy text requests and fails closed on missing media', async () => {
  const dto = { userText: 'Текст' };
  expect(await withExtractionAudioContext(7, dto)).toBe(dto);
  await expect(
    withExtractionAudioContext(7, {
      ...dto,
      audioContext: { currentIds: [original], history: [] },
    }),
  ).rejects.toThrow('AUDIO_CONTEXT_UNAVAILABLE');
});
it('does not turn assistant speech into user authorization', async () => {
  const media = {
    readReadyAudioTranscripts: jest.fn(),
  } as unknown as MediaAnalysisService;
  await expect(
    withExtractionAudioContext(
      7,
      {
        audioContext: {
          currentIds: [],
          history: [{ role: 'assistant', text: '', mediaIds: [original] }],
        },
      },
      media,
    ),
  ).rejects.toThrow('INVALID_AUDIO_CONTEXT_ROLE');
  expect(media.readReadyAudioTranscripts).not.toHaveBeenCalled();
});
it('validates nested IDs and retains the optional context through DTO whitelist', async () => {
  const dto = plainToInstance(ExtractDialogMemoryCapsuleV2Dto, {
    userText: '',
    assistantText: 'Створюю',
    audioContext: { currentIds: [original], history: [] },
  });
  expect(await validate(dto, { whitelist: true })).toEqual([]);
  expect(dto.audioContext?.currentIds).toEqual([original]);
  dto.audioContext!.currentIds = ['invalid'];
  expect((await validate(dto)).length).toBeGreaterThan(0);
});
