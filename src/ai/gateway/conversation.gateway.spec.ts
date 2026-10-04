import { describe, expect, it, jest } from '@jest/globals';
import { EventEmitter } from 'node:events';
import { AiGateway } from './ai.gateway';

const request = {
  expectedUserId: 7,
  requestId: '35c34b79-cfdf-4c01-8dc2-2fd3b58ed6ac',
  conversationId: '55c34b79-cfdf-4c01-8dc2-2fd3b58ed6ac',
  question: 'Hello', history: [], omittedTurns: 0,
  timezone: 'Europe/Kyiv', createdAt: '2026-10-01T10:00:00Z',
};
describe('standalone socket contract', () => {
  it('streams through its own events and rejects diary payload before provider work', async () => {
    const client: any = new EventEmitter();
    client.user = { id: 7 }; client.disconnected = false;
    const emit = jest.spyOn(client, 'emit');
    const reply = jest.fn(async (_owner: number, _dto: unknown, stream: any) => {
      stream.onText('Answer'); return { text: 'Answer' };
    });
    const gateway = new AiGateway({} as never, {} as never, {} as never, {} as never, {} as never, {} as never, { reply } as never);
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
