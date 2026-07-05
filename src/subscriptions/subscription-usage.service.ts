import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { throwError } from 'src/common/utils';
import { HttpStatus } from 'src/common/utils/http-status';
import { PlansService } from 'src/plans/plans.service';
import { tokensToCredits } from 'src/plans/utils/tokensToCredits';
import { User } from 'src/users/entities/user.entity';
import { AiModel } from 'src/users/types';
import { UserPlanState } from './entities/user-plan-state.entity';
import { SubscriptionsService } from './subscriptions.service';
import {
  SubscriptionAccessReason,
  SubscriptionAccessStatus,
  SubscriptionRuntime,
} from './types';

@Injectable()
export class SubscriptionUsageService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly plansService: PlansService,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  async recordAiUsage(
    userId: number,
    aiModel: AiModel,
    inputTokens: number,
    outputTokens: number,
  ) {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
      select: { id: true, subscriptionRuntime: true },
    });

    if (!user) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'User not found',
        'User with this id does not exist.',
        'USER_NOT_FOUND',
      );
    }

    if (user.subscriptionRuntime !== SubscriptionRuntime.V2) {
      const { plan: legacyPlan } =
        await this.plansService.getActualByUserId(userId);

      if (!legacyPlan) {
        const { subscription } =
          await this.subscriptionsService.getCurrentUserSubscription(userId);

        if (subscription) {
          return this.recordV2Usage(userId, aiModel, inputTokens, outputTokens);
        }
      }

      const plan = await this.plansService.calculateCredits(
        userId,
        aiModel,
        inputTokens,
        outputTokens,
      );

      const subscription = await this.subscriptionsService.syncLegacyPlanToUserPlanState(
        userId,
        plan,
      );

      return {
        runtime: SubscriptionRuntime.LEGACY_COMPAT,
        plan,
        subscription,
      };
    }

    return this.recordV2Usage(userId, aiModel, inputTokens, outputTokens);
  }

  private async recordV2Usage(
    userId: number,
    aiModel: AiModel,
    inputTokens: number,
    outputTokens: number,
  ) {
    const { subscription: currentAccess } =
      await this.subscriptionsService.refreshEffectiveAccessState(userId);

    if (!currentAccess) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'Subscription state not found',
        'Subscription state must be initialized before recording usage.',
        'SUBSCRIPTION_STATE_NOT_INITIALIZED',
      );
    }

    if (currentAccess.accessStatus !== SubscriptionAccessStatus.ACTIVE) {
      this.throwLimitedAccess(currentAccess);
    }

    const credits = tokensToCredits(aiModel, inputTokens, outputTokens);

    return this.dataSource.transaction(async (manager) => {
      const existing = await manager.findOne(UserPlanState, {
        where: { userId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!existing) {
        throwError(
          HttpStatus.BAD_REQUEST,
          'Subscription state not found',
          'Subscription state must be initialized before recording usage.',
          'SUBSCRIPTION_STATE_NOT_INITIALIZED',
        );
      }

      const usedCredits = Math.round(
        existing.usedCredits +
          credits.inputUsedCredits +
          credits.outputUsedCredits,
      );
      const inputUsedCredits = Math.round(
        existing.inputUsedCredits + credits.inputUsedCredits,
      );
      const outputUsedCredits = Math.round(
        existing.outputUsedCredits + credits.outputUsedCredits,
      );
      const isCreditExceeded =
        existing.creditsLimit > 0 && usedCredits >= existing.creditsLimit;
      const metadata = {
        ...(existing.metadata ?? {}),
        accessReason: isCreditExceeded
          ? SubscriptionAccessReason.CREDIT_EXCEEDED
          : ((existing.metadata?.accessReason as SubscriptionAccessReason) ??
            SubscriptionAccessReason.NONE),
        lastUsageSyncAt: new Date().toISOString(),
      };
      const saved = await manager.save(
        UserPlanState,
        manager.merge(UserPlanState, existing, {
          usedCredits,
          inputUsedCredits,
          outputUsedCredits,
          accessStatus: isCreditExceeded
            ? SubscriptionAccessStatus.LIMITED
            : existing.accessStatus,
          metadata,
        }),
      );

      return {
        runtime: SubscriptionRuntime.V2,
        subscription: saved,
      };
    });
  }

  private throwLimitedAccess(subscription: UserPlanState): never {
    const reason =
      (subscription.metadata?.accessReason as SubscriptionAccessReason) ??
      SubscriptionAccessReason.UNKNOWN;

    if (reason === SubscriptionAccessReason.CREDIT_EXCEEDED) {
      throwError(
        HttpStatus.CREDIT_LIMIT_EXCEEDED,
        'Credit Limit Exceeded',
        'Credit limit exceeded. Please upgrade your plan to continue using the service',
        'CREDIT_LIMIT_EXCEEDED',
        { basePlanId: subscription.basePlanId },
      );
    }

    if (reason === SubscriptionAccessReason.TRIAL_EXPIRED) {
      throwError(
        HttpStatus.TRIAL_PLAN_HAS_EXPIRED,
        'Trial period has expired',
        'Your trial period has expired. Please subscribe to a plan',
        'TRIAL_PERIOD_HAS_EXPIRED',
        { basePlanId: subscription.basePlanId },
      );
    }

    if (reason === SubscriptionAccessReason.SUBSCRIPTION_CANCELED) {
      throwError(
        HttpStatus.PLAN_WAS_CANCELED,
        'Subscription was canceled',
        'Your subscription was canceled. Please subscribe to a plan',
        'SUBSCRIPTION_WAS_CANCELED',
        { basePlanId: subscription.basePlanId },
      );
    }

    if (reason === SubscriptionAccessReason.SUBSCRIPTION_REFUNDED) {
      throwError(
        HttpStatus.PLAN_REFUNDED,
        'Subscription was refunded',
        'Your subscription was refunded.',
        'SUBSCRIPTION_REFUNDED',
        { basePlanId: subscription.basePlanId },
      );
    }

    if (reason === SubscriptionAccessReason.BILLING_PAUSED) {
      throwError(
        HttpStatus.PLAN_PAUSED,
        'Subscription paused',
        'Your subscription is paused. Please renew your subscription.',
        'SUBSCRIPTION_PAUSED',
        { basePlanId: subscription.basePlanId },
      );
    }

    if (reason === SubscriptionAccessReason.BILLING_ON_HOLD) {
      throwError(
        HttpStatus.PLAN_ON_HOLD,
        'Subscription on hold',
        'Your subscription is on hold. Please renew your subscription',
        'SUBSCRIPTION_ON_HOLD',
        { basePlanId: subscription.basePlanId },
      );
    }

    throwError(
      HttpStatus.PLAN_HAS_EXPIRED,
      'Subscription has expired',
      'Your subscription has expired. Please renew your subscription',
      'SUBSCRIPTION_HAS_EXPIRED',
      { basePlanId: subscription.basePlanId },
    );
  }
}
