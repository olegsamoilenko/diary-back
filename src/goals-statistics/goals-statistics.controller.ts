import { Body, Controller, Delete, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ActiveUserData,
  ActiveUserDataT,
} from '../auth/decorators/active-user.decorator';
import { GoalsStatisticsService } from './goals-statistics.service';
import { CreatePlannerStatDto } from '../planner-statistics/planner-statistics.dto';

@Controller('goals-statistics')
export class GoalsStatisticsController {
  constructor(
    private readonly goalsStatisticsService: GoalsStatisticsService,
  ) {}

  @UseGuards(AuthGuard('jwt'))
  @Post('add-goal-stat')
  async addGoalStat(
    @ActiveUserData() user: ActiveUserDataT,
    @Body() body: CreatePlannerStatDto,
  ) {
    return await this.goalsStatisticsService.addGoalStat(
      user.id,
      body.type,
      body.entityId,
    );
  }

  @UseGuards(AuthGuard('jwt'))
  @Delete('delete-goal-stat')
  async deleteGoalStat(
    @ActiveUserData() user: ActiveUserDataT,
    @Body() body: CreatePlannerStatDto,
  ) {
    return await this.goalsStatisticsService.deleteGoalStat(
      user.id,
      body.type,
      body.entityId,
    );
  }
}
