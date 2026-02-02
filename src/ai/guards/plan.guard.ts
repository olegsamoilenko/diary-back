import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
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

@Injectable()
export class PlanGuard implements CanActivate {
  constructor(
    private readonly usersService: UsersService,
    private readonly plansService: PlansService,
    private readonly planGateway: PlanGateway,
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

    const user: User | null = await this.usersService.findById(userId);

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

    // if (!user!.plans || user!.plans.length === 0) {
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
}
