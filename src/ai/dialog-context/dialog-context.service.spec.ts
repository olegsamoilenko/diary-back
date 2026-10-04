import { describe, it, expect, jest } from '@jest/globals';
import {
  DialogContextService,
  dialogHistoryThreshold,
} from './dialog-context.service';

function fixture() {
  const ai = {
    countStringTokens: jest.fn((texts: string[]) => texts.join('').length),
    executeResponse: jest.fn<any>().mockResolvedValue({
      fullText: 'User corrected prior assumption; issue remains open.',
      finishReason: 'stop',
    }),
  };
  const cycles = { claimExecution: jest.fn<any>().mockResolvedValue(true) };
  const subscriptions = {
    getEffectiveAiBasePlanId: jest.fn<any>().mockResolvedValue('lite-m1'),
  };
  const service = new DialogContextService(
    ai as any,
    cycles as any,
    subscriptions as any,
  );
  const dto = {
    expectedUserId: 7,
    requestId: 'request',
    source: 'x'.repeat(10000),
    retainedHistory: 'y'.repeat(3000),
  };
  return { service, ai, cycles, subscriptions, dto };
}
describe('shared pre-response dialogue compression', () => {
  it('uses the agreed plan thresholds', () => {
    expect(
      ['lite-m1', 'base-m1', 'pro-m1'].map(dialogHistoryThreshold),
    ).toEqual([12000, 18000, 24000]);
  });
  it('charges one Luna call with a 25% source guide, excluding recent pairs', async () => {
    const f = fixture();
    const result = await f.service.compress(7, f.dto);
    expect(result).toMatchObject({
      accepted: true,
      sourceTokens: 10000,
      targetTokens: 2500,
    });
    expect(f.ai.executeResponse).toHaveBeenCalledTimes(1);
    const call = f.ai.executeResponse.mock.calls[0][0] as any;
    expect(call.model).toBe('gpt-5.6-luna');
    expect(call.messages[1].content).toBe(f.dto.source);
    expect(call.messages[0].content).toContain('approximately 2500');
    expect(call.runtime.outputPurpose).toBe('tier_response');
    expect(call.accounting).toMatchObject({
      operation: 'compress_dialog_context',
      tokenType: 'dialog_capsule',
      cycleComplete: true,
    });
  });
  it('does not call or claim at the boundary, and resolves plan on the server', async () => {
    const f = fixture();
    expect(
      await f.service.compress(7, {
        ...f.dto,
        retainedHistory: 'y'.repeat(2000),
      }),
    ).toMatchObject({ accepted: false });
    f.subscriptions.getEffectiveAiBasePlanId.mockResolvedValue('pro-m1');
    expect(await f.service.compress(7, f.dto)).toMatchObject({
      accepted: false,
    });
    expect(f.cycles.claimExecution).not.toHaveBeenCalled();
    expect(f.ai.executeResponse).not.toHaveBeenCalled();
  });
  it.each(['length', 'max_tokens'])(
    'never commits a truncated capsule (%s) or retries',
    async (finishReason) => {
      const f = fixture();
      f.ai.executeResponse.mockResolvedValue({
        fullText: 'Partial',
        finishReason,
      });
      expect(await f.service.compress(7, f.dto)).toMatchObject({
        accepted: false,
      });
      expect(f.ai.executeResponse).toHaveBeenCalledTimes(1);
    },
  );
  it('accepts a shorter result above target without another paid compression', async () => {
    const f = fixture();
    f.ai.executeResponse.mockResolvedValue({
      fullText: 'z'.repeat(4000),
      finishReason: 'stop',
    });
    expect(await f.service.compress(7, f.dto)).toMatchObject({
      accepted: true,
      tokens: 4000,
    });
    expect(f.ai.executeResponse).toHaveBeenCalledTimes(1);
  });
  it('retains source when output is empty or no smaller', async () => {
    for (const text of ['', 'z'.repeat(10000)]) {
      const f = fixture();
      f.ai.executeResponse.mockResolvedValue({
        fullText: text,
        finishReason: 'stop',
      });
      expect(await f.service.compress(7, f.dto)).toMatchObject({
        accepted: false,
      });
    }
  });
  it('rejects ownership mismatch, cancellation and duplicate execution before provider work', async () => {
    const f = fixture();
    await expect(f.service.compress(8, f.dto)).rejects.toThrow('account');
    const abort = new AbortController();
    abort.abort();
    await expect(f.service.compress(7, f.dto, abort.signal)).rejects.toThrow();
    f.cycles.claimExecution.mockResolvedValue(false);
    await expect(f.service.compress(7, f.dto)).rejects.toThrow(
      'ALREADY_STARTED',
    );
    expect(f.ai.executeResponse).not.toHaveBeenCalled();
  });
});
