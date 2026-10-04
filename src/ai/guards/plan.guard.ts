import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Optional,
  SetMetadata,
} from '@nestjs/common';
import { UsersService } from 'src/users/users.service';
import { throwError } from '../../common/utils';
import { User } from 'src/users/entities/user.entity';
import { HttpStatus } from 'src/common/utils/http-status';
import { BasePlanIds, Plans, PlanStatus } from 'src/plans/types';
import { AuthenticatedRequest } from 'src/auth/types/';
import { AuthenticatedSocket } from '../types';
import { JwtPayload } from 'src/auth/types';
import { PlansService } from 'src/plans/plans.service';
import { PlanGateway } from 'src/ai/gateway/plan.gateway';
import { SubscriptionsService } from 'src/subscriptions/subscriptions.service';
import {
  SubscriptionAccessReason,
  SubscriptionAccessStatus,
  SubscriptionRuntime,
} from 'src/subscriptions/types';
import { MINIMUM_AI_REQUEST_CREDITS } from 'src/subscriptions/effective-ai-access';
import { AiCreditCycleService } from 'src/subscriptions/ai-credit-cycle.service';

const AI_CREDIT_CYCLE_ID_FIELD = 'ai:credit-cycle-id-field';
const EMBEDDING_INDEX_ROUTE = 'ai:embedding-index-route';
/** Only the embedding endpoint may admit a standalone, low-cost index request. */
export const EmbeddingIndexRoute = () =>
  SetMetadata(EMBEDDING_INDEX_ROUTE, true);
/** Use a domain request ID as the existing credit-cycle ID on explicitly marked routes. */
export const AiCreditCycleId = (field: string) =>
  SetMetadata(AI_CREDIT_CYCLE_ID_FIELD, field);

@Injectable()
export class PlanGuard implements CanActivate {
  constructor(
    private readonly usersService: UsersService,
    private readonly plansService: PlansService,
    private readonly planGateway: PlanGateway,
    private readonly subscriptionsService?: SubscriptionsService,
    @Optional()
    private readonly aiCreditCycleService?: AiCreditCycleService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    let userId: number | undefined;
    if (context.getType() === 'ws') {
      const client = context.switchToWs().getClient<AuthenticatedSocket>();
      userId = (client.user as JwtPayload).id;
    } else {
      const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
      userId = req.user?.id;
    }

    if (!userId) {
      if (context.getType() === 'ws') {
        const client = context.switchToWs().getClient<AuthenticatedSocket>();
        client.emit('user_error', {
          statusMessage: 'idNotFound',
          message: 'userIdNotFound',
        });
        client.disconnect();
        return false;
      } else {
        throwError(
          HttpStatus.BAD_REQUEST,
          'User not found',
          'User not found',
          'USER_NOT_FOUND',
        );
      }
    }

    const user: User | null = await this.usersService.findById(userId, [
      'plans',
    ]);

    if (!user) {
      if (context.getType() === 'ws') {
        const client = context.switchToWs().getClient<AuthenticatedSocket>();
        client.emit('user_error', {
          statusMessage: 'userNotFound',
          message: 'userWithThisIdDoesNotExist',
        });
        client.disconnect();
        return false;
      } else {
        throwError(
          HttpStatus.BAD_REQUEST,
          'User not found',
          'User With This Id Does Not Exist',
          'USER_NOT_FOUND',
        );
      }
    }

    if (
      user.subscriptionRuntime === SubscriptionRuntime.V2 &&
      this.subscriptionsService
    ) {
      return this.canActivateV2(
        context,
        user.id,
        undefined,
        this.getCycleId(context),
      );
    }

    // if (!user.plans || user.plans.length === 0) {
    //   if (context.getType() === 'ws') {
    //     const client = context.switchToWs().getClient<AuthenticatedSocket>();
    //     client.emit('plan_error', {
    //       statusMessage: 'planNotFound',
    //       message: 'planNotFound',
    //     });
    //     return false;
    //   } else {
    //     throwError(
    //       HttpStatus.PLAN_NOT_FOUND,
    //       'Plan Not Found',
    //       'Plan Not Found',
    //       'PLAN_NOT_FOUND',
    //     );
    //   }
    // }

    const { plan } = await this.plansService.getActualByUserId(userId);

    if (!plan && this.subscriptionsService) {
      const { subscription } =
        await this.subscriptionsService.getCurrentUserSubscription(userId);

      if (subscription) {
        return this.canActivateV2(
          context,
          user.id,
          subscription,
          this.getCycleId(context),
        );
      }
    }

    if (!plan) {
      if (context.getType() === 'ws') {
        const client = context.switchToWs().getClient<AuthenticatedSocket>();
        client.emit('plan_error', {
          statusMessage: 'planNotFound',
          message: 'planNotFound',
          code: HttpStatus.PLAN_NOT_FOUND,
        });
        return false;
      } else {
        throwError(
          HttpStatus.PLAN_NOT_FOUND,
          'Plan Not Found',
          'Plan Not Found',
          'PLAN_NOT_FOUND',
        );
      }
    }

    // Time
    const now = Date.now();

    if (plan.planStatus === PlanStatus.INACTIVE) {
      if (context.getType() === 'ws') {
        const client = context.switchToWs().getClient<AuthenticatedSocket>();
        client.emit('plan_error', {
          statusMessage: 'subscriptionNotActive',
          message: 'yourSubscriptionIsInactivePleaseContactSupport',
          planStatus: plan.planStatus,
          basePlanId: plan.basePlanId,
          code: HttpStatus.PLAN_IS_INACTIVE,
        });
        return false;
      } else {
        throwError(
          HttpStatus.PLAN_IS_INACTIVE,
          'Subscription is not active',
          'Your subscription is inactive. Please contact support.',
          'SUBSCRIPTION_NOT_ACTIVE',
          { basePlanId: plan.basePlanId },
        );
      }
    }

    if (plan.planStatus === PlanStatus.CANCELED) {
      if (plan.expiryTime && new Date(plan.expiryTime).getTime() > now) {
        return true;
      }
      if (context.getType() === 'ws') {
        const client = context.switchToWs().getClient<AuthenticatedSocket>();
        client.emit('plan_error', {
          statusMessage: 'subscriptionWasCanceled',
          message: 'yourSubscriptionWasCanceledPleaseSubscribePlan',
          planStatus: plan.planStatus,
          basePlanId: plan.basePlanId,
          code: HttpStatus.PLAN_WAS_CANCELED,
        });
        return false;
      } else {
        throwError(
          HttpStatus.PLAN_WAS_CANCELED,
          'Subscription was canceled',
          'Your subscription was canceled. Please subscribe to a plan',
          'SUBSCRIPTION_WAS_CANCELED',
          { basePlanId: plan.basePlanId },
        );
      }
    }

    if (plan.planStatus === PlanStatus.EXPIRED) {
      if (context.getType() === 'ws') {
        const client = context.switchToWs().getClient<AuthenticatedSocket>();
        client.emit('plan_error', {
          statusMessage: 'subscriptionHasExpired',
          message: 'yourSubscriptionHasExpiredPleaseRenewYourSubscription',
          planStatus: plan.planStatus,
          basePlanId: plan.basePlanId,
          code: HttpStatus.PLAN_HAS_EXPIRED,
        });
        return false;
      } else {
        throwError(
          HttpStatus.PLAN_HAS_EXPIRED,
          'Subscription has expired',
          'Your subscription has expired. Please renew your subscription',
          'SUBSCRIPTION_HAS_EXPIRED',
          { basePlanId: plan.basePlanId },
        );
      }
    }

    if (plan.planStatus === PlanStatus.PENDING) {
      if (context.getType() === 'ws') {
        const client = context.switchToWs().getClient<AuthenticatedSocket>();
        client.emit('plan_error', {
          statusMessage: 'subscriptionHasPending',
          message: 'yourSubscriptionHasPending',
          planStatus: plan.planStatus,
          basePlanId: plan.basePlanId,
          code: HttpStatus.PLAN_WAS_PENDING,
        });
        return false;
      } else {
        throwError(
          HttpStatus.PLAN_WAS_PENDING,
          'Subscription has pending',
          'Your subscription has pending',
          'SUBSCRIPTION_HAS_PENDING',
          { basePlanId: plan.basePlanId },
        );
      }
    }

    if (plan.planStatus === PlanStatus.ON_HOLD) {
      if (context.getType() === 'ws') {
        const client = context.switchToWs().getClient<AuthenticatedSocket>();
        client.emit('plan_error', {
          statusMessage: 'subscriptionOnHold',
          message: 'yourSubscriptionOnHoldPleaseRenewYourSubscription',
          planStatus: plan.planStatus,
          basePlanId: plan.basePlanId,
          code: HttpStatus.PLAN_ON_HOLD,
        });
        return false;
      } else {
        throwError(
          HttpStatus.PLAN_ON_HOLD,
          'Subscription is on hold',
          'Your subscription is on hold. Please renew your subscription',
          'SUBSCRIPTION_ON_HOLD',
          { basePlanId: plan.basePlanId },
        );
      }
    }

    if (plan.planStatus === PlanStatus.PAUSED) {
      if (context.getType() === 'ws') {
        const client = context.switchToWs().getClient<AuthenticatedSocket>();
        client.emit('plan_error', {
          statusMessage: 'subscriptionPaused',
          message: 'yourSubscriptionPausedPleaseRenewYourSubscription',
          planStatus: plan.planStatus,
          basePlanId: plan.basePlanId,
          code: HttpStatus.PLAN_PAUSED,
        });
        return false;
      } else {
        throwError(
          HttpStatus.PLAN_PAUSED,
          'Subscription is paused',
          'Your subscription is paused. Please renew your subscription.',
          'SUBSCRIPTION_PAUSED',
          { basePlanId: plan.basePlanId },
        );
      }
    }

    if (plan.planStatus === PlanStatus.REFUNDED) {
      if (context.getType() === 'ws') {
        const client = context.switchToWs().getClient<AuthenticatedSocket>();
        client.emit('plan_error', {
          statusMessage: 'subscriptionRefunded',
          message: 'yourSubscriptionRefunded',
          planStatus: plan.planStatus,
          basePlanId: plan.basePlanId,
          code: HttpStatus.PLAN_REFUNDED,
        });
        return false;
      } else {
        throwError(
          HttpStatus.PLAN_REFUNDED,
          'Subscription was refunded',
          'Your subscription was refunded.',
          'SUBSCRIPTION_REFUNDED',
          { basePlanId: plan.basePlanId },
        );
      }
    }

    if (
      plan.basePlanId === BasePlanIds.START &&
      plan.expiryTime &&
      new Date(plan.expiryTime).getTime() < now
    ) {
      await this.plansService.updatePlan(plan.id, {
        planStatus: PlanStatus.EXPIRED,
      });
      this.planGateway.emitPlanStatusChanged(user.id);
      if (context.getType() === 'ws') {
        const client = context.switchToWs().getClient<AuthenticatedSocket>();
        client.emit('plan_error', {
          statusMessage: 'trialPeriodHasExpired',
          message: 'yourTrialPeriodHasExpiredPleaseSubscribeToAPlan',
          basePlanId: plan.basePlanId,
          code: HttpStatus.TRIAL_PLAN_HAS_EXPIRED,
        });
        return false;
      } else {
        throwError(
          HttpStatus.TRIAL_PLAN_HAS_EXPIRED,
          'Trial period has expired',
          'Your trial period has expired. Please subscribe to a plan',
          'TRIAL_PERIOD_HAS_EXPIRED',
          { basePlanId: plan.basePlanId },
        );
      }
    }

    if (
      plan.expiryTime &&
      new Date(plan.expiryTime).getTime() + 3 * 24 * 60 * 60 * 1000 < now
    ) {
      await this.plansService.updatePlan(plan.id, {
        planStatus: PlanStatus.EXPIRED,
      });
      this.planGateway.emitPlanStatusChanged(user.id);
      if (context.getType() === 'ws') {
        const client = context.switchToWs().getClient<AuthenticatedSocket>();
        client.emit('plan_error', {
          statusMessage: 'subscriptionHasExpired',
          message: 'yourSubscriptionHasExpiredPleaseRenewYourSubscription',
          basePlanId: plan.basePlanId,
          code: HttpStatus.PLAN_HAS_EXPIRED,
        });
        return false;
      } else {
        throwError(
          HttpStatus.PLAN_HAS_EXPIRED,
          '"Subscription has expired',
          'Your subscription has expired. Please renew your subscription',
          'SUBSCRIPTION_HAS_EXPIRED',
          { basePlanId: plan.basePlanId },
        );
      }
    }

    if (plan.creditsLimit && plan.creditsLimit <= plan.usedCredits) {
      await this.plansService.updatePlan(plan.id, {
        planStatus: PlanStatus.CREDIT_EXCEEDED,
      });
      this.planGateway.emitPlanStatusChanged(user.id);
      if (context.getType() === 'ws') {
        const client = context.switchToWs().getClient<AuthenticatedSocket>();
        client.emit('plan_error', {
          statusMessage: `creditLimitExceeded_${plan.basePlanId}`,
          message: `creditLimitExceeded_${plan.basePlanId}`,
          basePlanId: plan.basePlanId,
          code: HttpStatus.CREDIT_LIMIT_EXCEEDED,
        });
        return false;
      } else {
        throwError(
          HttpStatus.CREDIT_LIMIT_EXCEEDED,
          'Credit Limit Exceeded',
          'Credit limit exceeded. Please upgrade your plan to continue using the service',
          undefined,
          { basePlanId: plan.basePlanId },
        );
      }
    }

    return true;
  }

  private async canActivateV2(
    context: ExecutionContext,
    userId: number,
    existingSubscription?: Awaited<
      ReturnType<SubscriptionsService['getCurrentUserSubscription']>
    >['subscription'],
    cycleId?: string | null,
  ): Promise<boolean> {
    const access =
      await this.subscriptionsService!.refreshEffectiveAccessState(userId);
    const subscription = access.subscription ?? existingSubscription;
    const handler = context.getHandler?.();
    const body: unknown =
      context.getType() === 'http'
        ? context.switchToHttp().getRequest<AuthenticatedRequest>().body
        : null;
    const indexingOnly =
      context.getType() === 'http' &&
      handler &&
      Reflect.getMetadata(EMBEDDING_INDEX_ROUTE, handler) === true &&
      !!body &&
      typeof body === 'object' &&
      (body as Record<string, unknown>).indexingOnly === true;
    if (
      indexingOnly &&
      access.aiAccess &&
      access.aiAccess.status !== SubscriptionAccessStatus.BLOCKED &&
      subscription?.accessStatus !== SubscriptionAccessStatus.BLOCKED &&
      (access.aiAccess.status === SubscriptionAccessStatus.ACTIVE ||
        access.aiAccess.reason ===
          SubscriptionAccessReason.INSUFFICIENT_AI_CREDITS) &&
      access.aiAccess.availableCredits >= 1
    ) {
      // Actual input cost is checked by EmbeddingBatchService. This must NOT
      // authorize an analysis credit cycle or bypass its 500-credit admission.
      return true;
    }
    const isAuthorizedCycle =
      !!cycleId &&
      !!this.aiCreditCycleService &&
      (await this.aiCreditCycleService.isAuthorized(userId, cycleId));

    if (
      isAuthorizedCycle &&
      this.canCompleteAuthorizedCycle(access, subscription)
    ) {
      return true;
    }

    if (access.aiAccess?.status === SubscriptionAccessStatus.ACTIVE) {
      const planRemainingCredits =
        access.aiAccess.planRemainingCredits ??
        (subscription?.accessStatus === SubscriptionAccessStatus.ACTIVE
          ? Math.max(
              0,
              (subscription.creditsLimit ?? 0) -
                (subscription.usedCredits ?? 0),
            )
          : 0);
      const purchasedCreditsRemaining =
        access.aiAccess.purchasedCreditsRemaining ??
        Math.max(0, access.purchasedCredits?.remaining ?? 0);
      const availableCredits =
        access.aiAccess.availableCredits ??
        planRemainingCredits + purchasedCreditsRemaining;
      const minimumRequiredCredits =
        access.aiAccess.minimumRequiredCredits ?? MINIMUM_AI_REQUEST_CREDITS;

      if (availableCredits < minimumRequiredCredits) {
        return this.denyInsufficientAiCredits(context, subscription, {
          minimumRequiredCredits,
          availableCredits,
          planRemainingCredits,
          purchasedCreditsRemaining,
        });
      }

      await this.aiCreditCycleService?.authorize(userId, cycleId);
      return true;
    }

    if (
      access.aiAccess?.reason ===
      SubscriptionAccessReason.INSUFFICIENT_AI_CREDITS
    ) {
      return this.denyInsufficientAiCredits(context, subscription, {
        minimumRequiredCredits:
          access.aiAccess.minimumRequiredCredits ?? MINIMUM_AI_REQUEST_CREDITS,
        availableCredits: access.aiAccess.availableCredits ?? 0,
        planRemainingCredits: access.aiAccess.planRemainingCredits ?? 0,
        purchasedCreditsRemaining:
          access.aiAccess.purchasedCreditsRemaining ?? 0,
      });
    }

    if (!subscription) {
      return this.denyV2Access(context, {
        code: HttpStatus.PLAN_NOT_FOUND,
        errorCode: 'PLAN_NOT_FOUND',
        httpStatusMessage: 'Plan Not Found',
        httpMessage: 'Plan Not Found',
        socketStatusMessage: 'planNotFound',
        socketMessage: 'planNotFound',
      });
    }

    if (
      !access.aiAccess &&
      subscription.accessStatus === SubscriptionAccessStatus.ACTIVE
    ) {
      return true;
    }

    const details = this.getV2AccessError(
      (subscription.metadata?.accessReason as SubscriptionAccessReason) ??
        SubscriptionAccessReason.UNKNOWN,
      subscription.basePlanId,
    );

    return this.denyV2Access(context, details, {
      basePlanId: subscription.basePlanId,
    });
  }

  private getCycleId(context: ExecutionContext): string | null {
    const payload: unknown =
      context.getType() === 'ws'
        ? context.switchToWs().getData?.<unknown>()
        : context.switchToHttp().getRequest<AuthenticatedRequest>()?.body;
    const handler = context.getHandler?.();
    const configuredField: unknown =
      handler && Reflect.getMetadata(AI_CREDIT_CYCLE_ID_FIELD, handler);
    const field =
      typeof configuredField === 'string' ? configuredField : 'timingTraceId';
    if (!payload || typeof payload !== 'object') return null;
    const cycleId = (payload as Record<string, unknown>)[field];
    return typeof cycleId === 'string' && cycleId.trim()
      ? cycleId.trim()
      : null;
  }

  private canCompleteAuthorizedCycle(
    access: Awaited<
      ReturnType<SubscriptionsService['refreshEffectiveAccessState']>
    >,
    subscription:
      | Awaited<
          ReturnType<SubscriptionsService['getCurrentUserSubscription']>
        >['subscription']
      | undefined,
  ): boolean {
    if (
      access.aiAccess?.status === SubscriptionAccessStatus.BLOCKED ||
      subscription?.accessStatus === SubscriptionAccessStatus.BLOCKED
    ) {
      return false;
    }

    const reason =
      access.aiAccess?.reason ??
      (subscription?.metadata?.accessReason as SubscriptionAccessReason) ??
      SubscriptionAccessReason.UNKNOWN;

    return (
      reason === SubscriptionAccessReason.NONE ||
      reason === SubscriptionAccessReason.INSUFFICIENT_AI_CREDITS ||
      reason === SubscriptionAccessReason.CREDIT_EXCEEDED ||
      reason === SubscriptionAccessReason.TOKEN_EXCEEDED ||
      reason === SubscriptionAccessReason.PLAN_SELECTION_REQUIRED
    );
  }

  private denyInsufficientAiCredits(
    context: ExecutionContext,
    subscription: { basePlanId?: string | null } | null | undefined,
    balances: {
      minimumRequiredCredits: number;
      availableCredits: number;
      planRemainingCredits: number;
      purchasedCreditsRemaining: number;
    },
  ) {
    return this.denyV2Access(
      context,
      {
        code: HttpStatus.INSUFFICIENT_AI_CREDITS,
        errorCode: 'INSUFFICIENT_AI_CREDITS',
        httpStatusMessage: 'Insufficient AI credits',
        httpMessage:
          'The available AI credit balance is below the minimum required to start a request.',
        socketStatusMessage: 'insufficientAiCredits',
        socketMessage: 'insufficientAiCreditsForRequest',
      },
      {
        basePlanId: subscription?.basePlanId ?? null,
        ...balances,
      },
    );
  }

  private getV2AccessError(
    reason: SubscriptionAccessReason,
    basePlanId?: string | null,
  ) {
    const creditLimitKey = basePlanId
      ? `creditLimitExceeded_${basePlanId}`
      : 'creditLimitExceeded';

    switch (reason) {
      case SubscriptionAccessReason.CREDIT_EXCEEDED:
      case SubscriptionAccessReason.TOKEN_EXCEEDED:
        return {
          code: HttpStatus.CREDIT_LIMIT_EXCEEDED,
          errorCode: 'CREDIT_LIMIT_EXCEEDED',
          httpStatusMessage: 'Credit Limit Exceeded',
          httpMessage:
            'Credit limit exceeded. Please upgrade your plan to continue using the service',
          socketStatusMessage: creditLimitKey,
          socketMessage: creditLimitKey,
        };
      case SubscriptionAccessReason.TRIAL_EXPIRED:
        return {
          code: HttpStatus.TRIAL_PLAN_HAS_EXPIRED,
          errorCode: 'TRIAL_PERIOD_HAS_EXPIRED',
          httpStatusMessage: 'Trial period has expired',
          httpMessage:
            'Your trial period has expired. Please subscribe to a plan',
          socketStatusMessage: 'trialPeriodHasExpired',
          socketMessage: 'yourTrialPeriodHasExpiredPleaseSubscribeToAPlan',
        };
      case SubscriptionAccessReason.BILLING_ON_HOLD:
        return {
          code: HttpStatus.PLAN_ON_HOLD,
          errorCode: 'SUBSCRIPTION_ON_HOLD',
          httpStatusMessage: 'Subscription is on hold',
          httpMessage:
            'Your subscription is on hold. Please renew your subscription',
          socketStatusMessage: 'subscriptionOnHold',
          socketMessage: 'yourSubscriptionOnHoldPleaseRenewYourSubscription',
        };
      case SubscriptionAccessReason.BILLING_PAUSED:
        return {
          code: HttpStatus.PLAN_PAUSED,
          errorCode: 'SUBSCRIPTION_PAUSED',
          httpStatusMessage: 'Subscription is paused',
          httpMessage:
            'Your subscription is paused. Please renew your subscription.',
          socketStatusMessage: 'subscriptionPaused',
          socketMessage: 'yourSubscriptionPausedPleaseRenewYourSubscription',
        };
      case SubscriptionAccessReason.BILLING_PENDING:
      case SubscriptionAccessReason.PENDING:
        return {
          code: HttpStatus.PLAN_WAS_PENDING,
          errorCode: 'SUBSCRIPTION_HAS_PENDING',
          httpStatusMessage: 'Subscription has pending',
          httpMessage: 'Your subscription has pending',
          socketStatusMessage: 'subscriptionHasPending',
          socketMessage: 'yourSubscriptionHasPending',
        };
      case SubscriptionAccessReason.SUBSCRIPTION_EXPIRED:
        return {
          code: HttpStatus.PLAN_HAS_EXPIRED,
          errorCode: 'SUBSCRIPTION_HAS_EXPIRED',
          httpStatusMessage: 'Subscription has expired',
          httpMessage:
            'Your subscription has expired. Please renew your subscription',
          socketStatusMessage: 'subscriptionHasExpired',
          socketMessage:
            'yourSubscriptionHasExpiredPleaseRenewYourSubscription',
        };
      case SubscriptionAccessReason.SUBSCRIPTION_CANCELED:
        return {
          code: HttpStatus.PLAN_WAS_CANCELED,
          errorCode: 'SUBSCRIPTION_WAS_CANCELED',
          httpStatusMessage: 'Subscription was canceled',
          httpMessage:
            'Your subscription was canceled. Please subscribe to a plan',
          socketStatusMessage: 'subscriptionWasCanceled',
          socketMessage: 'yourSubscriptionWasCanceledPleaseSubscribePlan',
        };
      case SubscriptionAccessReason.SUBSCRIPTION_REFUNDED:
        return {
          code: HttpStatus.PLAN_REFUNDED,
          errorCode: 'SUBSCRIPTION_REFUNDED',
          httpStatusMessage: 'Subscription was refunded',
          httpMessage: 'Your subscription was refunded.',
          socketStatusMessage: 'subscriptionRefunded',
          socketMessage: 'yourSubscriptionRefunded',
        };
      case SubscriptionAccessReason.ADMIN_DISABLED:
        return {
          code: HttpStatus.PLAN_IS_INACTIVE,
          errorCode: 'SUBSCRIPTION_NOT_ACTIVE',
          httpStatusMessage: 'Subscription is not active',
          httpMessage: 'Your subscription is inactive. Please contact support.',
          socketStatusMessage: 'subscriptionNotActive',
          socketMessage: 'yourSubscriptionIsInactivePleaseContactSupport',
        };
      case SubscriptionAccessReason.PLAN_SELECTION_REQUIRED:
      case SubscriptionAccessReason.USE_WITHOUT_SUBSCRIPTION:
        return {
          code: HttpStatus.PLAN_NOT_FOUND,
          errorCode: 'PLAN_NOT_FOUND',
          httpStatusMessage: 'Plan Not Found',
          httpMessage: 'Plan Not Found',
          socketStatusMessage: 'planNotFound',
          socketMessage: 'planNotFound',
        };
      default:
        return {
          code: HttpStatus.PLAN_IS_INACTIVE,
          errorCode: 'SUBSCRIPTION_ACCESS_UNKNOWN',
          httpStatusMessage: 'Subscription access is unavailable',
          httpMessage:
            'Subscription access could not be determined. Please refresh or contact support.',
          socketStatusMessage: 'subscriptionAccessUnknown',
          socketMessage: 'subscriptionAccessUnavailablePleaseContactSupport',
        };
    }
  }

  private denyV2Access(
    context: ExecutionContext,
    error: {
      code: number;
      errorCode: string;
      httpStatusMessage: string;
      httpMessage: string;
      socketStatusMessage: string;
      socketMessage: string;
    },
    details?: Record<string, unknown>,
  ): false {
    if (context.getType() === 'ws') {
      const client = context.switchToWs().getClient<AuthenticatedSocket>();
      client.emit('plan_error', {
        statusMessage: error.socketStatusMessage,
        message: error.socketMessage,
        code: error.code,
        ...(error.errorCode === 'SUBSCRIPTION_ACCESS_UNKNOWN'
          ? { errorCode: error.errorCode }
          : {}),
        ...(details ?? {}),
      });
      return false;
    }

    throwError(
      error.code,
      error.httpStatusMessage,
      error.httpMessage,
      error.errorCode,
      details,
    );
    return false;
  }
}
