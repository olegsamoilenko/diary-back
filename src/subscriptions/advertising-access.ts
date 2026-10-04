import type { UserPlanState } from './entities/user-plan-state.entity';
import { getSubscriptionPlanCatalogItem } from './subscription-catalog';
import { canStoreSubscriptionGrantAccess } from './store-subscription-access';
import {
  SubscriptionAccessReason,
  SubscriptionAccessStatus,
  SubscriptionBasePlanId,
  SubscriptionBillingStatus,
  SubscriptionSource,
} from './types';

export type AdvertisingAccess = {
  status: 'AD_FREE' | 'AD_SUPPORTED' | 'UNKNOWN';
  reason:
    | 'PAID_SUBSCRIPTION'
    | 'TRIAL'
    | 'TESTING'
    | 'NO_SUBSCRIPTION'
    | 'EXPIRED'
    | 'BILLING_INACTIVE'
    | 'UNVERIFIED';
  validUntil: string | null;
};

type AdvertisingSubscription = Pick<
  UserPlanState,
  | 'source'
  | 'basePlanId'
  | 'billingStatus'
  | 'accessStatus'
  | 'startTime'
  | 'expiryTime'
  | 'metadata'
>;

/** Entitlement only: AD_SUPPORTED still needs placement, rollout and consent checks. */
export function buildAdvertisingAccess(
  subscription: AdvertisingSubscription | null,
  now = new Date(),
): AdvertisingAccess {
  const unknown: AdvertisingAccess = {
    status: 'UNKNOWN',
    reason: 'UNVERIFIED',
    validUntil: null,
  };
  if (
    !subscription ||
    subscription.accessStatus === SubscriptionAccessStatus.BLOCKED ||
    subscription.metadata?.accessReason ===
      SubscriptionAccessReason.ADMIN_DISABLED
  ) {
    return unknown;
  }

  const { source, basePlanId, billingStatus, startTime, expiryTime } =
    subscription;
  if (source === SubscriptionSource.NONE) {
    return basePlanId === null &&
      billingStatus === SubscriptionBillingStatus.NONE
      ? { status: 'AD_SUPPORTED', reason: 'NO_SUBSCRIPTION', validUntil: null }
      : unknown;
  }

  const plan = getSubscriptionPlanCatalogItem(basePlanId);
  if (!plan) return unknown;

  const expiresAt = expiryTime ? new Date(expiryTime).getTime() : null;
  const startsAt = startTime ? new Date(startTime).getTime() : null;
  if (
    (expiresAt !== null && !Number.isFinite(expiresAt)) ||
    (startsAt !== null &&
      (!Number.isFinite(startsAt) || startsAt > now.getTime()))
  ) {
    return unknown;
  }

  const validUntil =
    expiresAt === null ? null : new Date(expiresAt).toISOString();
  const expired = expiresAt !== null && expiresAt <= now.getTime();
  if (plan.isPaid) {
    if (
      source !== SubscriptionSource.GOOGLE_PLAY &&
      source !== SubscriptionSource.APP_STORE &&
      source !== SubscriptionSource.MANUAL
    ) {
      return unknown;
    }
    if (
      billingStatus === SubscriptionBillingStatus.UNKNOWN ||
      billingStatus === SubscriptionBillingStatus.PENDING ||
      billingStatus === SubscriptionBillingStatus.NONE
    ) {
      return unknown;
    }
    if (canStoreSubscriptionGrantAccess(billingStatus, expiryTime, now)) {
      return { status: 'AD_FREE', reason: 'PAID_SUBSCRIPTION', validUntil };
    }
    // Store notifications can arrive after the previously recorded period ends.
    // ACTIVE/IN_GRACE with an elapsed date is not a confirmed termination.
    // Withhold ads until the store supplies renewal or a definitive billing state;
    // this does not extend AI access or grant credits.
    if (
      expired &&
      (source === SubscriptionSource.GOOGLE_PLAY ||
        source === SubscriptionSource.APP_STORE) &&
      (billingStatus === SubscriptionBillingStatus.ACTIVE ||
        billingStatus === SubscriptionBillingStatus.IN_GRACE)
    ) {
      return unknown;
    }
    if (
      ![
        SubscriptionBillingStatus.ACTIVE,
        SubscriptionBillingStatus.IN_GRACE,
        SubscriptionBillingStatus.CANCELED,
        SubscriptionBillingStatus.EXPIRED,
        SubscriptionBillingStatus.REFUNDED,
        SubscriptionBillingStatus.ON_HOLD,
        SubscriptionBillingStatus.PAUSED,
      ].includes(billingStatus)
    ) {
      return unknown;
    }
    return {
      status: 'AD_SUPPORTED',
      reason: expired ? 'EXPIRED' : 'BILLING_INACTIVE',
      validUntil: null,
    };
  }

  if (
    (source !== SubscriptionSource.TRIAL &&
      source !== SubscriptionSource.MANUAL) ||
    billingStatus !== SubscriptionBillingStatus.NONE
  ) {
    return unknown;
  }
  if (expired) {
    return { status: 'AD_SUPPORTED', reason: 'EXPIRED', validUntil: null };
  }
  if (basePlanId === SubscriptionBasePlanId.TESTING) {
    return { status: 'AD_FREE', reason: 'TESTING', validUntil };
  }
  if (basePlanId === SubscriptionBasePlanId.START && expiresAt !== null) {
    return { status: 'AD_FREE', reason: 'TRIAL', validUntil };
  }
  return unknown;
}
