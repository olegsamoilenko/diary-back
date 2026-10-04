import type { UserPlanState } from './entities/user-plan-state.entity';
import type { VerifiedGooglePlaySubscription } from 'src/iap/google-play-subscriptions.service';

/** Reissuing a token for a scheduled downgrade must not refill the current month. */
export function preservesDeferredCreditCycle(
  state: Pick<UserPlanState, 'basePlanId' | 'expiryTime'> | null,
  incoming: VerifiedGooglePlaySubscription['storeData'],
) {
  return !!(
    incoming.deferredReplacementProductId &&
    state?.basePlanId === incoming.basePlanId &&
    state.expiryTime &&
    new Date(state.expiryTime).getTime() ===
      new Date(incoming.expiryTime).getTime()
  );
}
