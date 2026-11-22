import 'reflect-metadata';
import { describe, expect, it } from '@jest/globals';
import { conversationMessages } from './conversation.context';
import { ConversationDto } from './conversation.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

const id = '35c34b79-cfdf-4c01-8dc2-2fd3b58ed6ac';
const request: ConversationDto = {
  expectedUserId: 1,
  requestId: id,
  conversationId: id,
  question: 'Current question',
  createdAt: '2026-10-01T10:00:00Z',
  timezone: 'Europe/Kyiv',
  omittedTurns: 0,
  history: [1, 2, 3].map((i) => ({
    question: `Question ${i}`,
    answer: `Answer ${i}`,
    createdAt: '2026-09-30T10:00:00Z',
    mediaIds: [id],
  })),
};
describe('standalone conversation context', () => {
  it.each([
    ['2026-11-21T22:39:00Z', 'Europe/Kyiv', '2026-11-22 00:39', '2026-11-23'],
    [
      '2026-01-01T02:30:00Z',
      'America/New_York',
      '2025-12-31 21:30',
      '2026-01-01',
    ],
    ['2026-10-24T21:30:00Z', 'Europe/Kyiv', '2026-10-25 00:30', '2026-10-26'],
  ])(
    'anchors a 284 reminder at %s in %s',
    (createdAt, timezone, local, tomorrow) => {
      const { messages } = conversationMessages(
        'System',
        {
          ...request,
          timezone,
          createdAt,
          question: 'Нагадай завтра о 19 годині перевірити тестовий календар',
        },
        100,
        (items) => items.length,
      );
      expect(messages.at(-1)?.content).toContain(
        `${local} ${timezone}; tomorrow: ${tomorrow}`,
      );
      expect(messages.at(-1)?.content).not.toContain(createdAt);
    },
  );
  it('places generated image evidence after its assistant answer, separate from user media', () => {
    const generated = '90c75b7b-2097-401b-96db-c996ae61f25f';
    const result = conversationMessages(
      'System',
      {
        ...request,
        history: [{ ...request.history[0], generatedMediaIds: [generated] }],
      },
      100,
      (messages) => messages.length,
    );
    expect(result.messages.slice(1, 4)).toEqual([
      expect.objectContaining({ role: 'user', mediaIds: [id] }),
      { role: 'assistant', content: 'Answer 1' },
      {
        role: 'user',
        content: expect.stringContaining(
          'Image generated in the preceding assistant answer',
        ),
        mediaIds: [generated],
      },
    ]);
    expect(result.messages.at(-1)?.content).toContain('Current question');
  });
  it('omits an over-budget legacy turn together with its generated evidence', () => {
    const result = conversationMessages(
      'System',
      {
        ...request,
        history: [{ ...request.history[0], generatedMediaIds: [id] }],
      },
      5,
      (messages) => messages.length,
    );
    expect(result.omittedTurns).toBe(1);
    expect(result.messages).toHaveLength(3);
    expect(result.messages.some((message) => message.mediaIds?.length)).toBe(
      false,
    );
  });
  it('validates optional generated image IDs while retaining the old client contract', async () => {
    const options = { whitelist: true, forbidNonWhitelisted: true };
    const withImages = (ids: string[]) =>
      plainToInstance(ConversationDto, {
        ...request,
        history: [{ ...request.history[0], generatedMediaIds: ids }],
      });
    expect(
      await validate(plainToInstance(ConversationDto, request), options),
    ).toEqual([]);
    expect(await validate(withImages([id]), options)).toEqual([]);
    expect(
      await validate(withImages(['file:///private.jpg']), options),
    ).not.toEqual([]);
    expect(
      await validate(withImages(Array(101).fill(id)), options),
    ).not.toEqual([]);
  });
  it('keeps all supplied recent history after client compaction, beyond the old cap', () => {
    const result = conversationMessages(
      'System',
      {
        ...request,
        completeHistory: true,
        dialogContext: 'Earlier user correction',
      },
      1,
      (messages) => messages.length,
    );
    expect(result.omittedTurns).toBe(0);
    expect(JSON.stringify(result.messages)).toContain('Question 1');
    expect(result.messages[1].content).toContain('Earlier user correction');
    expect(result.messages.at(-1)?.content).toContain('Current question');
  });
  it('preserves recent complete pairs, dates and media in chronological order within budget', () => {
    const result = conversationMessages(
      'System',
      request,
      7,
      (messages) => messages.length,
    );
    expect(result.omittedTurns).toBe(1);
    expect(result.messages.map((m) => m.role)).toEqual([
      'system',
      'user',
      'assistant',
      'user',
      'assistant',
      'user',
      'user',
    ]);
    expect(result.messages[1]).toMatchObject({
      content: expect.stringContaining('Question 2'),
      mediaIds: [id],
    });
    expect(result.messages[1].content).toContain(
      '2026-09-30 13:00 Europe/Kyiv; tomorrow: 2026-10-01',
    );
    expect(result.messages.at(-1)?.content).toContain('Current question');
    expect(JSON.stringify(result.messages)).not.toContain('Question 1');
  });
  it('reports prior transport omissions and supports media-only current questions', () => {
    const result = conversationMessages(
      'System',
      {
        ...request,
        history: [],
        omittedTurns: 61,
        question: '',
        mediaIds: [id],
      },
      3,
      (m) => m.length,
    );
    expect(result.omittedTurns).toBe(61);
    expect(result.messages.at(-1)?.mediaIds).toEqual([id]);
    expect(result.messages[1].content).toContain('61');
  });
  it('rejects current question overflow instead of silently truncating it', () => {
    expect(() =>
      conversationMessages('System', request, 2, (m) => m.length),
    ).toThrow('CONVERSATION_MESSAGE_TOO_LONG');
  });
  it('ignores legacy global actions while retaining only this conversation history', () => {
    const activeCommitments = [
      {
        key: 'overload',
        text: 'Ask about rest',
        status: 'open' as const,
        triggerTags: [],
      },
    ];
    const activeScheduledReminders = [
      {
        reminderKey: 'nemory:call',
        text: 'Call',
        localDate: '2026-10-02',
        localTime: '13:00',
      },
    ];
    const dto = { ...request, activeCommitments, activeScheduledReminders };
    const result = conversationMessages('System', dto, 6, (m) => m.length);
    expect(result.omittedTurns).toBe(2);
    expect(JSON.stringify(result.messages)).not.toContain('Ask about rest');
    expect(JSON.stringify(result.messages)).not.toContain('nemory:call');
    expect(result.messages).toEqual(
      conversationMessages('System', request, 6, (m) => m.length).messages,
    );
    expect(result.messages[1].content).toContain('Question 3');
    expect(() =>
      conversationMessages('System', dto, 2, (m) => m.length),
    ).toThrow('CONVERSATION_MESSAGE_TOO_LONG');
  });
  it('accepts validated shared actions but still rejects general memory and malformed actions', async () => {
    const options = { whitelist: true, forbidNonWhitelisted: true };
    const valid = {
      ...request,
      activeCommitments: [
        {
          key: 'rest',
          text: 'Ask about rest',
          status: 'open',
          triggerTags: [],
        },
      ],
      activeScheduledReminders: [],
    };
    expect(
      await validate(plainToInstance(ConversationDto, valid), options),
    ).toEqual([]);
    const errors = await validate(
      plainToInstance(ConversationDto, {
        ...valid,
        userMemory: ['hidden diary'],
        activeCommitments: [
          { ...valid.activeCommitments[0], status: 'closed' },
        ],
      }),
      options,
    );
    expect(errors.map((e) => e.property)).toEqual(
      expect.arrayContaining(['userMemory', 'activeCommitments']),
    );
  });
  it('accepts only the conversation contract, rejecting unrelated diary data and malformed media IDs', async () => {
    const options = {
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
    };
    expect(
      await validate(plainToInstance(ConversationDto, request), options),
    ).toEqual([]);
    const errors = await validate(
      plainToInstance(ConversationDto, {
        ...request,
        diary: 'private diary',
        mediaIds: ['wrong-id'],
      }),
      options,
    );
    expect(errors.map((e) => e.property)).toEqual(
      expect.arrayContaining(['diary', 'mediaIds']),
    );
  });
});
