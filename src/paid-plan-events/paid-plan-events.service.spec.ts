import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { PaidPlanEventsService } from './paid-plan-events.service';
import {
  PaidPlanEventSeverity,
  PaidPlanEventSource,
} from './entities/paid-plan-event.entity';
import { sendPlansTelegram } from 'src/telegram/send-telegram';
import { BasePlanIds, PlanStatus } from 'src/plans/types';

jest.mock('src/telegram/send-telegram', () => ({
  sendPlansTelegram: jest.fn(),
}));

describe('PaidPlanEventsService', () => {
  const repository = {
    create: jest.fn(),
    save: jest.fn(),
  };

  let service: PaidPlanEventsService;
  let consoleErrorSpy: jest.SpiedFunction<typeof console.error>;
  let consoleWarnSpy: jest.SpiedFunction<typeof console.warn>;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    (repository.create as any).mockImplementation((payload: any) => ({
      id: 'event-1',
      ...payload,
    }));
    (repository.save as any).mockImplementation(async (event: any) => event);

    service = new PaidPlanEventsService(repository as any);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  it('stores info events without sending Telegram alerts', async () => {
    await service.info({
      eventType: 'PAID_PLAN_CREATED',
      source: PaidPlanEventSource.PLANS_SERVICE,
      userId: 167,
      purchaseToken: 'purchase-token-1234567890',
      basePlanId: BasePlanIds.BASE_M1,
      planStatus: PlanStatus.ACTIVE,
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'PAID_PLAN_CREATED',
        severity: PaidPlanEventSeverity.INFO,
        purchaseTokenSuffix: '1234567890',
        purchaseTokenHash: expect.any(String),
      }),
    );
    expect(repository.save).toHaveBeenCalledTimes(1);
    expect(sendPlansTelegram).not.toHaveBeenCalled();
  });

  it('stores warning events and sends a Telegram alert', async () => {
    await service.warning({
      eventType: 'PAID_PLAN_ACTUAL_SWITCH',
      source: PaidPlanEventSource.PLANS_SERVICE,
      userId: 167,
      oldPlanId: 58,
      newPlanId: 59,
      purchaseToken: 'purchase-token-1234567890',
      linkedPurchaseToken: 'linked-token-0987654321',
      orderId: 'GPA.1',
      oldOrderId: 'GPA.0',
      basePlanId: BasePlanIds.BASE_M1,
      oldBasePlanId: BasePlanIds.LITE_M1,
      planStatus: PlanStatus.ACTIVE,
      oldPlanStatus: PlanStatus.ACTIVE,
      message: 'Paid plan actual flag was switched off.',
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: PaidPlanEventSeverity.WARNING,
        purchaseTokenSuffix: '1234567890',
        linkedPurchaseTokenSuffix: '0987654321',
      }),
    );
    expect(repository.save).toHaveBeenCalledTimes(1);
    expect(sendPlansTelegram).toHaveBeenCalledWith(
      expect.stringContaining('event: PAID_PLAN_ACTUAL_SWITCH'),
    );
  });

  it('stores conflict events and sends a Telegram alert', async () => {
    await service.conflict({
      eventType: 'PUBSUB_UNKNOWN_PURCHASE_TOKEN',
      source: PaidPlanEventSource.GOOGLE_PUBSUB,
      purchaseToken: 'unknown-token-1234567890',
      basePlanId: BasePlanIds.BASE_M1,
      planStatus: PlanStatus.ACTIVE,
      message: 'Unknown token.',
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: PaidPlanEventSeverity.CONFLICT,
        eventType: 'PUBSUB_UNKNOWN_PURCHASE_TOKEN',
        purchaseTokenSuffix: '1234567890',
      }),
    );
    expect(sendPlansTelegram).toHaveBeenCalledWith(
      expect.stringContaining('[CONFLICT] PAID PLAN CONFLICT'),
    );
  });

  it('does not throw when saving an event fails', async () => {
    (repository.save as any).mockRejectedValueOnce(new Error('db failed'));

    await expect(
      service.warning({
        eventType: 'PAID_PLAN_ACTUAL_SWITCH',
        source: PaidPlanEventSource.PLANS_SERVICE,
        purchaseToken: 'purchase-token-1234567890',
      }),
    ).resolves.toBeUndefined();

    expect(sendPlansTelegram).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to record paid plan event:',
      expect.any(Error),
    );
  });

  it('does not throw when Telegram alert sending fails after saving the event', async () => {
    (sendPlansTelegram as any).mockRejectedValueOnce(
      new Error('telegram failed'),
    );

    await expect(
      service.conflict({
        eventType: 'PUBSUB_UNKNOWN_PURCHASE_TOKEN',
        source: PaidPlanEventSource.GOOGLE_PUBSUB,
        purchaseToken: 'purchase-token-1234567890',
      }),
    ).resolves.toBeUndefined();

    expect(repository.save).toHaveBeenCalledTimes(1);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'Failed to send paid plan Telegram alert:',
      expect.any(Error),
    );
  });
});
