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
  it('keeps all supplied recent history after client compaction, beyond the old cap', () => {
    const result = conversationMessages('System', { ...request, completeHistory: true, dialogContext: 'Earlier user correction' }, 1, messages => messages.length);
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
    expect(result.messages[1].content).toContain('2026-09-30T10:00:00Z');
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
  it('reserves all shared commitments outside the stable history while trimming only complete old turns', () => {
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
    expect(JSON.parse(result.messages[4].content.split('\n')[1])).toEqual({
      activeCommitments,
      activeScheduledReminders,
    });
    expect(result.messages[1].content).toContain('Question 3');
    expect(() =>
      conversationMessages('System', dto, 3, (m) => m.length),
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
