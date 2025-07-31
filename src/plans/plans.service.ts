import { Injectable } from '@nestjs/common';
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
      );
    }

    if (user!.plan) {
      if (user!.plan.usedTrial && createPlanDto.name === Plans.START) {
        throwError(
          HttpStatus.BAD_REQUEST,
          'Trial already used',
          'You have already used your trial period.',
        );
      }
      if (user!.plan.status === PlanStatus.INACTIVE) {
        throwError(
          HttpStatus.PLAN_IS_INACTIVE,
          'Plan not active',
          'Your plan is inactive. Please contact support.',
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
        );
      }
    }
  }

  async updateByUser(
    userId: number,
    plan: Partial<Plan>,
  ): Promise<Plan | null> {
    const existingPlan = await this.planRepository.findOne({
      where: { user: { id: userId } },
    });

    if (!existingPlan) {
      throwError(
        HttpStatus.NOT_FOUND,
        'Plan not found',
        'No plan found for the user.',
      );
    }

    const updatedPlan: DeepPartial<Plan> = {
      ...existingPlan,
      ...plan,
    };

    return this.planRepository.save(updatedPlan);
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
      );
      return;
    }

    if (plan.status === PlanStatus.UNSUBSCRIBED) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'Plan already unsubscribed',
        'Your plan is already unsubscribed.',
      );
    }

    plan.price = 0;
    plan.tokensLimit = 0;
    plan.status = PlanStatus.UNSUBSCRIBED;
    plan.periodEnd = new Date();
    plan.periodStart = new Date();

    await this.planRepository.save(plan);
  }
}
