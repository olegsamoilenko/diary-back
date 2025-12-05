import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Plan } from './entities/plan.entity';
import { DeepPartial, Repository } from 'typeorm';
import { CreatePlanDto } from './dto';
import { UsersService } from 'src/users/users.service';
import { throwError } from 'src/common/utils';
import { PLANS, PAID_PLANS } from './constants';
import { HttpStatus } from 'src/common/utils/http-status';
import { Plans, PlanStatus, BasePlanIds } from './types';

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
  ): Promise<{ plan: Plan }> {
    const user = await this.usersService.findById(userId, ['plans']);

    if (!user) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'User not found',
        'User with this id does not exist.',
        'USER_NOT_FOUND',
      );
    }

    if (user.plans.length > 0) {
      for (const plan of user.plans) {
        if (plan.actual) {
          await this.planRepository.update(plan.id, { actual: false });
        }
      }

      if (createPlanDto.basePlanId === BasePlanIds.START) {
        throwError(
          HttpStatus.BAD_REQUEST,
          'Trial already used',
          'You have already used your free trial.',
          'TRIAL_ALREADY_USED',
        );
      }
    }
    try {
      const plan = this.planRepository.create({
        ...createPlanDto,
        name: PLANS[createPlanDto.basePlanId].name as Plans,
        tokensLimit: PLANS[createPlanDto.basePlanId].tokensLimit,
        usedTrial: true,
        user: user,
        actual: true,
        startPayment: PAID_PLANS.includes(createPlanDto.basePlanId)
          ? new Date()
          : null,
      });
      await this.planRepository.save(plan);

      const { plan: savedPlan } = await this.getActualByUserId(userId);

      return { plan: savedPlan! };
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

  async findExistingPlan(purchaseToken: string): Promise<Plan | null> {
    return this.planRepository.findOne({
      where: { purchaseToken, actual: true },
      relations: ['user'],
    });
  }

  async getActualByUserId(userId: number): Promise<{ plan: Plan | null }> {
    try {
      const plan = await this.planRepository.findOne({
        where: { user: { id: userId }, actual: true },
      });

      // if (!plan) {
      //   throwError(
      //     HttpStatus.INTERNAL_SERVER_ERROR,
      //     'Plan not found',
      //     'Actual plan for the user does not exist.',
      //     'PLAN_NOT_FOUND',
      //   );
      // }

      return {
        plan,
      };
    } catch (error: any) {
      throwError(
        HttpStatus.INTERNAL_SERVER_ERROR,
        'Plan retrieval error',
        'An error occurred while retrieving the actual plan.',
        'PLAN_RETRIEVAL_ERROR',
        error,
      );
    }
  }

  async updatePlan(
    planId: number,
    updateData: Partial<Plan>,
  ): Promise<Plan | null> {
    try {
      const existing = await this.planRepository.findOne({
        where: { id: planId },
      });
      if (!existing) {
        throwError(
          HttpStatus.NOT_FOUND,
          'Plan not found',
          `Plan ${planId} does not exist`,
          'PLAN_NOT_FOUND',
        );
      }
      const merged = this.planRepository.merge(existing, updateData);
      return await this.planRepository.save(merged);
    } catch (error: any) {
      console.error('Error in updatePlan:', error);
      throwError(
        HttpStatus.INTERNAL_SERVER_ERROR,
        'Plan update error',
        'An error occurred while updating the plan.',
        'PLAN_UPDATE_ERROR',
      );
      return null;
    }
  }

  async calculateTokens(
    userId: number,
    inputTokens: number,
    outputTokens: number,
    totalTokens: number,
  ): Promise<void> {
    const existingPlan = await this.planRepository.findOne({
      where: { user: { id: userId }, actual: true },
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
      const total = existingPlan.usedTokens + totalTokens;
      const input = existingPlan.inputUsedTokens + inputTokens;
      const output = existingPlan.outputUsedTokens + outputTokens;

      const updatedPlan: DeepPartial<Plan> = {
        ...existingPlan,
        usedTokens: Math.round(total),
        inputUsedTokens: Math.round(input),
        outputUsedTokens: Math.round(output),
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

  async calculateTokensCoast(
    userId: number,
    inputTokensCoast: number,
    outputTokensCoast: number,
    totalTokensCoast: number,
  ): Promise<void> {
    const existingPlan = await this.planRepository.findOne({
      where: { user: { id: userId }, actual: true },
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
      const total = Number(existingPlan.usedTokensCoast) + totalTokensCoast;
      const input =
        Number(existingPlan.inputUsedTokensCoast) + inputTokensCoast;
      const output =
        Number(existingPlan.outputUsedTokensCoast) + outputTokensCoast;

      const updatedPlan: DeepPartial<Plan> = {
        ...existingPlan,
        usedTokensCoast: total.toString(),
        inputUsedTokensCoast: input.toString(),
        outputUsedTokensCoast: output.toString(),
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
