import {
  forwardRef,
  HttpException,
  Inject,
  Injectable,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Plan } from './entities/plan.entity';
import { DataSource, DeepPartial, In, Not, Repository } from 'typeorm';
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
import { PaidPlanEventsService } from 'src/paid-plan-events/paid-plan-events.service';
import { PaidPlanEventSource } from 'src/paid-plan-events/entities/paid-plan-event.entity';
import { SubscriptionsService } from 'src/subscriptions/subscriptions.service';

@Injectable()
export class PlansService {
  constructor(
    @InjectRepository(Plan)
    private readonly planRepository: Repository<Plan>,
    private readonly dataSource: DataSource,
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
    private readonly paidPlanEventsService: PaidPlanEventsService,
    @Optional()
    @Inject(forwardRef(() => SubscriptionsService))
    private readonly subscriptionsService?: SubscriptionsService,
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
      const result = await this.dataSource.transaction(async (manager) => {
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
          const existingSnapshot = { ...existingByPurchaseToken };
          const oldUserId = existingByPurchaseToken.userId;

          if (oldUserId !== userId) {
            const canClaim =
              existingByPurchaseToken.planStatus === PlanStatus.EXPIRED ||
              existingByPurchaseToken.planStatus === PlanStatus.CANCELED;

            if (!canClaim) {
              if (PAID_PLANS.includes(createPlanDto.basePlanId)) {
                await this.paidPlanEventsService.conflict({
                  eventType: 'SUBSCRIPTION_ALREADY_LINKED',
                  source: PaidPlanEventSource.PLANS_SERVICE,
                  userId,
                  oldPlanId: existingSnapshot.id,
                  purchaseToken: createPlanDto.purchaseToken,
                  orderId: createPlanDto.lastOrderId,
                  oldOrderId: existingSnapshot.lastOrderId,
                  basePlanId: createPlanDto.basePlanId,
                  oldBasePlanId: existingSnapshot.basePlanId,
                  planStatus: createPlanDto.planStatus,
                  oldPlanStatus: existingSnapshot.planStatus,
                  expiryTime: createPlanDto.expiryTime,
                  oldExpiryTime: existingSnapshot.expiryTime,
                  actualBefore: existingSnapshot.actual,
                  message:
                    'Purchase token belongs to another non-expired/non-canceled user plan.',
                  metadata: {
                    oldUserId,
                    requestedUserId: userId,
                  },
                });
              }
              throwError(
                HttpStatus.CONFLICT,
                'Subscription already belongs to another user',
                'This subscription is already linked to another active account.',
                'SUBSCRIPTION_ALREADY_LINKED',
              );
            }

            if (PAID_PLANS.includes(createPlanDto.basePlanId)) {
              await this.paidPlanEventsService.warning({
                eventType: 'PAID_PLAN_CLAIMED_FROM_OTHER_USER',
                source: PaidPlanEventSource.PLANS_SERVICE,
                userId,
                oldPlanId: existingSnapshot.id,
                purchaseToken: createPlanDto.purchaseToken,
                orderId: createPlanDto.lastOrderId,
                oldOrderId: existingSnapshot.lastOrderId,
                basePlanId: createPlanDto.basePlanId,
                oldBasePlanId: existingSnapshot.basePlanId,
                planStatus: createPlanDto.planStatus,
                oldPlanStatus: existingSnapshot.planStatus,
                expiryTime: createPlanDto.expiryTime,
                oldExpiryTime: existingSnapshot.expiryTime,
                actualBefore: existingSnapshot.actual,
                message:
                  'Expired or canceled paid plan purchase token is being claimed by another user.',
                metadata: {
                  oldUserId,
                  newUserId: userId,
                },
              });
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

          const paidPlansToDeactivate = PAID_PLANS.includes(
            createPlanDto.basePlanId,
          )
            ? await manager.find(Plan, {
                where: {
                  user: { id: userId },
                  actual: true,
                  basePlanId: In(PAID_PLANS),
                  id: Not(saved.id),
                },
              })
            : [];

          await manager.update(
            Plan,
            {
              user: { id: userId },
              actual: true,
              id: Not(saved.id),
            },
            { actual: false },
          );

          if (PAID_PLANS.includes(createPlanDto.basePlanId)) {
            await this.paidPlanEventsService.info({
              eventType: 'PAID_PLAN_UPDATED_BY_PURCHASE_TOKEN',
              source: PaidPlanEventSource.PLANS_SERVICE,
              userId,
              planId: saved.id,
              purchaseToken: createPlanDto.purchaseToken,
              linkedPurchaseToken: createPlanDto.linkedPurchaseToken,
              orderId: createPlanDto.lastOrderId,
              oldOrderId: existingSnapshot.lastOrderId,
              basePlanId: createPlanDto.basePlanId,
              oldBasePlanId: existingSnapshot.basePlanId,
              planStatus: createPlanDto.planStatus,
              oldPlanStatus: existingSnapshot.planStatus,
              expiryTime: createPlanDto.expiryTime,
              oldExpiryTime: existingSnapshot.expiryTime,
              actualBefore: existingSnapshot.actual,
              actualAfter: saved.actual,
              message: 'Existing paid plan updated by purchase token.',
              metadata: {
                isNewCreditsCycle,
                oldUserId,
                newUserId: userId,
              },
            });

            for (const oldPlan of paidPlansToDeactivate) {
              await this.paidPlanEventsService.warning({
                eventType: 'PAID_PLAN_ACTUAL_SWITCH',
                source: PaidPlanEventSource.PLANS_SERVICE,
                userId,
                oldPlanId: oldPlan.id,
                newPlanId: saved.id,
                purchaseToken: createPlanDto.purchaseToken,
                linkedPurchaseToken: createPlanDto.linkedPurchaseToken,
                orderId: createPlanDto.lastOrderId,
                oldOrderId: oldPlan.lastOrderId,
                basePlanId: createPlanDto.basePlanId,
                oldBasePlanId: oldPlan.basePlanId,
                planStatus: createPlanDto.planStatus,
                oldPlanStatus: oldPlan.planStatus,
                expiryTime: createPlanDto.expiryTime,
                oldExpiryTime: oldPlan.expiryTime,
                actualBefore: true,
                actualAfter: false,
                message:
                  'Paid plan actual flag was switched off because another paid plan became actual.',
              });
            }
          }

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

        const paidPlansToDeactivate = PAID_PLANS.includes(
          createPlanDto.basePlanId,
        )
          ? await manager.find(Plan, {
              where: {
                user: { id: userId },
                actual: true,
                basePlanId: In(PAID_PLANS),
                id: Not(savedPlan.id),
              },
            })
          : [];

        await manager.update(
          Plan,
          {
            user: { id: userId },
            actual: true,
            id: Not(savedPlan.id),
          },
          { actual: false },
        );

        if (PAID_PLANS.includes(createPlanDto.basePlanId)) {
          await this.paidPlanEventsService.info({
            eventType: 'PAID_PLAN_CREATED',
            source: PaidPlanEventSource.PLANS_SERVICE,
            userId,
            planId: savedPlan.id,
            purchaseToken: createPlanDto.purchaseToken,
            linkedPurchaseToken: createPlanDto.linkedPurchaseToken,
            orderId: createPlanDto.lastOrderId,
            basePlanId: createPlanDto.basePlanId,
            planStatus: createPlanDto.planStatus,
            expiryTime: createPlanDto.expiryTime,
            actualAfter: savedPlan.actual,
            message: 'New paid plan created.',
          });

          for (const oldPlan of paidPlansToDeactivate) {
            await this.paidPlanEventsService.warning({
              eventType: 'PAID_PLAN_ACTUAL_SWITCH',
              source: PaidPlanEventSource.PLANS_SERVICE,
              userId,
              oldPlanId: oldPlan.id,
              newPlanId: savedPlan.id,
              purchaseToken: createPlanDto.purchaseToken,
              linkedPurchaseToken: createPlanDto.linkedPurchaseToken,
              orderId: createPlanDto.lastOrderId,
              oldOrderId: oldPlan.lastOrderId,
              basePlanId: createPlanDto.basePlanId,
              oldBasePlanId: oldPlan.basePlanId,
              planStatus: createPlanDto.planStatus,
              oldPlanStatus: oldPlan.planStatus,
              expiryTime: createPlanDto.expiryTime,
              oldExpiryTime: oldPlan.expiryTime,
              actualBefore: true,
              actualAfter: false,
              message:
                'Paid plan actual flag was switched off because a new paid plan was created.',
            });
          }
        }

        return { plan: savedPlan };
      });

      await this.syncActualPlanToSubscriptions(userId, result.plan);

      return result;
    } catch (error: any) {
      if (error instanceof HttpException) {
        throw error;
      }

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
          await this.syncActualPlanToSubscriptions(userId, existing);
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

  private async syncActualPlanToSubscriptions(
    userId: number | null | undefined,
    plan: Plan | null,
  ): Promise<void> {
    if (!userId || !this.subscriptionsService) {
      return;
    }

    if (plan && !plan.actual) {
      return;
    }

    try {
      await this.subscriptionsService.syncLegacyPlanToUserPlanState(
        userId,
        plan,
      );
    } catch (error) {
      await this.paidPlanEventsService.warning({
        eventType: 'LEGACY_PLAN_SUBSCRIPTION_SYNC_FAILED',
        source: PaidPlanEventSource.PLANS_SERVICE,
        userId,
        planId: plan?.id,
        purchaseToken: plan?.purchaseToken,
        linkedPurchaseToken: plan?.linkedPurchaseToken,
        orderId: plan?.lastOrderId,
        basePlanId: plan?.basePlanId,
        planStatus: plan?.planStatus,
        expiryTime: plan?.expiryTime,
        actualAfter: plan?.actual ?? null,
        message:
          'Legacy plan was updated, but syncing it into the new subscriptions schema failed.',
        metadata: {
          errorMessage:
            error instanceof Error ? error.message : 'Unknown sync error',
        },
      });
      console.error('Legacy plan subscriptions sync failed:', error);
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

  async hasPaidPlanByUserId(userId: number): Promise<boolean> {
    const plan = await this.planRepository.findOne({
      where: {
        user: { id: userId },
        basePlanId: In(PAID_PLANS),
      },
    });

    return Boolean(plan);
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
      const existingSnapshot = { ...existing };
      const merged = this.planRepository.merge(existing, updateData);

      if (options?.resetUsedCredits) {
        merged.usedCredits = 0;
        merged.inputUsedCredits = 0;
        merged.outputUsedCredits = 0;
      }

      if (options?.lastOrderId !== undefined) {
        merged.lastOrderId = options.lastOrderId;
      }

      const saved = await this.planRepository.save(merged);

      if (PAID_PLANS.includes(saved.basePlanId)) {
        await this.paidPlanEventsService.info({
          eventType: 'PAID_PLAN_UPDATED',
          source: PaidPlanEventSource.PLANS_SERVICE,
          userId: saved.userId,
          planId: saved.id,
          purchaseToken: saved.purchaseToken,
          linkedPurchaseToken: saved.linkedPurchaseToken,
          orderId: saved.lastOrderId,
          oldOrderId: existingSnapshot.lastOrderId,
          basePlanId: saved.basePlanId,
          oldBasePlanId: existingSnapshot.basePlanId,
          planStatus: saved.planStatus,
          oldPlanStatus: existingSnapshot.planStatus,
          expiryTime: saved.expiryTime,
          oldExpiryTime: existingSnapshot.expiryTime,
          actualBefore: existingSnapshot.actual,
          actualAfter: saved.actual,
          message: 'Paid plan updated.',
          metadata: {
            resetUsedCredits: Boolean(options?.resetUsedCredits),
          },
        });
      }

      await this.syncActualPlanToSubscriptions(saved.userId, saved);

      return saved;
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

  async updatePlanFromGooglePubSub(
    planId: number,
    userId: number,
    updateData: Partial<Plan>,
    options?: {
      resetUsedCredits?: boolean;
      lastOrderId?: string | null;
      restoreActual?: boolean;
    },
  ): Promise<Plan | null> {
    try {
      const savedPlan = await this.dataSource.transaction(async (manager) => {
        const existing = await manager.findOne(Plan, {
          where: { id: planId },
          lock: { mode: 'pessimistic_write' },
        });

        if (!existing) {
          throwError(
            HttpStatus.PLAN_NOT_FOUND,
            'Plan not found',
            `Plan ${planId} does not exist`,
            'PLAN_NOT_FOUND',
          );
        }

        const existingSnapshot = { ...existing };
        const merged = manager.merge(Plan, existing, updateData);

        if (options?.resetUsedCredits) {
          merged.usedCredits = 0;
          merged.inputUsedCredits = 0;
          merged.outputUsedCredits = 0;
        }

        if (options?.lastOrderId !== undefined) {
          merged.lastOrderId = options.lastOrderId;
        }

        if (options?.restoreActual) {
          merged.actual = true;
        }

        const saved = await manager.save(Plan, merged);

        if (options?.restoreActual) {
          await manager.update(
            Plan,
            {
              user: { id: userId },
              actual: true,
              id: Not(saved.id),
            },
            { actual: false },
          );

          await manager.update(
            User,
            { id: userId },
            { usesWithoutSubscription: false },
          );
        }

        if (PAID_PLANS.includes(saved.basePlanId)) {
          await this.paidPlanEventsService.info({
            eventType: 'PAID_PLAN_UPDATED_FROM_PUBSUB',
            source: PaidPlanEventSource.GOOGLE_PUBSUB,
            userId,
            planId: saved.id,
            purchaseToken: saved.purchaseToken,
            linkedPurchaseToken: saved.linkedPurchaseToken,
            orderId: saved.lastOrderId,
            oldOrderId: existingSnapshot.lastOrderId,
            basePlanId: saved.basePlanId,
            oldBasePlanId: existingSnapshot.basePlanId,
            planStatus: saved.planStatus,
            oldPlanStatus: existingSnapshot.planStatus,
            expiryTime: saved.expiryTime,
            oldExpiryTime: existingSnapshot.expiryTime,
            actualBefore: existingSnapshot.actual,
            actualAfter: saved.actual,
            message: 'Paid plan updated from Google Pub/Sub.',
            metadata: {
              resetUsedCredits: Boolean(options?.resetUsedCredits),
              restoredActual: Boolean(options?.restoreActual),
              resetUsesWithoutSubscription: Boolean(options?.restoreActual),
            },
          });
        }

        return saved;
      });

      await this.syncActualPlanToSubscriptions(userId, savedPlan);

      return savedPlan;
    } catch (error: any) {
      console.error('Error in updatePlanFromGooglePubSub:', error);
      throwError(
        HttpStatus.INTERNAL_SERVER_ERROR,
        'Plan update error',
        'An error occurred while updating the plan from Google Pub/Sub.',
        'PLAN_UPDATE_ERROR',
      );
      return null;
    }
  }

  async changePlan(userId: number, dto: ChangePlanDto): Promise<Plan | null> {
    const { id, ...rest } = dto;
    const existingPlan = await this.planRepository.findOne({
      where: { id, user: { id: userId } },
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
      const existingSnapshot = { ...existingPlan };
      const merged = this.planRepository.merge(existingPlan, rest);
      const saved = await this.planRepository.save(merged);

      if (PAID_PLANS.includes(existingSnapshot.basePlanId)) {
        await this.paidPlanEventsService.warning({
          eventType: 'PAID_PLAN_MANUAL_CHANGE',
          source: PaidPlanEventSource.MANUAL_PLAN_CHANGE,
          userId,
          planId: saved.id,
          purchaseToken: saved.purchaseToken,
          linkedPurchaseToken: saved.linkedPurchaseToken,
          orderId: saved.lastOrderId,
          oldOrderId: existingSnapshot.lastOrderId,
          basePlanId: saved.basePlanId,
          oldBasePlanId: existingSnapshot.basePlanId,
          planStatus: saved.planStatus,
          oldPlanStatus: existingSnapshot.planStatus,
          expiryTime: saved.expiryTime,
          oldExpiryTime: existingSnapshot.expiryTime,
          actualBefore: existingSnapshot.actual,
          actualAfter: saved.actual,
          message: 'Paid plan was changed through changePlan.',
          metadata: { dto },
        });
      }

      const { plan } = await this.getActualByUserId(userId);

      await this.syncActualPlanToSubscriptions(userId, plan);

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
  ): Promise<Plan | null> {
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
      return null;
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

      return await this.planRepository.save(updatedPlan);
    } catch (error: any) {
      console.error('Error in calculateCredits:', error);
      throwError(
        HttpStatus.INTERNAL_SERVER_ERROR,
        'Credits calculation error',
        'An error occurred while calculating Credits.',
        'TOKEN_CALCULATION_ERROR',
      );
      return null;
    }
  }

  async unsubscribePlan(userId: number): Promise<void> {
    const plan = await this.planRepository.findOne({
      where: { user: { id: userId }, actual: true },
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

    const oldPlanSnapshot = { ...plan };

    plan.price = 0;
    plan.creditsLimit = 0;
    plan.planStatus = PlanStatus.CANCELED;
    plan.expiryTime = new Date();
    plan.startTime = new Date();

    const savedPlan = await this.planRepository.save(plan);

    if (PAID_PLANS.includes(oldPlanSnapshot.basePlanId)) {
      await this.paidPlanEventsService.warning({
        eventType: 'PAID_PLAN_UNSUBSCRIBED',
        source: PaidPlanEventSource.MANUAL_PLAN_CHANGE,
        userId,
        planId: plan.id,
        purchaseToken: plan.purchaseToken,
        linkedPurchaseToken: plan.linkedPurchaseToken,
        orderId: plan.lastOrderId,
        basePlanId: plan.basePlanId,
        oldBasePlanId: oldPlanSnapshot.basePlanId,
        planStatus: plan.planStatus,
        oldPlanStatus: oldPlanSnapshot.planStatus,
        expiryTime: plan.expiryTime,
        oldExpiryTime: oldPlanSnapshot.expiryTime,
        actualBefore: oldPlanSnapshot.actual,
        actualAfter: plan.actual,
        message: 'Paid plan was unsubscribed through unsubscribePlan.',
      });
    }

    await this.syncActualPlanToSubscriptions(userId, savedPlan);
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

    const oldPlanStatus = plan.planStatus;
    plan.planStatus = planStatus;

    const savedPlan = await this.planRepository.save(plan);

    if (PAID_PLANS.includes(plan.basePlanId)) {
      await this.paidPlanEventsService.warning({
        eventType: 'PAID_PLAN_STATUS_CHANGED',
        source: PaidPlanEventSource.MANUAL_PLAN_CHANGE,
        userId: plan.userId,
        planId: plan.id,
        purchaseToken: plan.purchaseToken,
        linkedPurchaseToken: plan.linkedPurchaseToken,
        orderId: plan.lastOrderId,
        basePlanId: plan.basePlanId,
        planStatus,
        oldPlanStatus,
        expiryTime: plan.expiryTime,
        actualAfter: plan.actual,
        message: 'Paid plan status was changed through changePlanStatus.',
      });
    }

    await this.syncActualPlanToSubscriptions(savedPlan.userId, savedPlan);
  }

  async deleteByUserId(userId: number): Promise<void> {
    const paidPlans = await this.planRepository.find({
      where: { user: { id: userId }, basePlanId: In(PAID_PLANS) },
    });

    await this.planRepository.delete({ user: { id: userId } });

    for (const plan of paidPlans) {
      await this.paidPlanEventsService.warning({
        eventType: 'PAID_PLAN_DELETED_BY_USER_ID',
        source: PaidPlanEventSource.MANUAL_PLAN_CHANGE,
        userId,
        planId: plan.id,
        purchaseToken: plan.purchaseToken,
        linkedPurchaseToken: plan.linkedPurchaseToken,
        orderId: plan.lastOrderId,
        basePlanId: plan.basePlanId,
        planStatus: plan.planStatus,
        expiryTime: plan.expiryTime,
        actualBefore: plan.actual,
        message: 'Paid plan was deleted by user id.',
      });
    }
  }
}
