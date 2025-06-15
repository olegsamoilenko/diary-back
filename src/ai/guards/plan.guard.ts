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

    if (plan.status !== 'active') {
      throwError(HttpStatus.BAD_REQUEST, 'Plan not found', 'Plan not found');
      throw new ForbiddenException(
        'Ваш тариф неактивний, зверніться в підтримку',
      );
    }

    if (plan.periodEnd && new Date(plan.periodEnd) < now) {
      throwError(
        HttpStatus.PAYMENT_REQUIRED,
        'Subscription has expired',
        'Your subscription has expired. Renew your subscription',
      );
    }

    if (plan.usedTokens >= plan.tokensLimit) {
      throwError(
        HttpStatus.PAYMENT_REQUIRED,
        'Exhausted token limit',
        'You have exhausted your token limit. Top up your balance or change the tariff',
      );
    }

    return true;
  }
}
