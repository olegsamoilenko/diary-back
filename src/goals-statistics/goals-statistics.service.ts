import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { UsersService } from 'src/users/users.service';
import { throwError } from '../common/utils';
import { HttpStatus } from '../common/utils/http-status';
import { GoalsStat } from './entities/goals-stat.entity';
import { UserStatisticsService } from 'src/user-statistics/user-statistics.service';

@Injectable()
export class GoalsStatisticsService {
  constructor(
    @InjectRepository(GoalsStat)
    private goalsStatRepository: Repository<GoalsStat>,
    private usersService: UsersService,
    private readonly dataSource: DataSource,
    private readonly userStatisticsService: UserStatisticsService,
  ) {}

  async addGoalStat(userId: number, type: string) {
    const user = await this.usersService.findById(userId);

    if (!user) {
      throwError(
        HttpStatus.NOT_FOUND,
        'User not found',
        'User not found',
        'USER_NOT_FOUND',
      );
      return;
    }

    const goalStat = this.goalsStatRepository.create({ user, type });

    await this.userStatisticsService.incrementGoalStat(userId);

    return await this.goalsStatRepository.save(goalStat);
  }

  async deleteGoalStat(userId: number, type: string) {
    const user = await this.usersService.findById(userId);

    if (!user) {
      throwError(
        HttpStatus.NOT_FOUND,
        'User not found',
        'User not found',
        'USER_NOT_FOUND',
      );
      return;
    }

    const goalStat = await this.goalsStatRepository.findOne({
      where: {
        user: { id: userId },
        type,
      },
      order: {
        id: 'DESC',
      },
    });

    if (!goalStat) {
      return;
    }

    await this.goalsStatRepository.delete(goalStat);
  }
}
