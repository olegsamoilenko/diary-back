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
  ): Promise<Plan> {
    const user = await this.usersService.findById(userId);

    if (!user) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'User not found',
        'User with this id does not exist.',
      );
    }

    const plan = this.planRepository.create(createPlanDto);
    plan.user = user!;
    plan.periodStart = new Date();
    plan.periodEnd = dayjs(plan.periodStart)
      .add(PLANS[createPlanDto.name].duration, 'day')
      .toDate();

    return this.planRepository.save(plan);
  }

  // async update(id: number, plan: Partial<Plan>): Promise<Plan | null> {
  //   await this.planRepository.update(id, plan);
  //   return this.findOne(id);
  // }
  //
  // async remove(id: number): Promise<void> {
  //   await this.planRepository.delete(id);
  // }
}
