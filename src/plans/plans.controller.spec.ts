import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { HttpException } from '@nestjs/common';
import { PlansController } from './plans.controller';
import { BasePlanIds, PlanStatus, SubscriptionIds } from './types';
import { Platform } from 'src/common/types/platform';

describe('PlansController', () => {
  const plansService = {
    subscribePlan: jest.fn(),
    unsubscribePlan: jest.fn(),
    getActualByUserId: jest.fn(),
    changePlan: jest.fn(),
    changePlanStatus: jest.fn(),
  };

  let controller: PlansController;

  const user = { id: 167 };
  const createPlanDto = {
    platform: Platform.ANDROID,
    regionCode: 'UA',
    subscriptionId: SubscriptionIds.NEMORY,
    basePlanId: BasePlanIds.START,
    price: 0,
    currency: 'UAH',
    startTime: new Date('2026-06-25T15:00:00.000Z'),
    expiryTime: new Date('2026-07-02T15:00:00.000Z'),
    autoRenewEnabled: false,
    planStatus: PlanStatus.ACTIVE,
    actual: true,
    lastOrderId: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new PlansController(plansService as any);
  });

  it('passes the active user id to subscribePlan', async () => {
    (plansService.subscribePlan as any).mockResolvedValueOnce({ plan: { id: 1 } });

    const result = await controller.subscribePlan(user as any, createPlanDto);

    expect(result).toEqual({ plan: { id: 1 } });
    expect(plansService.subscribePlan).toHaveBeenCalledWith(
      167,
      createPlanDto,
    );
  });

  it('rejects paid plan creation through the public subscribe endpoint', async () => {
    await expect(
      controller.subscribePlan(user as any, {
        ...createPlanDto,
        basePlanId: BasePlanIds.BASE_M1,
        price: 394.99,
        purchaseToken: 'purchase-token',
        lastOrderId: 'GPA.1',
      } as any),
    ).rejects.toThrow(HttpException);

    expect(plansService.subscribePlan).not.toHaveBeenCalled();
  });

  it('passes the active user id to unsubscribePlan', async () => {
    (plansService.unsubscribePlan as any).mockResolvedValueOnce(undefined);

    await controller.unsubscribePlan(user as any);

    expect(plansService.unsubscribePlan).toHaveBeenCalledWith(167);
  });

  it('passes the active user id to getActualPlan', async () => {
    (plansService.getActualByUserId as any).mockResolvedValueOnce({
      plan: { id: 1 },
    });

    const result = await controller.getActualPlan(user as any);

    expect(result).toEqual({ plan: { id: 1 } });
    expect(plansService.getActualByUserId).toHaveBeenCalledWith(167);
  });

  it('passes the active user id and dto to changePlan', async () => {
    (plansService.changePlan as any).mockResolvedValueOnce({ id: 1 });

    const result = await controller.changePlan(user as any, {
      id: 1,
      actual: false,
    });

    expect(result).toEqual({ id: 1 });
    expect(plansService.changePlan).toHaveBeenCalledWith(167, {
      id: 1,
      actual: false,
    });
  });

  it('routes admin status changes to changePlanStatus', async () => {
    (plansService.changePlanStatus as any).mockResolvedValueOnce(undefined);

    await controller.changePlanStatus({
      id: 1,
      planStatus: PlanStatus.EXPIRED,
    });

    expect(plansService.changePlanStatus).toHaveBeenCalledWith(
      1,
      PlanStatus.EXPIRED,
    );
  });
});
