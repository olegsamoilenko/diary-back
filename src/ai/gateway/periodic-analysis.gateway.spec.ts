import { describe, expect, it, jest } from '@jest/globals';
import { EventEmitter } from 'node:events';
import { AiGateway } from './ai.gateway';

const request = {
  expectedUserId: 1,
  requestId: '35c34b79-cfdf-4c01-8dc2-2fd3b58ed6ac',
  kind: 'day',
  start: '2026-09-18',
  end: '2026-09-18',
  timezone: 'Europe/Kyiv',
  asOf: '2026-09-18T17:00:00Z',
  firstDayOfWeek: 1,
  snapshot: {},
};
function setup(generate: any) {
  const client: any = new EventEmitter();
  client.user = { id: 1 };
  client.disconnected = false;
  client.data = {};
  const emit = jest.spyOn(client, 'emit');
  const dialog = jest.fn();
  const gateway = new AiGateway(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { generate, dialog } as never,
    {} as never,
  );
  return { client, emit, gateway, dialog };
}
describe('periodic analysis socket', () => {
  it('preserves creation timestamps and active commitments through socket validation', async () => {
    const generate = jest.fn(async () => ({ status: 'completed' }));
    const f = setup(generate);
    const createdAt = '2026-07-14T09:00:00.123+03:00';
    await f.gateway.handlePeriodicAnalysis({ ...request, createdAt }, f.client);
    expect(generate).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ createdAt }),
      expect.anything(),
    );
    await f.gateway.handlePeriodicAnalysisDialog(
      {
        expectedUserId: 1,
        reportId: request.requestId,
        requestId: request.requestId,
        question: 'Why?',
        report: { id: request.requestId, prompt: [] },
        activeCommitments: [],
        createdAt,
      },
      f.client,
    );
    expect(f.dialog).toHaveBeenCalledWith(
      1,
      request.requestId,
      request.requestId,
      'Why?',
      expect.anything(),
      createdAt,
      { id: request.requestId, prompt: [] },
      [],
      undefined,
    );
  });
  it('streams text then saved report on the authenticated connection', async () => {
    const generate = jest.fn(
      async (_id: number, _dto: unknown, stream: any) => {
        stream.onText('Hello');
        return { id: request.requestId, text: 'Hello', status: 'completed' };
      },
    );
    const f = setup(generate);
    await f.gateway.handlePeriodicAnalysis(request, f.client);
    expect(generate).toHaveBeenCalledWith(
      1,
      expect.objectContaining(request),
      expect.anything(),
    );
    expect(f.emit).toHaveBeenCalledWith('periodic_analysis_chunk', {
      text: 'Hello',
    });
    expect(f.emit).toHaveBeenCalledWith(
      'periodic_analysis_done',
      expect.objectContaining({ status: 'completed' }),
    );
    expect(f.client.listenerCount('disconnect')).toBe(0);
  });
  it('rejects invalid generation payloads and cross-account dialogue before model invocation', async () => {
    const generate = jest.fn();
    const f = setup(generate);
    await f.gateway.handlePeriodicAnalysis(
      { ...request, requestId: 'invalid' },
      f.client,
    );
    await f.gateway.handlePeriodicAnalysisDialog(
      {
        expectedUserId: 2,
        reportId: request.requestId,
        requestId: request.requestId,
        question: 'Why?',
      },
      f.client,
    );
    expect(generate).not.toHaveBeenCalled();
    expect(f.dialog).not.toHaveBeenCalled();
    expect(f.emit).toHaveBeenCalledWith(
      'periodic_analysis_error',
      expect.anything(),
    );
  });
  it('disconnect aborts provider work and prevents done emission', async () => {
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    let signal!: AbortSignal;
    const generate = jest.fn(
      async (_id: number, _dto: unknown, stream: any) => {
        signal = stream.signal;
        started();
        await new Promise<void>((_resolve, reject) =>
          signal.addEventListener('abort', () => reject(new Error('aborted'))),
        );
      },
    );
    const f = setup(generate);
    const running = f.gateway.handlePeriodicAnalysis(request, f.client);
    await ready;
    f.client.disconnected = true;
    f.client.emit('disconnect');
    await running;
    expect(signal.aborted).toBe(true);
    expect(
      f.emit.mock.calls.some(([event]) => event === 'periodic_analysis_done'),
    ).toBe(false);
  });
});


it('accepts a media-only period question and forwards validated media IDs',async()=>{
 const f=setup(jest.fn());
 f.dialog.mockResolvedValue({status:'completed'} as never);
 await f.gateway.handlePeriodicAnalysisDialog({expectedUserId:1,reportId:request.requestId,requestId:request.requestId,
  question:'',report:{id:request.requestId,prompt:[]},mediaIds:[request.requestId]},f.client);
 expect(f.dialog).toHaveBeenCalledWith(1,request.requestId,request.requestId,'',expect.anything(),undefined,expect.anything(),undefined,[request.requestId]);
});
