import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Plan } from './entities/plan.entity';
import { DeepPartial, Repository } from 'typeorm';
import { CreatePlanDto } from './dto';
import { UsersService } from 'src/users/users.service';
import { throwError } from 'src/common/utils';
import { PLANS } from './constants';
import dayjs from 'dayjs';
import { HttpStatus } from 'src/common/utils/http-status';
import { PlanIds, Plans, PlanStatus } from './types/plans';

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
      if (
        user!.plan.usedTrial &&
        createPlanDto.platformPlanId === PlanIds.START
      ) {
        throwError(
          HttpStatus.BAD_REQUEST,
          'Trial already used',
          'You have already used your trial period.',
          'TRIAL_ALREADY_USED',
        );
      }
      if (user!.plan.planStatus === PlanStatus.INACTIVE) {
        throwError(
          HttpStatus.PLAN_IS_INACTIVE,
          'Plan not active',
          'Your plan is inactive. Please contact support.',
          'PLAN_NOT_ACTIVE',
        );
      }
      try {
        await this.planRepository.update(user!.plan.id, {
          ...createPlanDto,
          name: PLANS[createPlanDto.platformPlanId].name as Plans,
          tokensLimit: PLANS[createPlanDto.platformPlanId].tokensLimit,
        });

        const updatedPlan = await this.planRepository.findOne({
          where: { id: user!.plan.id },
        });

        return updatedPlan!;
      } catch (error: any) {
        console.error('Error in resubscribePlan:', error);
        throwError(
          HttpStatus.INTERNAL_SERVER_ERROR,
          'Resubscription error',
          'An error occurred while resubscribing to the plan.',
          'RESUBSCRIPTION_ERROR',
        );
      }
    } else {
      try {
        const plan = this.planRepository.create({
          ...createPlanDto,
          name: PLANS[createPlanDto.platformPlanId].name as Plans,
          tokensLimit: PLANS[createPlanDto.platformPlanId].tokensLimit,
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

    if (plan.planStatus === PlanStatus.CANCELED) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'Plan already canceled',
        'Your plan is already canceled.',
        'PLAN_ALREADY_CANCELED',
      );
    }

    plan.price = 0;
    plan.tokensLimit = 0;
    plan.planStatus = PlanStatus.CANCELED;
    plan.expiryTime = new Date();
    plan.startTime = new Date();

    await this.planRepository.save(plan);
  }

  async deleteByUserId(userId: number): Promise<void> {
    await this.planRepository.delete({ user: { id: userId } });
  }
}
