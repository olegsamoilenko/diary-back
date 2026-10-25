import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { Plan } from '../plans/entities/plan.entity';
import { BasePlanIds, PlanStatus } from '../plans/types';
import { UserPlanState } from '../subscriptions/entities/user-plan-state.entity';
import { CreditWallet } from '../credits/entities/credit-wallet.entity';
import { SUBSCRIPTION_PLAN_CATALOG } from '../subscriptions/subscription-catalog';
import { SubscriptionLegacyMapper } from '../subscriptions/subscription-legacy.mapper';
import {
  canStoreSubscriptionGrantAccess,
  STORE_ACCESS_BILLING_STATUSES,
} from '../subscriptions/store-subscription-access';
import {
  SubscriptionAccessStatus,
  SubscriptionBasePlanId,
  SubscriptionSource,
} from '../subscriptions/types';
import { ADMIN_TIMEZONE } from './admin-user-statistics';

const paidPlans = Object.values(SUBSCRIPTION_PLAN_CATALOG).filter(
  (p) => p.isPaid,
);

/** One aggregate row; never load users, activities, purchases or plan histories. */
export function buildAdminUserOverviewQuery(
  users: Repository<User>,
  now: Date,
) {
  const mapper = new SubscriptionLegacyMapper();
  const legacyPaidStatuses = Object.values(PlanStatus).filter((planStatus) =>
    canStoreSubscriptionGrantAccess(
      mapper.deriveBillingStatus(
        {
          basePlanId: BasePlanIds.BASE_M1,
          planStatus,
          expiryTime: null,
        },
        now,
      ),
      null,
      now,
    ),
  );
  const today = `(CAST(:now AS timestamptz) AT TIME ZONE :zone)::date`;
  const currentPeriod = (alias: string) => `
    (${alias}.startTime IS NULL OR ${alias}.startTime <= CAST(:now AS timestamptz))
    AND (${alias}.expiryTime IS NULL OR ${alias}.expiryTime > CAST(:now AS timestamptz))`;
  const availableCredits = (alias: string) =>
    `(${alias}.creditsLimit <= 0 OR ${alias}.usedCredits < ${alias}.creditsLimit)`;
  const trial = `(
    (ups.id IS NOT NULL AND ups.basePlanId = :trialPlan
      AND ups.source IN (:...trialSources) AND ups.useWithoutSubscription = false
      AND ups.accessStatus <> :blocked
      AND COALESCE(ups.metadata->>'accessReason', '') <> 'ADMIN_DISABLED'
      AND ${currentPeriod('ups')} AND ${availableCredits('ups')})
    OR (ups.id IS NULL AND lp.basePlanId = :trialPlan
      AND u.usesWithoutSubscription = false AND lp.planStatus <> :tokenExceeded
      AND ${currentPeriod('lp')} AND ${availableCredits('lp')})
  )`;
  const paid = `(
    (ups.id IS NOT NULL AND ups.source IN (:...paidSources)
      AND ups.billingStatus IN (:...paidStatuses) AND ${currentPeriod('ups')})
    OR (ups.id IS NULL AND lp.planStatus IN (:...legacyPaidStatuses)
      AND ${currentPeriod('lp')})
  )`;
  const query = users.createQueryBuilder('u');
  const legacyId = query
    .subQuery()
    .select('p.id')
    .from(Plan, 'p')
    .where('p.userId = u.id AND p.actual = true')
    .orderBy('p.expiryTime', 'DESC', 'NULLS LAST')
    .addOrderBy('p.id', 'DESC')
    .limit(1);
  query
    .leftJoin(UserPlanState, 'ups', 'ups.userId = u.id')
    .leftJoin(Plan, 'lp', `ups.id IS NULL AND lp.id = ${legacyId.getQuery()}`)
    .leftJoin(CreditWallet, 'wallet', 'wallet.userId = u.id')
    .select('COUNT(*)', 'total')
    .addSelect(`COUNT(*) FILTER (WHERE ${trial})`, 'trial')
    .addSelect('COUNT(*) FILTER (WHERE wallet.balance > 0)', 'purchasedCredits')
    // lastActiveAt is timestamptz; createdAt is a UTC timestamp without timezone.
    .addSelect(
      `COUNT(*) FILTER (WHERE
      u.lastActiveAt >= ((${today} - 29)::timestamp AT TIME ZONE :zone)
      AND u.lastActiveAt <= CAST(:now AS timestamptz)
      AND (u.lastActiveAt AT TIME ZONE :zone)::date <>
        ((u.createdAt AT TIME ZONE 'UTC') AT TIME ZONE :zone)::date
    )`,
      'active',
    )
    .addSelect(`to_char(${today} - 29, 'YYYY-MM-DD')`, 'activeFrom')
    .addSelect(`to_char(${today}, 'YYYY-MM-DD')`, 'activeTo')
    .setParameters({
      now: now.toISOString(),
      zone: ADMIN_TIMEZONE,
      trialPlan: SubscriptionBasePlanId.START,
      trialSources: [SubscriptionSource.TRIAL, SubscriptionSource.MANUAL],
      paidSources: [
        SubscriptionSource.GOOGLE_PLAY,
        SubscriptionSource.APP_STORE,
        SubscriptionSource.MANUAL,
      ],
      paidStatuses: STORE_ACCESS_BILLING_STATUSES,
      legacyPaidStatuses,
      blocked: SubscriptionAccessStatus.BLOCKED,
      tokenExceeded: PlanStatus.TOKEN_EXCEEDED,
    });
  paidPlans.forEach((plan, index) => {
    query
      .addSelect(
        `COUNT(*) FILTER (WHERE ${paid} AND
      (CASE WHEN ups.id IS NOT NULL THEN ups.basePlanId ELSE lp.basePlanId END) = :plan${index})`,
        `plan${index}`,
      )
      .setParameter(`plan${index}`, plan.basePlanId);
  });
  return query;
}

export async function getAdminUserOverview(
  users: Repository<User>,
  now = new Date(),
) {
  const row = await buildAdminUserOverviewQuery(users, now).getRawOne<
    Record<string, string>
  >();
  if (!row) throw new Error('User statistics query returned no aggregate');
  const subscriptions = paidPlans.map((plan, index) => ({
    basePlanId: plan.basePlanId,
    name: plan.name,
    count: Number(row[`plan${index}`]),
  }));
  return {
    total: Number(row.total),
    trial: Number(row.trial),
    purchasedCredits: Number(row.purchasedCredits),
    active: Number(row.active),
    subscriptions,
    subscribed: subscriptions.reduce((sum, p) => sum + p.count, 0),
    activePeriod: {
      from: row.activeFrom,
      to: row.activeTo,
      days: 30,
      timezone: ADMIN_TIMEZONE,
    },
    calculatedAt: now.toISOString(),
  };
}
