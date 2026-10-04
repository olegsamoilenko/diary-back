import { SubscriptionBillingStatus } from './types';

/** Shared paid-period rule; keep legacy subscriptions without an expiry compatible. */
export function canStoreSubscriptionGrantAccess(
  billingStatus: SubscriptionBillingStatus,
  expiryTime: Date | string | null,
  now = new Date(),
) {
  if (
    billingStatus !== SubscriptionBillingStatus.ACTIVE &&
    billingStatus !== SubscriptionBillingStatus.IN_GRACE &&
    billingStatus !== SubscriptionBillingStatus.CANCELED
  ) {
    return false;
  }

  return !expiryTime || new Date(expiryTime).getTime() > now.getTime();
}
