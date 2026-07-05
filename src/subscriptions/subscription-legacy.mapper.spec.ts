import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Plan } from 'src/plans/entities/plan.entity';
import { BasePlanIds, PlanStatus, SubscriptionIds } from 'src/plans/types';
import { Platform } from 'src/common/types/platform';
import { SubscriptionLegacyMapper } from './subscription-legacy.mapper';
import { SubscriptionsLegacyDryRunService } from './migration/subscriptions-legacy-dry-run.service';
import {
  StoreSubscriptionProvider,
  SubscriptionAccessReason,
  SubscriptionAccessStatus,
  SubscriptionBillingStatus,
  SubscriptionSource,
} from './types';

const now = new Date('2026-06-26T12:00:00.000Z');

function plan(overrides: Partial<Plan>): Plan {
  return {
    id: 1,
    platform: Platform.ANDROID,
    regionCode: 'UA',
    subscriptionId: SubscriptionIds.NEMORY,
    basePlanId: BasePlanIds.START,
    name: 'Start' as any,
    price: 0,
    currency: null,
    lastOrderId: null,
    creditsLimit: 5000,
    usedCredits: 0,
    inputUsedCredits: 0,
    outputUsedCredits: 0,
    purchaseToken: null,
    linkedPurchaseToken: null,
    startTime: '2026-06-20T12:00:00.000Z',
    expiryTime: '2026-06-27T12:00:00.000Z',
    startPayment: null,
    autoRenewEnabled: false,
    user: undefined as any,
    userId: 167,
    payments: [],
    planStatus: PlanStatus.ACTIVE,
    actual: true,
    usedTrial: true,
    ...overrides,
  };
}

describe('SubscriptionLegacyMapper', () => {
  let mapper: SubscriptionLegacyMapper;

  beforeEach(() => {
    mapper = new SubscriptionLegacyMapper();
  });

  it('maps an expired trial by dates even when legacy status is still ACTIVE', () => {
    const draft = mapper.toUserPlanStateDraft(
      167,
      plan({
        basePlanId: BasePlanIds.START,
        planStatus: PlanStatus.ACTIVE,
        expiryTime: '2026-06-25T12:00:00.000Z',
      }),
      { now },
    );

    expect(draft).toEqual(
      expect.objectContaining({
        source: SubscriptionSource.TRIAL,
        name: 'Start',
        price: 0,
        billingStatus: SubscriptionBillingStatus.NONE,
        accessStatus: SubscriptionAccessStatus.LIMITED,
        metadata: expect.objectContaining({
          accessReason: SubscriptionAccessReason.TRIAL_EXPIRED,
        }),
      }),
    );
  });

  it('maps a trial with exhausted credits to CREDIT_EXCEEDED while billing stays NONE', () => {
    const draft = mapper.toUserPlanStateDraft(
      167,
      plan({
        basePlanId: BasePlanIds.START,
        planStatus: PlanStatus.ACTIVE,
        creditsLimit: 5000,
        usedCredits: 5000,
      }),
      { now },
    );

    expect(draft).toEqual(
      expect.objectContaining({
        source: SubscriptionSource.TRIAL,
        billingStatus: SubscriptionBillingStatus.NONE,
        accessStatus: SubscriptionAccessStatus.LIMITED,
        metadata: expect.objectContaining({
          accessReason: SubscriptionAccessReason.CREDIT_EXCEEDED,
        }),
      }),
    );
  });

  it('keeps paid CREDIT_EXCEEDED billing active when the paid period is still valid', () => {
    const draft = mapper.toUserPlanStateDraft(
      167,
      plan({
        basePlanId: BasePlanIds.LITE_M1,
        planStatus: PlanStatus.CREDIT_EXCEEDED,
        purchaseToken: 'purchase-token',
        expiryTime: '2026-07-26T12:00:00.000Z',
      }),
      { now },
    );

    expect(draft).toEqual(
      expect.objectContaining({
        source: SubscriptionSource.GOOGLE_PLAY,
        billingStatus: SubscriptionBillingStatus.ACTIVE,
        accessStatus: SubscriptionAccessStatus.LIMITED,
        metadata: expect.objectContaining({
          accessReason: SubscriptionAccessReason.CREDIT_EXCEEDED,
        }),
      }),
    );
  });

  it('maps paid plans with expired periods to EXPIRED even when legacy status is still ACTIVE', () => {
    const draft = mapper.toUserPlanStateDraft(
      167,
      plan({
        basePlanId: BasePlanIds.LITE_M1,
        planStatus: PlanStatus.ACTIVE,
        purchaseToken: 'purchase-token',
        expiryTime: '2026-03-31T15:46:14.362Z',
      }),
      { now },
    );

    expect(draft).toEqual(
      expect.objectContaining({
        source: SubscriptionSource.GOOGLE_PLAY,
        billingStatus: SubscriptionBillingStatus.EXPIRED,
        accessStatus: SubscriptionAccessStatus.LIMITED,
        metadata: expect.objectContaining({
          accessReason: SubscriptionAccessReason.SUBSCRIPTION_EXPIRED,
        }),
      }),
    );
  });

  it('keeps canceled paid plans active until the paid period ends', () => {
    const draft = mapper.toUserPlanStateDraft(
      167,
      plan({
        basePlanId: BasePlanIds.LITE_M1,
        planStatus: PlanStatus.CANCELED,
        purchaseToken: 'purchase-token',
        expiryTime: '2026-07-26T12:00:00.000Z',
      }),
      { now },
    );

    expect(draft).toEqual(
      expect.objectContaining({
        source: SubscriptionSource.GOOGLE_PLAY,
        billingStatus: SubscriptionBillingStatus.CANCELED,
        accessStatus: SubscriptionAccessStatus.ACTIVE,
        metadata: expect.objectContaining({
          accessReason: SubscriptionAccessReason.NONE,
        }),
      }),
    );
  });

  it('limits canceled paid plans after the paid period ends while keeping billing canceled', () => {
    const draft = mapper.toUserPlanStateDraft(
      167,
      plan({
        basePlanId: BasePlanIds.LITE_M1,
        planStatus: PlanStatus.CANCELED,
        purchaseToken: 'purchase-token',
        expiryTime: '2026-03-31T15:46:14.362Z',
      }),
      { now },
    );

    expect(draft).toEqual(
      expect.objectContaining({
        source: SubscriptionSource.GOOGLE_PLAY,
        billingStatus: SubscriptionBillingStatus.CANCELED,
        accessStatus: SubscriptionAccessStatus.LIMITED,
        metadata: expect.objectContaining({
          accessReason: SubscriptionAccessReason.SUBSCRIPTION_CANCELED,
        }),
      }),
    );
  });

  it('maps paused paid plans to limited access with billing paused reason', () => {
    const draft = mapper.toUserPlanStateDraft(
      167,
      plan({
        basePlanId: BasePlanIds.LITE_M1,
        planStatus: PlanStatus.PAUSED,
        purchaseToken: 'purchase-token',
        expiryTime: '2026-07-26T12:00:00.000Z',
      }),
      { now },
    );

    expect(draft).toEqual(
      expect.objectContaining({
        source: SubscriptionSource.GOOGLE_PLAY,
        billingStatus: SubscriptionBillingStatus.PAUSED,
        accessStatus: SubscriptionAccessStatus.LIMITED,
        metadata: expect.objectContaining({
          accessReason: SubscriptionAccessReason.BILLING_PAUSED,
        }),
      }),
    );
  });

  it('maps refunded paid plans to limited access with refunded reason', () => {
    const draft = mapper.toUserPlanStateDraft(
      167,
      plan({
        basePlanId: BasePlanIds.LITE_M1,
        planStatus: PlanStatus.REFUNDED,
        purchaseToken: 'purchase-token',
        expiryTime: '2026-07-26T12:00:00.000Z',
      }),
      { now },
    );

    expect(draft).toEqual(
      expect.objectContaining({
        source: SubscriptionSource.GOOGLE_PLAY,
        billingStatus: SubscriptionBillingStatus.REFUNDED,
        accessStatus: SubscriptionAccessStatus.LIMITED,
        metadata: expect.objectContaining({
          accessReason: SubscriptionAccessReason.SUBSCRIPTION_REFUNDED,
        }),
      }),
    );
  });

  it('creates store subscription drafts only for paid plans with purchase tokens', () => {
    expect(mapper.toStoreSubscriptionDraft(plan({}))).toBeNull();

    const draft = mapper.toStoreSubscriptionDraft(
      plan({
        id: 58,
        basePlanId: BasePlanIds.BASE_M1,
        planStatus: PlanStatus.ACTIVE,
        price: 394.99,
        currency: 'UAH',
        purchaseToken: 'purchase-token',
        linkedPurchaseToken: 'old-token',
        lastOrderId: 'GPA.1234',
      }),
    );

    expect(draft).toEqual(
      expect.objectContaining({
        provider: StoreSubscriptionProvider.GOOGLE_PLAY,
        purchaseToken: 'purchase-token',
        linkedPurchaseToken: 'old-token',
        lastOrderId: 'GPA.1234',
        basePlanId: BasePlanIds.BASE_M1,
        legacyPlanId: 58,
      }),
    );
  });

  it('maps users without any selected plan to limited without-subscription state', () => {
    const draft = mapper.toUserPlanStateDraft(167, null, { now });

    expect(draft).toEqual(
      expect.objectContaining({
        source: SubscriptionSource.NONE,
        basePlanId: null,
        name: 'None',
        price: 0,
        currency: null,
        billingStatus: SubscriptionBillingStatus.NONE,
        accessStatus: SubscriptionAccessStatus.LIMITED,
        useWithoutSubscription: true,
        startTime: null,
        expiryTime: null,
      }),
    );
  });
});

describe('SubscriptionsLegacyDryRunService', () => {
  function googlePlaySubscriptionsService() {
    const service = {
      verifyAndroidSub: jest.fn(),
    };
    (service.verifyAndroidSub as any).mockResolvedValue({
        planData: {
          platform: Platform.ANDROID,
          regionCode: 'UA',
          subscriptionId: SubscriptionIds.NEMORY,
          basePlanId: BasePlanIds.LITE_M1,
          price: 394.99,
          currency: 'UAH',
          startTime: new Date('2026-06-25T12:00:00.000Z'),
          expiryTime: new Date('2026-07-26T12:00:00.000Z'),
          autoRenewEnabled: true,
          planStatus: PlanStatus.ACTIVE,
          purchaseToken: 'purchase-token',
          linkedPurchaseToken: null,
          lastOrderId: 'GPA.1',
        },
        paymentData: {},
        googleData: {},
      } as any);
    return service;
  }

  it('selects a Google-active token plan even when legacy actual is false', async () => {
    const mapper = new SubscriptionLegacyMapper();
    const google = googlePlaySubscriptionsService();
    const service = new SubscriptionsLegacyDryRunService(
      {} as any,
      {} as any,
      mapper,
      google as any,
    );

    const preview = await service.buildPreviewFromPlans(
      167,
      [
        plan({
          id: 10,
          basePlanId: BasePlanIds.START,
          actual: false,
          expiryTime: '2026-06-20T12:00:00.000Z',
        }),
        plan({
          id: 58,
          basePlanId: BasePlanIds.LITE_M1,
          actual: false,
          purchaseToken: 'purchase-token',
          planStatus: PlanStatus.ACTIVE,
          expiryTime: '2026-07-26T12:00:00.000Z',
        }),
      ],
      now,
    );

    expect(preview.selectedLegacyPlanId).toBe(58);
    expect(preview.userPlanState).toEqual(
      expect.objectContaining({
        source: SubscriptionSource.GOOGLE_PLAY,
        billingStatus: SubscriptionBillingStatus.ACTIVE,
        accessStatus: SubscriptionAccessStatus.ACTIVE,
        price: 394.99,
        currency: 'UAH',
        legacyPlanId: 58,
      }),
    );
    expect(preview.storeSubscriptions).toHaveLength(1);
    expect(preview.warnings).toEqual(
      expect.arrayContaining([
        'SELECTED_GOOGLE_ACTIVE_NON_ACTUAL_PLAN',
        'NO_ACTUAL_BUT_ACTIVE_PAID_PLAN_EXISTS',
      ]),
    );
    expect(google.verifyAndroidSub).toHaveBeenCalledWith(
      'com.soniac12.nemory',
      'purchase-token',
    );
  });

  it('uses the legacy actual plan when token plans are not active in Google', async () => {
    const mapper = new SubscriptionLegacyMapper();
    const google = {
      verifyAndroidSub: jest.fn(),
    };
    (google.verifyAndroidSub as any).mockResolvedValue({
        planData: {
          platform: Platform.ANDROID,
          regionCode: 'UA',
          subscriptionId: SubscriptionIds.NEMORY,
          basePlanId: BasePlanIds.LITE_M1,
          price: 394.99,
          currency: 'UAH',
          startTime: new Date('2026-05-25T12:00:00.000Z'),
          expiryTime: new Date('2026-06-20T12:00:00.000Z'),
          autoRenewEnabled: false,
          planStatus: PlanStatus.EXPIRED,
          purchaseToken: 'purchase-token',
          linkedPurchaseToken: null,
          lastOrderId: 'GPA.1',
        },
        paymentData: {},
        googleData: {},
      } as any);
    const service = new SubscriptionsLegacyDryRunService(
      {} as any,
      {} as any,
      mapper,
      google as any,
    );

    const preview = await service.buildPreviewFromPlans(
      167,
      [
        plan({
          id: 10,
          basePlanId: BasePlanIds.START,
          actual: true,
          expiryTime: '2026-06-27T12:00:00.000Z',
        }),
        plan({
          id: 58,
          basePlanId: BasePlanIds.LITE_M1,
          actual: false,
          purchaseToken: 'purchase-token',
          planStatus: PlanStatus.ACTIVE,
          expiryTime: '2026-07-26T12:00:00.000Z',
        }),
      ],
      now,
    );

    expect(preview.selectedLegacyPlanId).toBe(10);
    expect(preview.userPlanState).toEqual(
      expect.objectContaining({
        source: SubscriptionSource.TRIAL,
        basePlanId: BasePlanIds.START,
        accessStatus: SubscriptionAccessStatus.ACTIVE,
        legacyPlanId: 10,
      }),
    );
  });

  it('returns limited no-plan state when there is no actual plan and no active Google token plan', async () => {
    const mapper = new SubscriptionLegacyMapper();
    const google = googlePlaySubscriptionsService();
    const service = new SubscriptionsLegacyDryRunService(
      {} as any,
      {} as any,
      mapper,
      google as any,
    );

    const preview = await service.buildPreviewFromPlans(
      167,
      [
        plan({
          id: 10,
          basePlanId: BasePlanIds.START,
          actual: false,
          purchaseToken: null,
        }),
      ],
      now,
    );

    expect(preview.selectedLegacyPlanId).toBeNull();
    expect(preview.userPlanState).toEqual(
      expect.objectContaining({
        source: SubscriptionSource.NONE,
        basePlanId: null,
        name: 'None',
        useWithoutSubscription: true,
        billingStatus: SubscriptionBillingStatus.NONE,
        accessStatus: SubscriptionAccessStatus.LIMITED,
      }),
    );
  });

  it('dedupes user ids for batch previews', async () => {
    const mapper = new SubscriptionLegacyMapper();
    const usersRepository = {
      findOne: jest.fn(),
    };
    const plansRepository = {
      find: jest.fn(),
    };
    (usersRepository.findOne as any).mockResolvedValue({ id: 167 });
    (plansRepository.find as any).mockResolvedValue([]);
    const service = new SubscriptionsLegacyDryRunService(
      usersRepository as any,
      plansRepository as any,
      mapper,
      googlePlaySubscriptionsService() as any,
    );

    await service.previewUsers([167, 167, 148], now);

    expect(plansRepository.find).toHaveBeenCalledTimes(2);
    expect(plansRepository.find).toHaveBeenNthCalledWith(1, {
      where: { user: { id: 167 } },
      order: { id: 'ASC' },
    });
    expect(plansRepository.find).toHaveBeenNthCalledWith(2, {
      where: { user: { id: 148 } },
      order: { id: 'ASC' },
    });
  });
});
