import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { Plan } from 'src/plans/entities/plan.entity';
import { User } from 'src/users/entities/user.entity';
import {
  LegacyStoreSubscriptionDraft,
  LegacyUserPlanStateDraft,
  SubscriptionLegacyMapper,
} from '../subscription-legacy.mapper';
import { SubscriptionBillingStatus } from '../types';
import { GooglePlaySubscriptionsService } from 'src/iap/google-play-subscriptions.service';
import { PLANS, PAID_PLANS } from 'src/plans/constants';
import { Plans } from 'src/plans/types';

export type SubscriptionMigrationPreview = {
  userId: number;
  selectedLegacyPlanId: number | null;
  userPlanState: LegacyUserPlanStateDraft;
  storeSubscriptions: LegacyStoreSubscriptionDraft[];
  warnings: string[];
};

export type SubscriptionMigrationPreviewAllResult = {
  totalUsers: number;
  chunkSize: number;
  previews: SubscriptionMigrationPreview[];
};

@Injectable()
export class SubscriptionsLegacyDryRunService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Plan)
    private readonly plansRepository: Repository<Plan>,
    private readonly mapper: SubscriptionLegacyMapper,
    private readonly googlePlaySubscriptionsService: GooglePlaySubscriptionsService,
  ) {}

  async previewUser(
    userId: number,
    now = new Date(),
  ): Promise<SubscriptionMigrationPreview> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    const plans = await this.plansRepository.find({
      where: { user: { id: userId } },
      order: { id: 'ASC' },
    });

    const preview = await this.buildPreviewFromPlans(userId, plans, now);
    if (!user) {
      preview.warnings.unshift('USER_NOT_FOUND');
    }

    return preview;
  }

  async previewUsers(
    userIds: number[],
    now = new Date(),
  ): Promise<SubscriptionMigrationPreview[]> {
    const uniqueUserIds = [...new Set(userIds)];

    return Promise.all(
      uniqueUserIds.map((userId) => this.previewUser(userId, now)),
    );
  }

  async previewAllUsers(
    chunkSize = 100,
    now = new Date(),
  ): Promise<SubscriptionMigrationPreviewAllResult> {
    const normalizedChunkSize = this.normalizeChunkSize(chunkSize);
    const previews: SubscriptionMigrationPreview[] = [];
    let lastUserId = 0;

    while (true) {
      const users = await this.usersRepository.find({
        select: { id: true },
        where: { id: MoreThan(lastUserId) },
        order: { id: 'ASC' },
        take: normalizedChunkSize,
      });

      if (!users.length) {
        break;
      }

      for (const user of users) {
        previews.push(await this.previewUser(user.id, now));
      }

      lastUserId = users[users.length - 1].id;
    }

    return {
      totalUsers: previews.length,
      chunkSize: normalizedChunkSize,
      previews,
    };
  }

  async buildPreviewFromPlans(
    userId: number,
    plans: Plan[],
    now = new Date(),
  ): Promise<SubscriptionMigrationPreview> {
    const warnings: string[] = [];
    const candidatePlans = plans.filter(
      (plan) => plan.actual || !!plan.purchaseToken,
    );
    const actualPlans = candidatePlans.filter((plan) => plan.actual);

    if (actualPlans.length > 1) {
      warnings.push('MULTIPLE_ACTUAL_LEGACY_PLANS');
    }

    const verifiedTokenPlans = await this.verifyTokenPlans(
      candidatePlans,
      warnings,
    );
    const googleActivePlan = this.pickGoogleActivePlan(verifiedTokenPlans, now);
    const selectedPlan =
      googleActivePlan?.plan ?? this.pickActualPlan(actualPlans) ?? null;

    const selectedVerifiedPlan = googleActivePlan?.verifiedPlan ?? null;

    if (selectedPlan && googleActivePlan && !selectedPlan.actual) {
      warnings.push('SELECTED_GOOGLE_ACTIVE_NON_ACTUAL_PLAN');
    }

    if (!selectedPlan && plans.length === 0) {
      warnings.push('NO_LEGACY_PLANS_FOR_USER');
    }

    const statePlan =
      selectedVerifiedPlan ??
      selectedPlan ??
      null;

    if (
      actualPlans.length === 0 &&
      verifiedTokenPlans.some(
        ({ verifiedPlan }) =>
          verifiedPlan &&
          this.mapper.deriveBillingStatus(verifiedPlan, now) ===
            SubscriptionBillingStatus.ACTIVE,
      )
    ) {
      warnings.push('NO_ACTUAL_BUT_ACTIVE_PAID_PLAN_EXISTS');
    }

    const storeSubscriptions = verifiedTokenPlans
      .map(({ plan, verifiedPlan }) =>
        this.mapper.toStoreSubscriptionDraft(verifiedPlan ?? plan),
      )
      .filter((draft): draft is LegacyStoreSubscriptionDraft => !!draft);

    return {
      userId,
      selectedLegacyPlanId: selectedPlan?.id ?? null,
      userPlanState: this.mapper.toUserPlanStateDraft(
        userId,
        statePlan,
        { now },
      ),
      storeSubscriptions,
      warnings,
    };
  }

  private pickActualPlan(plans: Plan[]): Plan | null {
    if (!plans.length) {
      return null;
    }

    return this.pickLatestPlan(plans);
  }

  private pickLatestPlan(plans: Plan[]): Plan | null {
    if (!plans.length) {
      return null;
    }

    return [...plans].sort((a, b) => {
      const expiryDiff =
        this.dateTime(b.expiryTime) - this.dateTime(a.expiryTime);
      if (expiryDiff !== 0) {
        return expiryDiff;
      }

      return (b.id ?? 0) - (a.id ?? 0);
    })[0];
  }

  private async verifyTokenPlans(
    plans: Plan[],
    warnings: string[],
  ): Promise<Array<{ plan: Plan; verifiedPlan: Plan | null }>> {
    const tokenPlans = plans.filter((plan) => !!plan.purchaseToken);
    const packageName = this.getGooglePackageName();

    return Promise.all(
      tokenPlans.map(async (plan) => {
        try {
          const verified =
            await this.googlePlaySubscriptionsService.verifyAndroidSub(
              packageName,
              plan.purchaseToken!,
            );

          return {
            plan,
            verifiedPlan: this.mergeVerifiedPlan(plan, verified.planData),
          };
        } catch (error) {
          warnings.push(`GOOGLE_VERIFY_FAILED_PLAN_${plan.id}`);
          return { plan, verifiedPlan: null };
        }
      }),
    );
  }

  private pickGoogleActivePlan(
    plans: Array<{ plan: Plan; verifiedPlan: Plan | null }>,
    now: Date,
  ): { plan: Plan; verifiedPlan: Plan } | null {
    const activePlans = plans.filter(
      (item): item is { plan: Plan; verifiedPlan: Plan } =>
        !!item.verifiedPlan &&
        [
          SubscriptionBillingStatus.ACTIVE,
          SubscriptionBillingStatus.IN_GRACE,
        ].includes(this.mapper.deriveBillingStatus(item.verifiedPlan, now)),
    );

    if (!activePlans.length) {
      return null;
    }

    return [...activePlans].sort(
      (a, b) =>
        this.dateTime(b.verifiedPlan.expiryTime) -
        this.dateTime(a.verifiedPlan.expiryTime),
    )[0];
  }

  private mergeVerifiedPlan(plan: Plan, planData: Partial<Plan>): Plan {
    const basePlanConfig = planData.basePlanId
      ? PLANS[planData.basePlanId]
      : null;

    return {
      ...plan,
      ...planData,
      id: plan.id,
      userId: plan.userId,
      user: plan.user,
      payments: plan.payments,
      actual: plan.actual,
      usedTrial: plan.usedTrial,
      name:
        (basePlanConfig?.name as Plans | undefined) ??
        planData.name ??
        plan.name,
      creditsLimit: basePlanConfig?.creditsLimit ?? plan.creditsLimit,
      startPayment: plan.startPayment,
    };
  }

  private getGooglePackageName(): string {
    return (
      process.env.GOOGLE_PLAY_PACKAGE_NAME ||
      process.env.ANDROID_PACKAGE_NAME ||
      'com.soniac12.nemory'
    );
  }

  private dateTime(value: Date | string | null | undefined): number {
    if (!value) {
      return 0;
    }

    return new Date(value).getTime();
  }

  private normalizeChunkSize(chunkSize: number): number {
    if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
      return 100;
    }

    return Math.min(chunkSize, 500);
  }
}
