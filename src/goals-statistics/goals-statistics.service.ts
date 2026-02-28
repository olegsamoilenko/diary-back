import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { UsersService } from 'src/users/users.service';
import { throwError } from '../common/utils';
import { HttpStatus } from '../common/utils/http-status';
import { GoalsStat } from './entities/goals-stat.entity';

@Injectable()
export class GoalsStatisticsService {
  constructor(
    @InjectRepository(GoalsStat)
    private entriesStatRepository: Repository<GoalsStat>,
    private usersService: UsersService,
    private readonly dataSource: DataSource,
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

    const goalStat = this.entriesStatRepository.create({ user, type });

    return await this.entriesStatRepository.save(goalStat);
  }
}
