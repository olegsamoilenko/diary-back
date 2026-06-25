import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { HttpException } from '@nestjs/common';
import { PlanGuard } from './plan.guard';
import { BasePlanIds, PlanStatus } from 'src/plans/types';

describe('PlanGuard', () => {
  const usersService = {
    findById: jest.fn(),
  };
  const plansService = {
    getActualByUserId: jest.fn(),
    updatePlan: jest.fn(),
  };
  const planGateway = {
    emitPlanStatusChanged: jest.fn(),
  };

  let guard: PlanGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new PlanGuard(
      usersService as any,
      plansService as any,
      planGateway as any,
    );
  });

  function httpContext(userId?: number) {
    return {
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => ({
          user: userId ? { id: userId } : undefined,
        }),
      }),
    } as any;
  }

  function activePlan(overrides: Record<string, unknown> = {}) {
    return {
      id: 58,
      userId: 167,
      basePlanId: BasePlanIds.BASE_M1,
      planStatus: PlanStatus.ACTIVE,
      actual: true,
      expiryTime: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      creditsLimit: 100,
      usedCredits: 10,
      ...overrides,
    };
  }

  it('allows HTTP requests for active non-expired plans within credit limit', async () => {
    (usersService.findById as any).mockResolvedValueOnce({ id: 167 });
    (plansService.getActualByUserId as any).mockResolvedValueOnce({
      plan: activePlan(),
    });

    await expect(guard.canActivate(httpContext(167))).resolves.toBe(true);

    expect(plansService.updatePlan).not.toHaveBeenCalled();
    expect(planGateway.emitPlanStatusChanged).not.toHaveBeenCalled();
  });

  it('throws when the user has no actual plan', async () => {
    (usersService.findById as any).mockResolvedValueOnce({ id: 167 });
    (plansService.getActualByUserId as any).mockResolvedValueOnce({
      plan: null,
    });

    await expect(guard.canActivate(httpContext(167))).rejects.toThrow(
      HttpException,
    );
  });

  it('allows canceled plans until their expiry time passes', async () => {
    (usersService.findById as any).mockResolvedValueOnce({ id: 167 });
    (plansService.getActualByUserId as any).mockResolvedValueOnce({
      plan: activePlan({
        planStatus: PlanStatus.CANCELED,
        expiryTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
      }),
    });

    await expect(guard.canActivate(httpContext(167))).resolves.toBe(true);
  });

  it('expires a trial plan after expiryTime and emits plan status changes', async () => {
    (usersService.findById as any).mockResolvedValueOnce({ id: 167 });
    (plansService.getActualByUserId as any).mockResolvedValueOnce({
      plan: activePlan({
        basePlanId: BasePlanIds.START,
        expiryTime: new Date(Date.now() - 60 * 1000),
      }),
    });

    await expect(guard.canActivate(httpContext(167))).rejects.toThrow(
      HttpException,
    );

    expect(plansService.updatePlan).toHaveBeenCalledWith(58, {
      planStatus: PlanStatus.EXPIRED,
    });
    expect(planGateway.emitPlanStatusChanged).toHaveBeenCalledWith(167);
  });

  it('expires paid plans only after the three-day grace window', async () => {
    (usersService.findById as any).mockResolvedValueOnce({ id: 167 });
    (plansService.getActualByUserId as any).mockResolvedValueOnce({
      plan: activePlan({
        basePlanId: BasePlanIds.BASE_M1,
        expiryTime: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
      }),
    });

    await expect(guard.canActivate(httpContext(167))).rejects.toThrow(
      HttpException,
    );

    expect(plansService.updatePlan).toHaveBeenCalledWith(58, {
      planStatus: PlanStatus.EXPIRED,
    });
    expect(planGateway.emitPlanStatusChanged).toHaveBeenCalledWith(167);
  });

  it('does not expire paid plans inside the three-day grace window', async () => {
    (usersService.findById as any).mockResolvedValueOnce({ id: 167 });
    (plansService.getActualByUserId as any).mockResolvedValueOnce({
      plan: activePlan({
        basePlanId: BasePlanIds.BASE_M1,
        expiryTime: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      }),
    });

    await expect(guard.canActivate(httpContext(167))).resolves.toBe(true);

    expect(plansService.updatePlan).not.toHaveBeenCalled();
  });

  it('marks plans as credit exceeded when used credits reach the limit', async () => {
    (usersService.findById as any).mockResolvedValueOnce({ id: 167 });
    (plansService.getActualByUserId as any).mockResolvedValueOnce({
      plan: activePlan({
        creditsLimit: 100,
        usedCredits: 100,
      }),
    });

    await expect(guard.canActivate(httpContext(167))).rejects.toThrow(
      HttpException,
    );

    expect(plansService.updatePlan).toHaveBeenCalledWith(58, {
      planStatus: PlanStatus.CREDIT_EXCEEDED,
    });
    expect(planGateway.emitPlanStatusChanged).toHaveBeenCalledWith(167);
  });
});
