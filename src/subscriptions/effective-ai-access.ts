import { UserPlanState } from './entities/user-plan-state.entity';
import { SubscriptionAccessReason, SubscriptionAccessStatus } from './types';
import {
  EffectiveAiAccessSource,
  PurchasedCreditsSummary,
} from 'src/credits/types';

export const MINIMUM_AI_REQUEST_CREDITS = 500;

export type EffectiveAiAccess = {
  status: SubscriptionAccessStatus;
  source: EffectiveAiAccessSource;
  reason: SubscriptionAccessReason;
  availableCredits: number;
  minimumRequiredCredits: number;
  planRemainingCredits: number;
  purchasedCreditsRemaining: number;
};

export function buildEffectiveAiAccess(
  subscription: UserPlanState | null,
  purchasedCredits: PurchasedCreditsSummary,
): EffectiveAiAccess {
  const subscriptionReason =
    (subscription?.metadata?.accessReason as SubscriptionAccessReason) ??
    SubscriptionAccessReason.PLAN_SELECTION_REQUIRED;
  const planRemainingCredits =
    subscription?.accessStatus === SubscriptionAccessStatus.ACTIVE
      ? Math.max(
          0,
          (subscription.creditsLimit ?? 0) - (subscription.usedCredits ?? 0),
        )
      : 0;
  const purchasedCreditsRemaining = Math.max(
    0,
    purchasedCredits.remaining ?? 0,
  );
  const purchasedCreditsDebt = Math.max(0, purchasedCredits.debt ?? 0);
  const availableCredits = Math.max(
    0,
    planRemainingCredits + purchasedCreditsRemaining - purchasedCreditsDebt,
  );
  const balances = {
    availableCredits,
    minimumRequiredCredits: MINIMUM_AI_REQUEST_CREDITS,
    planRemainingCredits,
    purchasedCreditsRemaining,
  };

  if (subscription?.accessStatus === SubscriptionAccessStatus.BLOCKED) {
    return {
      status: SubscriptionAccessStatus.BLOCKED,
      source: EffectiveAiAccessSource.NONE,
      reason: subscriptionReason,
      ...balances,
    };
  }

  if (availableCredits >= MINIMUM_AI_REQUEST_CREDITS) {
    return {
      status: SubscriptionAccessStatus.ACTIVE,
      source:
        planRemainingCredits > 0
          ? EffectiveAiAccessSource.SUBSCRIPTION
          : EffectiveAiAccessSource.PURCHASED_CREDITS,
      reason: SubscriptionAccessReason.NONE,
      ...balances,
    };
  }

  return {
    // The subscription may still be paid/active, but AI admission is unavailable.
    status: SubscriptionAccessStatus.LIMITED,
    source: EffectiveAiAccessSource.NONE,
    reason:
      availableCredits > 0 ||
      subscription?.accessStatus === SubscriptionAccessStatus.ACTIVE
        ? SubscriptionAccessReason.INSUFFICIENT_AI_CREDITS
        : subscriptionReason,
    ...balances,
  };
}
