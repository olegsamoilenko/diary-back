import { SubscriptionBasePlanId } from './types';

export type SubscriptionPlanCatalogItem = {
  basePlanId: SubscriptionBasePlanId;
  name: string;
  creditsLimit: number;
  isPaid: boolean;
  durationDays?: number;
};

export const SUBSCRIPTION_PLAN_CATALOG: Record<
  SubscriptionBasePlanId,
  SubscriptionPlanCatalogItem
> = {
  [SubscriptionBasePlanId.TESTING]: {
    basePlanId: SubscriptionBasePlanId.TESTING,
    name: 'For testing',
    creditsLimit: 40000,
    isPaid: false,
  },
  [SubscriptionBasePlanId.START]: {
    basePlanId: SubscriptionBasePlanId.START,
    name: 'Start',
    creditsLimit: 5000,
    isPaid: false,
    durationDays: 7,
  },
  [SubscriptionBasePlanId.LITE_M1]: {
    basePlanId: SubscriptionBasePlanId.LITE_M1,
    name: 'Lite',
    creditsLimit: 40000,
    isPaid: true,
  },
  [SubscriptionBasePlanId.BASE_M1]: {
    basePlanId: SubscriptionBasePlanId.BASE_M1,
    name: 'Base',
    creditsLimit: 80000,
    isPaid: true,
  },
  [SubscriptionBasePlanId.PRO_M1]: {
    basePlanId: SubscriptionBasePlanId.PRO_M1,
    name: 'Pro',
    creditsLimit: 160000,
    isPaid: true,
  },
};

export const PAID_SUBSCRIPTION_BASE_PLAN_IDS = Object.values(
  SUBSCRIPTION_PLAN_CATALOG,
)
  .filter((plan) => plan.isPaid)
  .map((plan) => plan.basePlanId);

export function isPaidSubscriptionBasePlanId(
  basePlanId: string | null | undefined,
): basePlanId is SubscriptionBasePlanId {
  return PAID_SUBSCRIPTION_BASE_PLAN_IDS.includes(
    basePlanId as SubscriptionBasePlanId,
  );
}

export function getSubscriptionPlanCatalogItem(
  basePlanId: string | null | undefined,
) {
  if (!basePlanId) {
    return null;
  }

  return (
    SUBSCRIPTION_PLAN_CATALOG[basePlanId as SubscriptionBasePlanId] ?? null
  );
}
