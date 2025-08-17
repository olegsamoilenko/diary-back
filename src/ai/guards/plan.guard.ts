import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { UsersService } from 'src/users/users.service';
import { throwError } from '../../common/utils';
import { Request } from 'express';
import { User } from 'src/users/entities/user.entity';
import { HttpStatus } from 'src/common/utils/http-status';
import { Plans, PlanStatus } from '../../plans/types/plans';

interface AuthenticatedRequest extends Request {
  user?: User;
}

@Injectable()
export class PlanGuard implements CanActivate {
  constructor(private readonly usersService: UsersService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const userId = req.user?.id;

    if (!userId) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'User not found',
        'User with this id does not exist.',
      );
    }

    const user: User | null = await this.usersService.findById(userId!);

    if (!user) {
      throwError(HttpStatus.BAD_REQUEST, 'User not found', 'User not found');
    }

    if (!user!.plan) {
      throwError(HttpStatus.BAD_REQUEST, 'Plan not found', 'Plan not found');
    }

    const { plan } = user!;
    const now = new Date();

    if (plan.status === PlanStatus.INACTIVE) {
      throwError(
        HttpStatus.PLAN_IS_INACTIVE,
        'Subscription not active',
        'Your subscription is inactive. Please contact support.',
      );
    }

    if (
      plan.status === PlanStatus.CANCELED &&
      plan.periodEnd &&
      new Date(plan.periodEnd) < now
    ) {
      throwError(
        HttpStatus.PLAN_WAS_UNSUBSCRIBED,
        'Subscription was canceled',
        'Your subscription was canceled. Please subscribe plan.',
      );
    }

    if (plan.status === PlanStatus.EXPIRED) {
      throwError(
        HttpStatus.PLAN_HAS_EXPIRED,
        'Subscription was expired',
        'Your subscription has expired. Please, renew your subscription.',
      );
    }

    if (plan.status === PlanStatus.ON_HOLD) {
      throwError(
        HttpStatus.PLAN_ON_HOLD,
        'Subscription on hold',
        'Your subscription on hold. Please, renew your subscription.',
      );
    }

    if (plan.status === PlanStatus.PAUSED) {
      throwError(
        HttpStatus.PLAN_PAUSED,
        'Subscription paused',
        'Your subscription paused. Please, renew your subscription.',
      );
    }

    if (plan.status === PlanStatus.REFUNDED) {
      throwError(
        HttpStatus.PLAN_REFUNDED,
        'Subscription refunded',
        'Your subscription refunded.',
      );
    }

    if (
      plan.name === Plans.START &&
      plan.periodEnd &&
      new Date(plan.periodEnd) < now
    ) {
      throwError(
        HttpStatus.TRIAL_PLAN_HAS_EXPIRED,
        'Trial period has expired',
        'Your trial period has expired. Please, subscribe to a plan',
      );
    }

    if (plan.periodEnd && new Date(plan.periodEnd) < now) {
      throwError(
        HttpStatus.PLAN_HAS_EXPIRED,
        'Subscription has expired',
        'Your subscription has expired. Please, renew your subscription',
      );
    }

    if (plan.usedTokens >= plan.tokensLimit) {
      throwError(
        HttpStatus.TOKEN_LIMIT_EXCEEDED,
        'Exhausted token limit',
        'You have exhausted your token limit. Top up your balance or change the tariff',
      );
    }

    return true;
  }
}
