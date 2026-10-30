import { describe, expect, it, jest } from '@jest/globals';
import { EventEmitter } from 'node:events';
import { AiGateway } from './ai.gateway';

describe('NA60 AI stream disconnect compatibility', () => {
  it('aborts the old stream, drops late output and lets the next request complete', async () => {
    const client: any = new EventEmitter();
    client.user = { id: 7 };
    client.disconnected = false;
    const emitted = jest.spyOn(client, 'emit');
    let release!: () => void;
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    let signal!: AbortSignal;
    const reply = jest.fn(
      async (_owner: number, _dto: unknown, stream: any) => {
        signal = stream.signal;
        stream.onText('first');
        started();
        await pending;
        stream.onText('late');
        return { text: 'old result' };
      },
    );
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
    const request = {
      expectedUserId: 7,
      requestId: '35c34b79-cfdf-4c01-8dc2-2fd3b58ed6ac',
      conversationId: '55c34b79-cfdf-4c01-8dc2-2fd3b58ed6ac',
      question: 'Hello',
      history: [],
      omittedTurns: 0,
      timezone: 'Europe/Kyiv',
      createdAt: '2026-10-01T10:00:00Z',
    };
    const run = gateway.handleConversation(request, client);
    await ready;
    client.disconnected = true;
    client.emit('disconnect');
    expect(signal.aborted).toBe(true);
    release();
    await run;
    expect(emitted).toHaveBeenCalledWith('conversation_chunk', {
      text: 'first',
    });
    expect(emitted).not.toHaveBeenCalledWith('conversation_chunk', {
      text: 'late',
    });
    expect(emitted).not.toHaveBeenCalledWith(
      'conversation_done',
      expect.anything(),
    );
    expect(client.listenerCount('disconnect')).toBe(0);
    client.disconnected = false;
    reply.mockImplementation(async (_owner, _dto, stream) => {
      stream.onText('next');
      return { text: 'next result' };
    });
    await gateway.handleConversation(
      { ...request, requestId: '45c34b79-cfdf-4c01-8dc2-2fd3b58ed6ac' },
      client,
    );
    expect(emitted).toHaveBeenCalledWith('conversation_done', {
      text: 'next result',
    });
    expect(client.listenerCount('disconnect')).toBe(0);
  });
});
