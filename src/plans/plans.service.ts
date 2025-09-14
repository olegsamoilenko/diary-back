import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Plan } from './entities/plan.entity';
import { Repository, DeepPartial } from 'typeorm';
import { CreatePlanDto } from './dto';
import { UsersService } from 'src/users/users.service';
import { throwError } from 'src/common/utils';
import { PLANS } from './constants';
import dayjs from 'dayjs';
import { HttpStatus } from 'src/common/utils/http-status';
import { Plans, PlanStatus } from './types/plans';

@Injectable()
export class PlansService {
  constructor(
    @InjectRepository(Plan)
    private readonly planRepository: Repository<Plan>,
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
  ) {}

  // async findAll(): Promise<Plan[]> {
  //   return this.planRepository.find();
  // }
  //
  // async findOne(id: number): Promise<Plan | null> {
  //   return await this.planRepository.findOneBy({ id });
  // }

  async subscribePlan(
    userId: number,
    createPlanDto: CreatePlanDto,
  ): Promise<Plan | undefined> {
    const user = await this.usersService.findById(userId);

    if (!user) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'User not found',
        'User with this id does not exist.',
        'USER_NOT_FOUND',
      );
    }

    if (user!.plan) {
      if (user!.plan.usedTrial && createPlanDto.name === Plans.START) {
        throwError(
          HttpStatus.BAD_REQUEST,
          'Trial already used',
          'You have already used your trial period.',
          'TRIAL_ALREADY_USED',
        );
      }
      if (user!.plan.status === PlanStatus.INACTIVE) {
        throwError(
          HttpStatus.PLAN_IS_INACTIVE,
          'Plan not active',
          'Your plan is inactive. Please contact support.',
          'PLAN_NOT_ACTIVE',
        );
      }
      if (user!.plan.name === createPlanDto.name) {
        throwError(
          HttpStatus.BAD_REQUEST,
          'Same plan',
          'You are already subscribed to this plan.',
          'SAME_PLAN',
        );
      }
      try {
        await this.planRepository.update(user!.plan.id, {
          name: createPlanDto.name,
          price: PLANS[createPlanDto.name].price,
          tokensLimit: PLANS[createPlanDto.name].tokensLimit,
          periodStart: new Date(),
          periodEnd: dayjs(new Date())
            .add(
              PLANS[createPlanDto.name].duration,
              PLANS[createPlanDto.name].durationType,
            )
            .subtract(1, 'day')
            .toDate(),
          status: PlanStatus.ACTIVE,
        });

        const updatedPlan = await this.planRepository.findOne({
          where: { id: user!.plan.id },
        });

        return updatedPlan!;
      } catch (error: any) {
        console.error('Error in subscribePlan:', error);
        throwError(
          HttpStatus.INTERNAL_SERVER_ERROR,
          'Subscription error',
          'An error occurred while subscribing to the plan.',
          'SUBSCRIPTION_ERROR',
        );
      }
    } else {
      try {
        const plan = this.planRepository.create({
          name: createPlanDto.name,
          price: PLANS[createPlanDto.name].price,
          tokensLimit: PLANS[createPlanDto.name].tokensLimit,
          periodStart: new Date(),
          periodEnd: dayjs(new Date())
            .add(
              PLANS[createPlanDto.name].duration,
              PLANS[createPlanDto.name].durationType,
            )
            .subtract(1, 'day')
            .toDate(),
          usedTrial: true,
          user: user!,
        });
        return await this.planRepository.save(plan);
      } catch (error: any) {
        console.error('Error in subscribePlan:', error);
        throwError(
          HttpStatus.INTERNAL_SERVER_ERROR,
          'Subscription error',
          'An error occurred while subscribing to the plan.',
          'SUBSCRIPTION_ERROR',
        );
      }
    }
  }

  async calculateTokens(userId: number, usedTokens: number): Promise<void> {
    const existingPlan = await this.planRepository.findOne({
      where: { user: { id: userId } },
    });

    if (!existingPlan) {
      throwError(
        HttpStatus.NOT_FOUND,
        'Plan not found',
        'No plan found for the user.',
        'PLAN_NOT_FOUND',
      );
      return;
    }

    try {
      const totalTokens = existingPlan.usedTokens + usedTokens;

      const updatedPlan: DeepPartial<Plan> = {
        ...existingPlan,
        usedTokens: Math.round(totalTokens),
      };

      await this.planRepository.save(updatedPlan);
    } catch (error: any) {
      console.error('Error in calculateTokens:', error);
      throwError(
        HttpStatus.INTERNAL_SERVER_ERROR,
        'Token calculation error',
        'An error occurred while calculating tokens.',
        'TOKEN_CALCULATION_ERROR',
      );
    }
  }

  async unsubscribePlan(userId: number): Promise<void> {
    const plan = await this.planRepository.findOne({
      where: { user: { id: userId } },
    });

    if (!plan) {
      throwError(
        HttpStatus.NOT_FOUND,
        'Plan not found',
        'No plan found for the user.',
        'PLAN_NOT_FOUND',
      );
      return;
    }

    if (plan.status === PlanStatus.CANCELED) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'Plan already canceled',
        'Your plan is already canceled.',
        'PLAN_ALREADY_CANCELED',
      );
    }

    plan.price = 0;
    plan.tokensLimit = 0;
    plan.status = PlanStatus.CANCELED;
    plan.periodEnd = new Date();
    plan.periodStart = new Date();

    await this.planRepository.save(plan);
  }

  async deleteByUserId(userId: number): Promise<void> {
    await this.planRepository.delete({ user: { id: userId } });
  }
}
