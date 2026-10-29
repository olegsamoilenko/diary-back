import type { User } from './entities/user.entity';
import type { Plan } from '../plans/entities/plan.entity';

function pick<T extends object, K extends keyof T>(
  value: T,
  keys: readonly K[],
) {
  const result = {} as Pick<T, K>;
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(value, key))
      result[key] = value[key];
  }
  return result;
}

// Explicit response contracts: adding an entity column must not expose it in
// the admin tables/JSON viewer, nor expose credentials through nested relations.
export function toAdminPlan(plan: Plan | null | undefined) {
  return plan == null
    ? plan
    : pick(plan, [
        'id',
        'platform',
        'regionCode',
        'subscriptionId',
        'basePlanId',
        'name',
        'price',
        'currency',
        'lastOrderId',
        'creditsLimit',
        'usedCredits',
        'inputUsedCredits',
        'outputUsedCredits',
        'startTime',
        'expiryTime',
        'startPayment',
        'autoRenewEnabled',
        'userId',
        'planStatus',
        'actual',
        'usedTrial',
      ]);
}

export function toAdminStat<T extends { id: number; createdAt: Date }>(
  stat: T,
) {
  return pick(stat, ['id', 'createdAt']);
}

export function toAdminUser(user: User) {
  return {
    ...pick(user, [
      'id',
      'uuid',
      'name',
      'email',
      'phone',
      'role',
      'isRegistered',
      'isLogged',
      'usesWithoutSubscription',
      'subscriptionRuntime',
      'emailVerified',
      'oauthProvider',
      'regionCode',
      'acquisitionSource',
      'acquisitionMetaJson',
      'isSystem',
      'createdAt',
      'updatedAt',
      'lastActiveAt',
      'inactivityWarnedAt',
      'scheduledDeletionAt',
    ]),
    settings:
      user.settings == null
        ? user.settings
        : pick(user.settings, [
            'id',
            'lang',
            'locale',
            'theme',
            'font',
            'timeFormat',
            'dateFormat',
            'firstDayOfWeek',
            'conversationLanguage',
            'aiModel',
            'timezone',
            'appBuild',
            'appVersion',
            'platform',
            'model',
            'osVersion',
            'osBuildId',
            'onboardingVariant',
            'pushNotificationsEnabled',
          ]),
    payments: user.payments?.map((payment) =>
      pick(payment, [
        'id',
        'platform',
        'regionCode',
        'orderId',
        'amount',
        'currency',
        'developerRevenue',
        'taxAmount',
        'basePlanId',
        'productId',
        'packageName',
        'testPurchase',
        'orderState',
        'financialDetailsPending',
        'financialDetailsLastAttemptAt',
        'provider',
        'createdAt',
      ]),
    ),
    forumPublicProfile:
      user.forumPublicProfile == null
        ? user.forumPublicProfile
        : pick(user.forumPublicProfile, [
            'id',
            'userId',
            'displayName',
            'username',
            'avatarUrl',
            'bio',
            'isForumEnabled',
            'allowDirectMessages',
            'isBanned',
            'banReason',
            'createdAt',
            'updatedAt',
          ]),
    goalsStats: user.goalsStats?.map(toAdminStat),
  };
}
