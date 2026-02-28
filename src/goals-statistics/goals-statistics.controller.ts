import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ActiveUserData,
  ActiveUserDataT,
} from '../auth/decorators/active-user.decorator';
import { GoalsStatisticsService } from './goals-statistics.service';

@Controller('goals-statistics')
export class GoalsStatisticsController {
  constructor(
    private readonly goalsStatisticsService: GoalsStatisticsService,
  ) {}

  @UseGuards(AuthGuard('jwt'))
  @Post('add-goal-stat')
  async addGoalStat(
    @ActiveUserData() user: ActiveUserDataT,
    @Body() body: { type: string },
  ) {
    return await this.goalsStatisticsService.addGoalStat(user.id, body.type);
  }
}
