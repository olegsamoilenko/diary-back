import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Plan } from './entities/plan.entity';
import { DataSource, DeepPartial, Not, Repository } from 'typeorm';
import { User } from 'src/users/entities/user.entity';
import { CreatePlanDto } from './dto';
import { UsersService } from 'src/users/users.service';
import { throwError } from 'src/common/utils';
import { PLANS, PAID_PLANS } from './constants';
import { HttpStatus } from 'src/common/utils/http-status';
import { Plans, PlanStatus, BasePlanIds } from './types';
import { AiModel } from '../users/types';
import { tokensToCredits } from './utils/tokensToCredits';
import { ChangePlanDto } from './dto/change-plan.dto';

@Injectable()
export class PlansService {
  constructor(
    @InjectRepository(Plan)
    private readonly planRepository: Repository<Plan>,
    private readonly dataSource: DataSource,
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
    try {
      return await this.dataSource.transaction(async (manager) => {
        const user = await manager.findOne(User, {
          where: { id: userId },
          lock: { mode: 'pessimistic_write' },
        });

        if (!user) {
          throwError(
            HttpStatus.BAD_REQUEST,
            'User not found',
            'User with this id does not exist.',
            'USER_NOT_FOUND',
          );
        }

        const userPlans = await manager.find(Plan, {
          where: { user: { id: userId } },
        });

        if (
          userPlans.length > 0 &&
          createPlanDto.basePlanId === BasePlanIds.START
        ) {
          throwError(
            HttpStatus.BAD_REQUEST,
            'Trial already used',
            'You have already used your free trial.',
            'TRIAL_ALREADY_USED',
          );
        }

        const existingByPurchaseToken = createPlanDto.purchaseToken
          ? await manager.findOne(Plan, {
              where: {
                purchaseToken: createPlanDto.purchaseToken,
              },
              lock: { mode: 'pessimistic_write' },
            })
          : null;

        if (existingByPurchaseToken) {
          const oldUserId = existingByPurchaseToken.userId;

          if (oldUserId !== userId) {
            const canClaim =
              existingByPurchaseToken.planStatus === PlanStatus.EXPIRED ||
              existingByPurchaseToken.planStatus === PlanStatus.CANCELED;

            if (!canClaim) {
              throwError(
                HttpStatus.CONFLICT,
                'Subscription already belongs to another user',
                'This subscription is already linked to another active account.',
                'SUBSCRIPTION_ALREADY_LINKED',
              );
            }
          }

          const isNewCreditsCycle =
            !!createPlanDto.lastOrderId &&
            createPlanDto.lastOrderId !== existingByPurchaseToken.lastOrderId;

          const merged = manager.merge(Plan, existingByPurchaseToken, {
            ...createPlanDto,
            user,
            name: PLANS[createPlanDto.basePlanId].name as Plans,
            creditsLimit: PLANS[createPlanDto.basePlanId].creditsLimit,
            usedTrial: true,
            actual: true,
            startPayment:
              existingByPurchaseToken.startPayment ??
              (PAID_PLANS.includes(createPlanDto.basePlanId)
                ? new Date()
                : null),
          });

          if (isNewCreditsCycle) {
            merged.usedCredits = 0;
            merged.inputUsedCredits = 0;
            merged.outputUsedCredits = 0;
          }

          const saved = await manager.save(Plan, merged);

          await manager.update(
            Plan,
            {
              user: { id: userId },
              actual: true,
              id: Not(saved.id),
            },
            { actual: false },
          );

          if (oldUserId !== userId) {
            await manager.update(
              Plan,
              {
                user: { id: oldUserId },
                actual: true,
              },
              { actual: false },
            );
          }

          return { plan: saved };
        }

        // const existingByOrderId = createPlanDto.lastOrderId
        //   ? await manager.findOne(Plan, {
        //       where: {
        //         user: { id: userId },
        //         lastOrderId: createPlanDto.lastOrderId,
        //       },
        //       lock: { mode: 'pessimistic_write' },
        //     })
        //   : null;
        //
        // if (existingByOrderId) {
        //   const merged = manager.merge(Plan, existingByOrderId, {
        //     ...createPlanDto,
        //     name: PLANS[createPlanDto.basePlanId].name as Plans,
        //     creditsLimit: PLANS[createPlanDto.basePlanId].creditsLimit,
        //     actual: true,
        //   });
        //
        //   const saved = await manager.save(Plan, merged);
        //
        //   await manager.update(
        //     Plan,
        //     {
        //       user: { id: userId },
        //       actual: true,
        //       id: Not(saved.id),
        //     },
        //     { actual: false },
        //   );
        //
        //   return { plan: saved };
        // }

        const newPlan = manager.create(Plan, {
          ...createPlanDto,
          name: PLANS[createPlanDto.basePlanId].name as Plans,
          creditsLimit: PLANS[createPlanDto.basePlanId].creditsLimit,
          usedTrial: true,
          user,
          actual: true,
          startPayment: PAID_PLANS.includes(createPlanDto.basePlanId)
            ? new Date()
            : null,
        });

        const savedPlan = await manager.save(Plan, newPlan);

        await manager.update(
          Plan,
          {
            user: { id: userId },
            actual: true,
            id: Not(savedPlan.id),
          },
          { actual: false },
        );

        return { plan: savedPlan };
      });
    } catch (error: any) {
      if (
        error?.code === '23505' &&
        error?.constraint === 'uq_plans_purchase_token' &&
        createPlanDto.purchaseToken
      ) {
        const existing = await this.planRepository.findOne({
          where: { purchaseToken: createPlanDto.purchaseToken },
          relations: ['user'],
        });

        if (existing?.user?.id === userId) {
          return { plan: existing };
        }
      }
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

  async findExistingPlanForIap(purchaseToken: string): Promise<Plan | null> {
    return this.planRepository.findOne({
      where: { purchaseToken },
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
      //     HttpStatus.PLAN_NOT_FOUND,
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
    options?: {
      resetUsedCredits?: boolean;
      lastOrderId?: string | null;
    },
  ): Promise<Plan | null> {
    try {
      const existing = await this.planRepository.findOne({
        where: { id: planId },
      });
      if (!existing) {
        throwError(
          HttpStatus.PLAN_NOT_FOUND,
          'Plan not found',
          `Plan ${planId} does not exist`,
          'PLAN_NOT_FOUND',
        );
      }
      const merged = this.planRepository.merge(existing, updateData);

      if (options?.resetUsedCredits) {
        merged.usedCredits = 0;
        merged.inputUsedCredits = 0;
        merged.outputUsedCredits = 0;
      }

      if (options?.lastOrderId !== undefined) {
        merged.lastOrderId = options.lastOrderId;
      }

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

  async changePlan(userId: number, dto: ChangePlanDto): Promise<Plan | null> {
    const { id, ...rest } = dto;
    const existingPlan = await this.planRepository.findOne({
      where: { id },
    });

    if (!existingPlan) {
      throwError(
        HttpStatus.PLAN_NOT_FOUND,
        'Plan not found',
        `Plan ${id} does not exist`,
        'PLAN_NOT_FOUND',
      );
    }

    try {
      const merged = this.planRepository.merge(existingPlan, rest);
      await this.planRepository.save(merged);

      const { plan } = await this.getActualByUserId(userId);

      return plan;
    } catch (error: any) {
      console.error('Error in changePlan:', error);
      throwError(
        HttpStatus.INTERNAL_SERVER_ERROR,
        'Plan change error',
        'An error occurred while change the plan.',
        'PLAN_UPDATE_ERROR',
      );
      return null;
    }
  }

  async calculateCredits(
    userId: number,
    aiModel: AiModel,
    inputTokens: number,
    outputTokens: number,
  ): Promise<void> {
    const existingPlan = await this.planRepository.findOne({
      where: { user: { id: userId }, actual: true },
    });

    if (!existingPlan) {
      throwError(
        HttpStatus.PLAN_NOT_FOUND,
        'Plan not found',
        'No plan found for the user.',
        'PLAN_NOT_FOUND',
      );
      return;
    }

    const { inputUsedCredits, outputUsedCredits } = tokensToCredits(
      aiModel,
      inputTokens,
      outputTokens,
    );

    try {
      const total =
        existingPlan.usedCredits + inputUsedCredits + outputUsedCredits;
      const input = existingPlan.inputUsedCredits + inputUsedCredits;
      const output = existingPlan.outputUsedCredits + outputUsedCredits;

      const updatedPlan: DeepPartial<Plan> = {
        ...existingPlan,
        usedCredits: Math.round(total),
        inputUsedCredits: Math.round(input),
        outputUsedCredits: Math.round(output),
      };

      await this.planRepository.save(updatedPlan);
    } catch (error: any) {
      console.error('Error in calculateCredits:', error);
      throwError(
        HttpStatus.INTERNAL_SERVER_ERROR,
        'Credits calculation error',
        'An error occurred while calculating Credits.',
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
        HttpStatus.PLAN_NOT_FOUND,
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
    plan.creditsLimit = 0;
    plan.planStatus = PlanStatus.CANCELED;
    plan.expiryTime = new Date();
    plan.startTime = new Date();

    await this.planRepository.save(plan);
  }

  async changePlanStatus(id: number, planStatus: PlanStatus): Promise<void> {
    const plan = await this.planRepository.findOne({ where: { id } });

    if (!plan) {
      throwError(
        HttpStatus.PLAN_NOT_FOUND,
        'Plan not found',
        'No plan found for the user.',
        'PLAN_NOT_FOUND',
      );
      return;
    }

    plan.planStatus = planStatus;

    await this.planRepository.save(plan);
  }

  async deleteByUserId(userId: number): Promise<void> {
    await this.planRepository.delete({ user: { id: userId } });
  }
}
