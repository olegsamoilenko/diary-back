import { Injectable } from '@nestjs/common';
import { Plan } from 'src/plans/entities/plan.entity';
import { PlanStatus } from 'src/plans/types';
import { isPaidSubscriptionBasePlanId } from './subscription-catalog';
import {
  SubscriptionBasePlanId,
  SubscriptionProductId,
  SubscriptionAccessReason,
  StoreSubscriptionProvider,
  SubscriptionAccessStatus,
  SubscriptionBillingStatus,
  SubscriptionSource,
} from './types';

export type LegacyUserPlanStateDraft = {
  userId: number;
  source: SubscriptionSource;
  basePlanId: SubscriptionBasePlanId | null;
  name: string;
  price: number;
  currency: string | null;
  billingStatus: SubscriptionBillingStatus;
  accessStatus: SubscriptionAccessStatus;
  startTime: Date | string | null;
  expiryTime: Date | string | null;
  creditsLimit: number;
  usedCredits: number;
  inputUsedCredits: number;
  outputUsedCredits: number;
  useWithoutSubscription: boolean;
  currentStoreSubscriptionId: number | null;
  legacyPlanId: number | null;
  metadata: Record<string, unknown> | null;
};

export type LegacyStoreSubscriptionDraft = {
  userId: number | null;
  provider: StoreSubscriptionProvider;
  platform: Plan['platform'];
  regionCode: string | null;
  productId: SubscriptionProductId | null;
  basePlanId: SubscriptionBasePlanId;
  purchaseToken: string;
  linkedPurchaseToken: string | null;
  lastOrderId: string | null;
  storeStatus: SubscriptionBillingStatus;
  startTime: Date | string | null;
  expiryTime: Date | string | null;
  autoRenewEnabled: boolean | null;
  price: number;
  currency: string | null;
  rawStoreData: Record<string, unknown> | null;
  legacyPlanId: number | null;
};

@Injectable()
export class SubscriptionLegacyMapper {
  isPaidPlan(plan: Pick<Plan, 'basePlanId'>): boolean {
    return isPaidSubscriptionBasePlanId(plan.basePlanId);
  }

  toUserPlanStateDraft(
    userId: number,
    plan: Plan | null,
    options?: {
      now?: Date;
      useWithoutSubscription?: boolean;
      currentStoreSubscriptionId?: number | null;
    },
  ): LegacyUserPlanStateDraft {
    const now = options?.now ?? new Date();

    if (!plan) {
      return {
        userId,
        source: SubscriptionSource.NONE,
        basePlanId: null,
        name: 'None',
        price: 0,
        currency: null,
        billingStatus: SubscriptionBillingStatus.NONE,
        accessStatus: SubscriptionAccessStatus.LIMITED,
        startTime: null,
        expiryTime: null,
        creditsLimit: 0,
        usedCredits: 0,
        inputUsedCredits: 0,
        outputUsedCredits: 0,
        useWithoutSubscription: options?.useWithoutSubscription ?? true,
        currentStoreSubscriptionId: null,
        legacyPlanId: null,
        metadata: {
          legacyReason: 'NO_PLAN',
          accessReason: SubscriptionAccessReason.USE_WITHOUT_SUBSCRIPTION,
        },
      };
    }

    const isPaid = this.isPaidPlan(plan);
    const billingStatus = this.deriveBillingStatus(plan, now);
    const accessReason = this.deriveAccessReason(plan, billingStatus, now);

    return {
      userId,
      source: isPaid ? SubscriptionSource.GOOGLE_PLAY : SubscriptionSource.TRIAL,
      basePlanId: plan.basePlanId as unknown as SubscriptionBasePlanId,
      name: plan.name ?? 'None',
      price: Number(plan.price ?? 0),
      currency: plan.currency ?? null,
      billingStatus,
      accessStatus: this.deriveAccessStatus(plan, billingStatus, now),
      startTime: plan.startTime ?? null,
      expiryTime: plan.expiryTime ?? null,
      creditsLimit: plan.creditsLimit ?? 0,
      usedCredits: plan.usedCredits ?? 0,
      inputUsedCredits: plan.inputUsedCredits ?? 0,
      outputUsedCredits: plan.outputUsedCredits ?? 0,
      useWithoutSubscription: options?.useWithoutSubscription ?? false,
      currentStoreSubscriptionId: options?.currentStoreSubscriptionId ?? null,
      legacyPlanId: plan.id ?? null,
      metadata: {
        legacyActual: plan.actual,
        legacyPlanStatus: plan.planStatus,
        accessReason,
      },
    };
  }

  toStoreSubscriptionDraft(plan: Plan): LegacyStoreSubscriptionDraft | null {
    if (!this.isPaidPlan(plan) || !plan.purchaseToken) {
      return null;
    }

    return {
      userId: plan.userId ?? null,
      provider: StoreSubscriptionProvider.GOOGLE_PLAY,
      platform: plan.platform,
      regionCode: plan.regionCode ?? null,
      productId:
        (plan.subscriptionId as unknown as SubscriptionProductId | null) ??
        null,
      basePlanId: plan.basePlanId as unknown as SubscriptionBasePlanId,
      purchaseToken: plan.purchaseToken,
      linkedPurchaseToken: plan.linkedPurchaseToken ?? null,
      lastOrderId: plan.lastOrderId ?? null,
      storeStatus: this.deriveBillingStatus(plan, new Date()),
      startTime: plan.startTime ?? null,
      expiryTime: plan.expiryTime ?? null,
      autoRenewEnabled: plan.autoRenewEnabled ?? null,
      price: Number(plan.price ?? 0),
      currency: plan.currency ?? null,
      rawStoreData: null,
      legacyPlanId: plan.id ?? null,
    };
  }

  deriveBillingStatus(
    plan: Pick<Plan, 'basePlanId' | 'planStatus' | 'expiryTime'>,
    now = new Date(),
  ): SubscriptionBillingStatus {
    if (!isPaidSubscriptionBasePlanId(plan.basePlanId)) {
      return SubscriptionBillingStatus.NONE;
    }

    if (
      plan.planStatus === PlanStatus.CREDIT_EXCEEDED ||
      plan.planStatus === PlanStatus.TOKEN_EXCEEDED
    ) {
      return SubscriptionBillingStatus.ACTIVE;
    }

    const statusMap: Partial<Record<PlanStatus, SubscriptionBillingStatus>> = {
      [PlanStatus.ACTIVE]: SubscriptionBillingStatus.ACTIVE,
      [PlanStatus.IN_GRACE]: SubscriptionBillingStatus.IN_GRACE,
      [PlanStatus.ON_HOLD]: SubscriptionBillingStatus.ON_HOLD,
      [PlanStatus.PAUSED]: SubscriptionBillingStatus.PAUSED,
      [PlanStatus.CANCELED]: SubscriptionBillingStatus.CANCELED,
      [PlanStatus.EXPIRED]: SubscriptionBillingStatus.EXPIRED,
      [PlanStatus.REFUNDED]: SubscriptionBillingStatus.REFUNDED,
      [PlanStatus.PENDING]: SubscriptionBillingStatus.PENDING,
    };

    const mappedStatus =
      statusMap[plan.planStatus] ?? SubscriptionBillingStatus.UNKNOWN;

    if (
      this.isExpired(plan.expiryTime, now) &&
      mappedStatus !== SubscriptionBillingStatus.CANCELED
    ) {
      return SubscriptionBillingStatus.EXPIRED;
    }

    return mappedStatus;
  }

  deriveAccessStatus(
    plan: Pick<
      Plan,
      'basePlanId' | 'planStatus' | 'expiryTime' | 'creditsLimit' | 'usedCredits'
    >,
    billingStatus = this.deriveBillingStatus(plan),
    now = new Date(),
  ): SubscriptionAccessStatus {
    return this.deriveAccessReason(plan, billingStatus, now) ===
      SubscriptionAccessReason.NONE
      ? SubscriptionAccessStatus.ACTIVE
      : SubscriptionAccessStatus.LIMITED;
  }

  deriveAccessReason(
    plan: Pick<
      Plan,
      'basePlanId' | 'planStatus' | 'expiryTime' | 'creditsLimit' | 'usedCredits'
    >,
    billingStatus = this.deriveBillingStatus(plan),
    now = new Date(),
  ): SubscriptionAccessReason {
    const isPaid = isPaidSubscriptionBasePlanId(plan.basePlanId);

    if (!isPaid) {
      if (this.isExpired(plan.expiryTime, now)) {
        return SubscriptionAccessReason.TRIAL_EXPIRED;
      }

      if (this.isCreditExceeded(plan)) {
        return SubscriptionAccessReason.CREDIT_EXCEEDED;
      }

      if (plan.planStatus === PlanStatus.TOKEN_EXCEEDED) {
        return SubscriptionAccessReason.TOKEN_EXCEEDED;
      }

      return SubscriptionAccessReason.NONE;
    }

    if (
      billingStatus !== SubscriptionBillingStatus.ACTIVE &&
      billingStatus !== SubscriptionBillingStatus.IN_GRACE &&
      billingStatus !== SubscriptionBillingStatus.CANCELED
    ) {
      if (billingStatus === SubscriptionBillingStatus.PENDING) {
        return SubscriptionAccessReason.BILLING_PENDING;
      }

      if (billingStatus === SubscriptionBillingStatus.ON_HOLD) {
        return SubscriptionAccessReason.BILLING_ON_HOLD;
      }

      if (billingStatus === SubscriptionBillingStatus.PAUSED) {
        return SubscriptionAccessReason.BILLING_PAUSED;
      }

      if (billingStatus === SubscriptionBillingStatus.REFUNDED) {
        return SubscriptionAccessReason.SUBSCRIPTION_REFUNDED;
      }

      return SubscriptionAccessReason.SUBSCRIPTION_EXPIRED;
    }

    if (
      billingStatus === SubscriptionBillingStatus.CANCELED &&
      this.isExpired(plan.expiryTime, now)
    ) {
      return SubscriptionAccessReason.SUBSCRIPTION_CANCELED;
    }

    if (plan.planStatus === PlanStatus.TOKEN_EXCEEDED) {
      return SubscriptionAccessReason.TOKEN_EXCEEDED;
    }

    if (
      plan.planStatus === PlanStatus.CREDIT_EXCEEDED ||
      this.isCreditExceeded(plan)
    ) {
      return SubscriptionAccessReason.CREDIT_EXCEEDED;
    }

    return SubscriptionAccessReason.NONE;
  }

  isExpired(expiryTime: Date | string | null | undefined, now = new Date()) {
    if (!expiryTime) {
      return false;
    }

    return new Date(expiryTime).getTime() <= now.getTime();
  }

  isCreditExceeded(
    plan: Pick<Plan, 'creditsLimit' | 'usedCredits'>,
  ): boolean {
    return plan.creditsLimit > 0 && plan.usedCredits >= plan.creditsLimit;
  }
}
