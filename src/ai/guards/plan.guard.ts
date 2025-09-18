import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { UsersService } from 'src/users/users.service';
import { throwError } from '../../common/utils';
import { User } from 'src/users/entities/user.entity';
import { HttpStatus } from 'src/common/utils/http-status';
import { Plans, PlanStatus } from 'src/plans/types';
import { AuthenticatedRequest } from 'src/auth/types/';
import { AuthenticatedSocket } from '../types';
import { JwtPayload } from 'src/auth/types';
import { PlanType } from 'src/plans/constants';
import { PlanTypes } from 'src/plans/types';

@Injectable()
export class PlanGuard implements CanActivate {
  constructor(private readonly usersService: UsersService) {}

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

    const user: User | null = await this.usersService.findById(userId!);

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

    if (!user!.plan) {
      if (context.getType() === 'ws') {
        const client = context.switchToWs().getClient<AuthenticatedSocket>();
        client.emit('plan_error', {
          statusMessage: 'planNotFound',
          message: 'planNotFound',
        });
        return false;
      } else {
        throwError(
          HttpStatus.BAD_REQUEST,
          'Plan Not Found',
          'Plan Not Found',
          'PLAN_NOT_FOUND',
        );
      }
    }

    const { plan } = user!;
    const now = new Date();

    if (plan.type !== PlanType) {
      if (
        plan.type === PlanTypes.INTERNAL_TESTING &&
        (PlanType === PlanTypes.CLOSED_TESTING ||
          PlanType === PlanTypes.OPEN_TESTING)
      ) {
        if (context.getType() === 'ws') {
          const client = context.switchToWs().getClient<AuthenticatedSocket>();
          client.emit('plan_error', {
            statusMessage: 'internalTestingHasBeenCompleted',
            message: 'internalTestingHasBeenCompletedIfYouWouldLike',
          });
          return false;
        } else {
          throwError(
            HttpStatus.BAD_REQUEST,
            'Internal Testing Has Been Completed',
            'Internal testing has been completed. If you would like to participate in the next test, please contact support.',
            'INTERNAL_TESTING_HAS_BEEN_COMPLETED',
          );
        }
      }
      if (
        plan.type === PlanTypes.CLOSED_TESTING &&
        (PlanType === PlanTypes.INTERNAL_TESTING ||
          PlanType === PlanTypes.OPEN_TESTING)
      ) {
        if (context.getType() === 'ws') {
          const client = context.switchToWs().getClient<AuthenticatedSocket>();
          client.emit('plan_error', {
            statusMessage: 'closedTestingHasBeenCompleted',
            message: 'closedTestingHasBeenCompletedIfYouWouldLike',
          });
          return false;
        } else {
          throwError(
            HttpStatus.BAD_REQUEST,
            'Closed testing has been completed',
            'Closed testing has been completed. If you would like to participate in the next test, please contact support.',
            'CLOSED_TESTING_HAS_BEEN_COMPLETED',
          );
        }
      }
      if (PlanType === PlanTypes.PRODUCTION) {
        if (context.getType() === 'ws') {
          const client = context.switchToWs().getClient<AuthenticatedSocket>();
          client.emit('plan_error', {
            statusMessage: 'testingHasBeenCompleted',
            message: 'testingHasBeenCompletedIfYouWouldLike',
          });
          return false;
        } else {
          throwError(
            HttpStatus.BAD_REQUEST,
            'Testing has been completed',
            'Testing has been completed. If you would like to continue using the app, please subscribe the plan.',
            'TESTING_HAS_BEEN_COMPLETED',
          );
        }
      }
    }

    if (plan.status === PlanStatus.INACTIVE) {
      if (context.getType() === 'ws') {
        const client = context.switchToWs().getClient<AuthenticatedSocket>();
        client.emit('plan_error', {
          statusMessage: 'subscriptionNotActive',
          message: 'yourSubscriptionIsInactivePleaseContactSupport',
          planStatus: plan.status,
        });
        return false;
      } else {
        throwError(
          HttpStatus.PLAN_IS_INACTIVE,
          'Subscription is not active',
          'Your subscription is inactive. Please contact support.',
          'SUBSCRIPTION_NOT_ACTIVE',
        );
      }
    }

    if (
      plan.status === PlanStatus.CANCELED &&
      plan.periodEnd &&
      new Date(plan.periodEnd) < now
    ) {
      if (context.getType() === 'ws') {
        const client = context.switchToWs().getClient<AuthenticatedSocket>();
        client.emit('plan_error', {
          statusMessage: 'subscriptionWasCanceled',
          message: 'yourSubscriptionWasCanceledPleaseSubscribePlan',
          planStatus: plan.status,
        });
        return false;
      } else {
        throwError(
          HttpStatus.PLAN_WAS_UNSUBSCRIBED,
          'Subscription was canceled',
          'Your subscription was canceled. Please subscribe to a plan',
          'SUBSCRIPTION_WAS_CANCELED',
        );
      }
    }

    if (plan.status === PlanStatus.EXPIRED) {
      if (context.getType() === 'ws') {
        const client = context.switchToWs().getClient<AuthenticatedSocket>();
        client.emit('plan_error', {
          statusMessage: 'subscriptionWasExpired',
          message: 'yourSubscriptionHasExpiredPleaseRenewYourSubscription',
          planStatus: plan.status,
        });
        return false;
      } else {
        throwError(
          HttpStatus.PLAN_HAS_EXPIRED,
          'Subscription was expired',
          'Your subscription has expired. Please renew your subscription',
          'SUBSCRIPTION_WAS_EXPIRED',
        );
      }
    }

    if (plan.status === PlanStatus.ON_HOLD) {
      if (context.getType() === 'ws') {
        const client = context.switchToWs().getClient<AuthenticatedSocket>();
        client.emit('plan_error', {
          statusMessage: 'subscriptionOnHold',
          message: 'yourSubscriptionOnHoldPleaseRenewYourSubscription',
          planStatus: plan.status,
        });
        return false;
      } else {
        throwError(
          HttpStatus.PLAN_ON_HOLD,
          'Subscription is on hold',
          'Your subscription is on hold. Please renew your subscription',
          'SUBSCRIPTION_ON_HOLD',
        );
      }
    }

    if (plan.status === PlanStatus.PAUSED) {
      if (context.getType() === 'ws') {
        const client = context.switchToWs().getClient<AuthenticatedSocket>();
        client.emit('plan_error', {
          statusMessage: 'subscriptionPaused',
          message: 'yourSubscriptionPausedPleaseRenewYourSubscription',
          planStatus: plan.status,
        });
        return false;
      } else {
        throwError(
          HttpStatus.PLAN_PAUSED,
          'Subscription is paused',
          'Your subscription is paused. Please renew your subscription.',
          'SUBSCRIPTION_PAUSED',
        );
      }
    }

    if (plan.status === PlanStatus.REFUNDED) {
      if (context.getType() === 'ws') {
        const client = context.switchToWs().getClient<AuthenticatedSocket>();
        client.emit('plan_error', {
          statusMessage: 'subscriptionRefunded',
          message: 'yourSubscriptionRefunded',
          planStatus: plan.status,
        });
        return false;
      } else {
        throwError(
          HttpStatus.PLAN_REFUNDED,
          'Subscription was refunded',
          'Your subscription was refunded.',
          'SUBSCRIPTION_REFUNDED',
        );
      }
    }

    if (
      plan.name === Plans.START &&
      plan.periodEnd &&
      new Date(plan.periodEnd) < now
    ) {
      if (context.getType() === 'ws') {
        const client = context.switchToWs().getClient<AuthenticatedSocket>();
        client.emit('plan_error', {
          statusMessage: 'trialPeriodHasExpired',
          message: 'yourTrialPeriodHasExpiredPleaseSubscribeToAPlan',
        });
        return false;
      } else {
        throwError(
          HttpStatus.TRIAL_PLAN_HAS_EXPIRED,
          'Trial period has expired',
          'Your trial period has expired. Please subscribe to a plan',
          'TRIAL_PERIOD_HAS_EXPIRED',
        );
      }
    }

    if (plan.periodEnd && new Date(plan.periodEnd) < now) {
      if (context.getType() === 'ws') {
        const client = context.switchToWs().getClient<AuthenticatedSocket>();
        client.emit('plan_error', {
          statusMessage: 'subscriptionHasExpired',
          message: 'yourSubscriptionHasExpiredPleaseRenewYourSubscription',
        });
        return false;
      } else {
        throwError(
          HttpStatus.PLAN_HAS_EXPIRED,
          '"Subscription has expired',
          'Your subscription has expired. Please renew your subscription',
          'SUBSCRIPTION_HAS_EXPIRED',
        );
      }
    }

    if (plan.usedTokens >= plan.tokensLimit) {
      if (context.getType() === 'ws') {
        const client = context.switchToWs().getClient<AuthenticatedSocket>();
        client.emit('plan_error', {
          statusMessage: 'exhaustedTokenLimit',
          message:
            'youHaveExhaustedYourTokenLimitForThisMonthPleaseUpgradeYourPlanToContinueUsingTheService',
        });
        return false;
      } else {
        throwError(
          HttpStatus.TOKEN_LIMIT_EXCEEDED,
          'Exhausted token limit',
          'You have exhausted your token limit for this month. Please upgrade your plan to continue using the service',
          'EXHAUSTED_TOKEN_LIMIT',
        );
      }
    }

    return true;
  }
}
