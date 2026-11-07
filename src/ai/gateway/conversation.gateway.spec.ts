import { describe, expect, it, jest } from '@jest/globals';
import { EventEmitter } from 'node:events';
import { AiGateway } from './ai.gateway';
import { writeContextAudit } from '../../logs/context-audit';

jest.mock('../../logs/context-audit', () => ({ writeContextAudit: jest.fn() }));

const request = {
  expectedUserId: 7,
  requestId: '35c34b79-cfdf-4c01-8dc2-2fd3b58ed6ac',
  conversationId: '55c34b79-cfdf-4c01-8dc2-2fd3b58ed6ac',
  question: 'Hello', history: [], omittedTurns: 0,
  timezone: 'Europe/Kyiv', createdAt: '2026-10-01T10:00:00Z',
};
describe('standalone socket contract', () => {
  it('records transport cause codes without exposing content or replaying a failed request', async () => {
    const client: any = new EventEmitter();
    client.user = { id: 7 };
    client.disconnected = false;
    const emit = jest.spyOn(client, 'emit');
    const cause = Object.assign(new Error('private network details'), {
      code: 'UND_ERR_CONNECT_TIMEOUT',
      headers: { authorization: 'private credential' },
    });
    const error = new Error('private request content');
    Object.defineProperty(error, 'cause', { value: cause });
    const reply = jest.fn(async () => {
      throw error;
    });
    const gateway = new AiGateway(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { reply } as never,
      {} as never,
    );
    await gateway.handleConversation(request, client);
    expect(reply).toHaveBeenCalledTimes(1);
    expect(writeContextAudit).toHaveBeenCalledWith(
      'response.stream.failed',
      expect.objectContaining({
        mode: 'conversation',
        elapsedMs: expect.any(Number),
        aborted: false,
        disconnected: false,
        error: expect.objectContaining({
          cause: expect.objectContaining({ code: 'UND_ERR_CONNECT_TIMEOUT' }),
        }),
      }),
    );
    const audit = JSON.stringify(jest.mocked(writeContextAudit).mock.calls);
    expect(audit).not.toContain('private');
    expect(emit).toHaveBeenCalledWith('conversation_error', {
      message: error.message,
    });
    expect(client.listenerCount('disconnect')).toBe(0);
  });
  it('accepts current reminder versions and rejects malformed version values before provider work', async () => {
    const client: any = new EventEmitter();
    client.user = { id: 7 };
    client.disconnected = false;
    const emit = jest.spyOn(client, 'emit');
    const reply = jest.fn(async () => ({ text: 'Відповідь' }));
    const gateway = new AiGateway({} as never, {} as never, {} as never, {} as never, {} as never, {} as never, { reply } as never, {} as never);
    const reminder = {
      reminderKey: 'nemory:synthetic-reminder', text: 'Тестове нагадування',
      localDate: '2026-11-07', localTime: '10:00', updatedAt: 1793952000000,
    };
    await gateway.handleConversation({ ...request, activeScheduledReminders: [reminder] }, client);
    expect(reply).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith('conversation_done', { text: 'Відповідь' });
    await gateway.handleConversation({ ...request, activeScheduledReminders: [{ ...reminder, updatedAt: 'invalid' }] }, client);
    expect(reply).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith('conversation_error', expect.anything());
    const { updatedAt: _version, ...legacyReminder } = reminder;
    await gateway.handleConversation({ ...request, activeScheduledReminders: [legacyReminder] }, client);
    expect(reply).toHaveBeenCalledTimes(2);
  });

  it('streams through its own events and rejects diary payload before provider work', async () => {
    const client: any = new EventEmitter();
    client.user = { id: 7 }; client.disconnected = false;
    const emit = jest.spyOn(client, 'emit');
    const reply = jest.fn(async (_owner: number, _dto: unknown, stream: any) => {
      stream.onText('Answer'); return { text: 'Answer' };
    });
    const gateway = new AiGateway({} as never, {} as never, {} as never, {} as never, {} as never, {} as never, { reply } as never, {} as never);
    await gateway.handleConversation(request, client);
    expect(reply).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith('conversation_chunk', { text: 'Answer' });
    expect(emit).toHaveBeenCalledWith('conversation_done', { text: 'Answer' });
    expect(client.listenerCount('disconnect')).toBe(0);
    await gateway.handleConversation({ ...request, diaryContext: 'forbidden' }, client);
    expect(reply).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith('conversation_error', expect.anything());
  });
});
