import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { UsersService } from 'src/users/users.service';
import { throwError } from '../../common/utils';
import { User } from 'src/users/entities/user.entity';
import { HttpStatus } from 'src/common/utils/http-status';
import { Plans, PlanStatus } from 'src/plans/types';
import { AuthenticatedRequest } from 'src/auth/types/';
import { AuthenticatedSocket } from '../types';
import { JwtPayload } from 'src/auth/types';

@Injectable()
export class PlanGuard implements CanActivate {
  constructor(private readonly usersService: UsersService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    console.log('PlanGuard: canActivate');
    let userId: number | undefined;
    if (context.getType() === 'ws') {
      const client = context.switchToWs().getClient<AuthenticatedSocket>();
      userId = (client.user as JwtPayload).id;
    } else {
      const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
      userId = req.user?.id;
    }

    console.log('PlanGuard: userId');
    console.log('PlanGuard: userId2', userId);

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
        throwError(HttpStatus.BAD_REQUEST, 'idNotFound', 'userIdNotFound.');
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
          'userNotFound',
          'userWithThisIdDoesNotExist',
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
        throwError(HttpStatus.BAD_REQUEST, 'planNotFound', 'planNotFound');
      }
    }

    const { plan } = user!;
    const now = new Date();

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
          'subscriptionNotActive',
          'yourSubscriptionIsInactivePleaseContactSupport.',
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
          'subscriptionWasCanceled',
          'yourSubscriptionWasCanceledPleaseSubscribePlan',
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
          'subscriptionWasExpired',
          'yourSubscriptionHasExpiredPleaseRenewYourSubscription',
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
          'subscriptionOnHold',
          'yourSubscriptionOnHoldPleaseRenewYourSubscription',
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
          'subscriptionPaused',
          'yourSubscriptionPausedPleaseRenewYourSubscription.',
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
          'subscriptionRefunded',
          'yourSubscriptionRefunded.',
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
          'trialPeriodHasExpired',
          'yourTrialPeriodHasExpiredPleaseSubscribeToAPlan',
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
          'subscriptionHasExpired',
          'yourSubscriptionHasExpiredPleaseRenewYourSubscription',
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
          'exhaustedTokenLimit',
          'youHaveExhaustedYourTokenLimitForThisMonthPleaseUpgradeYourPlanToContinueUsingTheService',
        );
      }
    }

    return true;
  }
}
