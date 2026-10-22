import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ActiveUserData,
  ActiveUserDataT,
} from '../auth/decorators/active-user.decorator';
import {
  CreatePlannerStatDto,
  PlannerEntityStatDto,
} from './planner-statistics.dto';
import { PlannerStatisticsService } from './planner-statistics.service';

@Controller('planner-statistics')
@UseGuards(AuthGuard('jwt'))
export class PlannerStatisticsController {
  constructor(private readonly statistics: PlannerStatisticsService) {}

  @Post('created')
  recordCreation(
    @ActiveUserData() user: ActiveUserDataT,
    @Body() body: CreatePlannerStatDto,
  ) {
    return this.statistics.recordCreation(user.id, body.type, body.entityId);
  }

  @Post('saved')
  recordSaved(
    @ActiveUserData() user: ActiveUserDataT,
    @Body() body: PlannerEntityStatDto,
  ) {
    return this.statistics.recordSaved(user.id, body.type, body.entityId);
  }

  @Post('deleted')
  recordDeletion(
    @ActiveUserData() user: ActiveUserDataT,
    @Body() body: PlannerEntityStatDto,
  ) {
    return this.statistics.recordDeletion(user.id, body.type, body.entityId);
  }
}
