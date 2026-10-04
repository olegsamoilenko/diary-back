import { Injectable, Optional } from '@nestjs/common';
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
import { CreditWalletService } from 'src/credits/credit-wallet.service';
import { AiCreditCycleService } from './ai-credit-cycle.service';

@Injectable()
export class SubscriptionUsageService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly plansService: PlansService,
    private readonly subscriptionsService: SubscriptionsService,
    @Optional()
    private readonly creditWalletService?: CreditWalletService,
    @Optional()
    private readonly aiCreditCycleService?: AiCreditCycleService,
  ) {}

  private async resolveAiPlan(userId: number) {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
      select: { id: true, subscriptionRuntime: true },
    });
    if (!user)
      throwError(
        HttpStatus.BAD_REQUEST,
        'User not found',
        'User with this id does not exist.',
        'USER_NOT_FOUND',
      );
    const legacy =
      user.subscriptionRuntime !== SubscriptionRuntime.V2
        ? (await this.plansService.getActualByUserId(userId)).plan
        : null;
    return {
      legacy,
      access: legacy
        ? null
        : await this.subscriptionsService.refreshEffectiveAccessState(userId),
    };
  }

  /** Same runtime/plan precedence as affordability; never trust a client tier. */
  async getEffectiveAiBasePlanId(userId: number): Promise<string | null> {
    const { legacy, access } = await this.resolveAiPlan(userId);
    if (legacy) return legacy.basePlanId;
    const subscription = access?.subscription;
    const reason = subscription?.metadata?.accessReason;
    // An expired/refunded selection can retain its old tier while wallet access
    // stays active. Exhausting credits within a valid period keeps that tier.
    if (
      subscription?.useWithoutSubscription ||
      subscription?.accessStatus === SubscriptionAccessStatus.BLOCKED ||
      (subscription?.accessStatus === SubscriptionAccessStatus.LIMITED &&
        reason !== SubscriptionAccessReason.CREDIT_EXCEEDED &&
        reason !== SubscriptionAccessReason.TOKEN_EXCEEDED)
    )
      return null;
    return subscription?.basePlanId ?? null;
  }

  /** Request-specific admission; actual usage is still charged by recordAiUsage. */
  async assertRequestAffordable(
    userId: number,
    estimatedCredits: number,
  ): Promise<void> {
    if (!Number.isFinite(estimatedCredits) || estimatedCredits < 0)
      throw new Error('INVALID_AI_COST_ESTIMATE');
    const { legacy, access } = await this.resolveAiPlan(userId);
    let availableCredits: number;
    let planRemainingCredits = 0;
    let purchasedCreditsRemaining = 0;
    let basePlanId: string | null = null;
    if (legacy) {
      availableCredits = planRemainingCredits = Math.max(
        0,
        legacy.creditsLimit - legacy.usedCredits,
      );
      basePlanId = legacy.basePlanId;
    } else if (access) {
      if (
        access.aiAccess?.status === SubscriptionAccessStatus.BLOCKED ||
        access.subscription?.accessStatus === SubscriptionAccessStatus.BLOCKED
      ) {
        if (access.subscription) this.throwLimitedAccess(access.subscription);
        throwError(
          HttpStatus.PLAN_IS_INACTIVE,
          'AI access blocked',
          'AI access is blocked.',
          'SUBSCRIPTION_ACCESS_BLOCKED',
        );
      }
      availableCredits = access.aiAccess?.availableCredits ?? 0;
      planRemainingCredits = access.aiAccess?.planRemainingCredits ?? 0;
      purchasedCreditsRemaining =
        access.aiAccess?.purchasedCreditsRemaining ?? 0;
      basePlanId = access.subscription?.basePlanId ?? null;
    } else {
      throw new Error('AI_PLAN_RESOLUTION_FAILED');
    }
    // The guard already applies the start threshold. A costly request cannot
    // bypass this check by reusing an authorized cycle ID.
    // Do not charge the start reserve a second time: earlier context stages in
    // the same authorized cycle may already have consumed part of the balance.
    const minimumRequiredCredits = Math.ceil(estimatedCredits);
    if (availableCredits < minimumRequiredCredits) {
      throwError(
        HttpStatus.INSUFFICIENT_AI_CREDITS,
        'Insufficient AI credits',
        'insufficientAiCreditsForRequest',
        'INSUFFICIENT_AI_CREDITS',
        {
          minimumRequiredCredits,
          availableCredits,
          planRemainingCredits,
          purchasedCreditsRemaining,
          basePlanId,
          approximate: true,
        },
      );
    }
  }

  async recordAiUsage(
    userId: number,
    aiModel: AiModel,
    inputTokens: number,
    outputTokens: number,
    cachedInputTokens: number = 0,
    cacheWriteInputTokens: number = 0,
    cycleId?: string,
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
          return this.recordV2Usage(
            userId,
            aiModel,
            inputTokens,
            outputTokens,
            cachedInputTokens,
            cacheWriteInputTokens,
            cycleId,
          );
        }
      }

      const plan =
        cachedInputTokens > 0 || cacheWriteInputTokens > 0
          ? await this.plansService.calculateCredits(
              userId,
              aiModel,
              inputTokens,
              outputTokens,
              cachedInputTokens,
              cacheWriteInputTokens,
            )
          : await this.plansService.calculateCredits(
              userId,
              aiModel,
              inputTokens,
              outputTokens,
            );

      const subscription =
        await this.subscriptionsService.syncLegacyPlanToUserPlanState(
          userId,
          plan,
        );

      return {
        runtime: SubscriptionRuntime.LEGACY_COMPAT,
        plan,
        subscription,
      };
    }

    return this.recordV2Usage(
      userId,
      aiModel,
      inputTokens,
      outputTokens,
      cachedInputTokens,
      cacheWriteInputTokens,
      cycleId,
    );
  }

  private async recordV2Usage(
    userId: number,
    aiModel: AiModel,
    inputTokens: number,
    outputTokens: number,
    cachedInputTokens: number = 0,
    cacheWriteInputTokens: number = 0,
    cycleId?: string,
  ) {
    const access =
      await this.subscriptionsService.refreshEffectiveAccessState(userId);
    const currentAccess = access.subscription;

    if (!currentAccess) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'Subscription state not found',
        'Subscription state must be initialized before recording usage.',
        'SUBSCRIPTION_STATE_NOT_INITIALIZED',
      );
    }

    const isAuthorizedCycle =
      !!cycleId &&
      !!this.aiCreditCycleService &&
      (await this.aiCreditCycleService.isAuthorized(userId, cycleId));
    const canCompleteAuthorizedCycle =
      isAuthorizedCycle &&
      this.canCompleteAuthorizedCycle(access, currentAccess);

    if (
      currentAccess.accessStatus !== SubscriptionAccessStatus.ACTIVE &&
      access.aiAccess?.status !== SubscriptionAccessStatus.ACTIVE &&
      !canCompleteAuthorizedCycle
    ) {
      this.throwLimitedAccess(currentAccess);
    }

    const credits = tokensToCredits(
      aiModel,
      inputTokens,
      outputTokens,
      cachedInputTokens,
      cacheWriteInputTokens,
    );

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

      const requestedCredits = Math.round(
        credits.inputUsedCredits + credits.outputUsedCredits,
      );
      const planAvailable =
        existing.accessStatus === SubscriptionAccessStatus.ACTIVE &&
        existing.creditsLimit > 0
          ? Math.max(0, existing.creditsLimit - existing.usedCredits)
          : 0;
      const planChargedCredits = Math.min(requestedCredits, planAvailable);
      const planInputChargedCredits = Math.min(
        credits.inputUsedCredits,
        planChargedCredits,
      );
      const planOutputChargedCredits = Math.max(
        0,
        planChargedCredits - planInputChargedCredits,
      );
      const walletRequestedCredits = Math.max(
        0,
        requestedCredits - planChargedCredits,
      );
      const walletCharge = this.creditWalletService
        ? await this.creditWalletService.debitWithManager(
            manager,
            userId,
            walletRequestedCredits,
            {
              aiModel,
              requestedCredits,
              planChargedCredits,
              inputTokens,
              outputTokens,
              cachedInputTokens,
              cacheWriteInputTokens,
              cycleId: cycleId ?? null,
            },
            { allowDebt: canCompleteAuthorizedCycle },
          )
        : {
            chargedCredits: 0,
            summary: {
              total: 0,
              used: 0,
              remaining: 0,
              debt: 0,
              revoked: 0,
            },
          };
      const usedCredits = Math.round(existing.usedCredits + planChargedCredits);
      const inputUsedCredits = Math.round(
        existing.inputUsedCredits + planInputChargedCredits,
      );
      const outputUsedCredits = Math.round(
        existing.outputUsedCredits + planOutputChargedCredits,
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
        ...(this.creditWalletService
          ? {
              purchasedCredits: walletCharge.summary,
              chargedCredits: {
                total: planChargedCredits + walletCharge.chargedCredits,
                subscription: planChargedCredits,
                purchased: walletCharge.chargedCredits,
              },
            }
          : {}),
      };
    });
  }

  private canCompleteAuthorizedCycle(
    access: Awaited<
      ReturnType<SubscriptionsService['refreshEffectiveAccessState']>
    >,
    subscription: UserPlanState,
  ): boolean {
    if (
      access.aiAccess?.status === SubscriptionAccessStatus.BLOCKED ||
      subscription.accessStatus === SubscriptionAccessStatus.BLOCKED
    ) {
      return false;
    }

    const reason =
      access.aiAccess?.reason ??
      (subscription.metadata?.accessReason as SubscriptionAccessReason) ??
      SubscriptionAccessReason.UNKNOWN;

    return (
      reason === SubscriptionAccessReason.NONE ||
      reason === SubscriptionAccessReason.INSUFFICIENT_AI_CREDITS ||
      reason === SubscriptionAccessReason.CREDIT_EXCEEDED ||
      reason === SubscriptionAccessReason.TOKEN_EXCEEDED ||
      reason === SubscriptionAccessReason.PLAN_SELECTION_REQUIRED
    );
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
