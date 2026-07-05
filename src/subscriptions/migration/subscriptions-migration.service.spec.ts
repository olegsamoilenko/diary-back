import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { BasePlanIds, PlanStatus } from 'src/plans/types';
import { Platform } from 'src/common/types/platform';
import { SubscriptionLegacyMapper } from '../subscription-legacy.mapper';
import { StoreSubscriptionProvider } from '../types';
import { SubscriptionsLegacyDryRunService } from './subscriptions-legacy-dry-run.service';
import { SubscriptionsMigrationService } from './subscriptions-migration.service';

describe('SubscriptionsMigrationService', () => {
  const now = new Date('2026-06-26T12:00:00.000Z');
  const usersRepository = {
    find: jest.fn(),
  };
  const plansRepository = {
    find: jest.fn(),
  };
  const storeSubscriptionsRepository = {
    findOne: jest.fn(),
    merge: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
  const userPlanStatesRepository = {
    findOne: jest.fn(),
    merge: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  let service: SubscriptionsMigrationService;
  let googlePlaySubscriptionsService: { verifyAndroidSub: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    const mapper = new SubscriptionLegacyMapper();
    googlePlaySubscriptionsService = {
      verifyAndroidSub: jest.fn(),
    };
    (googlePlaySubscriptionsService.verifyAndroidSub as any).mockResolvedValue({
      planData: {
        platform: Platform.ANDROID,
        regionCode: 'UA',
        subscriptionId: 'nemory',
        basePlanId: BasePlanIds.LITE_M1,
        price: 394.99,
        currency: 'UAH',
        startTime: new Date('2026-06-25T12:00:00.000Z'),
        expiryTime: new Date('2026-07-25T12:00:00.000Z'),
        autoRenewEnabled: true,
        planStatus: PlanStatus.ACTIVE,
        purchaseToken: 'purchase-token',
        linkedPurchaseToken: null,
        lastOrderId: 'GPA.1',
      },
      paymentData: {},
      googleData: {},
    });
    const dryRunService = new SubscriptionsLegacyDryRunService(
      { findOne: jest.fn() } as any,
      plansRepository as any,
      mapper,
      googlePlaySubscriptionsService as any,
    );
    service = new SubscriptionsMigrationService(
      usersRepository as any,
      plansRepository as any,
      storeSubscriptionsRepository as any,
      userPlanStatesRepository as any,
      mapper,
      dryRunService,
    );

    (storeSubscriptionsRepository.findOne as any).mockResolvedValue(null);
    (storeSubscriptionsRepository.create as any).mockImplementation(
      (draft: any) => draft,
    );
    (storeSubscriptionsRepository.merge as any).mockImplementation(
      (_existing: any, draft: any) => draft,
    );
    (storeSubscriptionsRepository.save as any).mockImplementation(
      async (entity: any) => ({ ...entity, id: 901 }),
    );
    (userPlanStatesRepository.findOne as any).mockResolvedValue(null);
    (userPlanStatesRepository.create as any).mockImplementation(
      (draft: any) => draft,
    );
    (userPlanStatesRepository.merge as any).mockImplementation(
      (_existing: any, draft: any) => draft,
    );
    (userPlanStatesRepository.save as any).mockImplementation(
      async (entity: any) => ({ ...entity, id: 301 }),
    );
  });

  it('migrates all users in chunks and links current state to the selected store subscription', async () => {
    (usersRepository.find as any)
      .mockResolvedValueOnce([{ id: 167 }])
      .mockResolvedValueOnce([]);
    (plansRepository.find as any).mockResolvedValueOnce([
      {
        id: 58,
        userId: 167,
        platform: Platform.ANDROID,
        regionCode: 'UA',
        subscriptionId: 'nemory',
        basePlanId: BasePlanIds.LITE_M1,
        price: 394.99,
        currency: 'UAH',
        lastOrderId: 'GPA.1',
        creditsLimit: 40000,
        usedCredits: 0,
        inputUsedCredits: 0,
        outputUsedCredits: 0,
        purchaseToken: 'purchase-token',
        linkedPurchaseToken: null,
        startTime: '2026-06-25T12:00:00.000Z',
        expiryTime: '2026-07-25T12:00:00.000Z',
        startPayment: '2026-06-25T12:00:00.000Z',
        autoRenewEnabled: true,
        planStatus: PlanStatus.ACTIVE,
        actual: false,
        usedTrial: true,
      },
    ]);

    const result = await service.migrateAllUsers(1, now);

    expect(result).toEqual(
      expect.objectContaining({
        totalUsers: 1,
        chunkSize: 1,
        userPlanStatesUpserted: 1,
        storeSubscriptionsUpserted: 1,
      }),
    );
    expect(storeSubscriptionsRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: StoreSubscriptionProvider.GOOGLE_PLAY,
        purchaseToken: 'purchase-token',
        legacyPlanId: 58,
      }),
    );
    expect(userPlanStatesRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 167,
        legacyPlanId: 58,
        currentStoreSubscriptionId: 901,
        price: 394.99,
        currency: 'UAH',
      }),
    );
    expect(result.warnings).toEqual([
      {
        userId: 167,
        warnings: [
          'SELECTED_GOOGLE_ACTIVE_NON_ACTUAL_PLAN',
          'NO_ACTUAL_BUT_ACTIVE_PAID_PLAN_EXISTS',
        ],
      },
    ]);
  });
});
