import { SubscriptionBillingStatus } from './types';

export const STORE_ACCESS_BILLING_STATUSES = [
  SubscriptionBillingStatus.ACTIVE,
  SubscriptionBillingStatus.IN_GRACE,
  SubscriptionBillingStatus.CANCELED,
] as const;

/** Shared paid-period rule; keep legacy subscriptions without an expiry compatible. */
export function canStoreSubscriptionGrantAccess(
  billingStatus: SubscriptionBillingStatus,
  expiryTime: Date | string | null,
  now = new Date(),
) {
  if (
    !STORE_ACCESS_BILLING_STATUSES.some((status) => status === billingStatus)
  ) {
    return false;
  }

  return !expiryTime || new Date(expiryTime).getTime() > now.getTime();
}
