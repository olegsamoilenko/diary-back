import { Controller, Get, Query } from '@nestjs/common';
import { PlanStatisticsService } from './plan-statistics.service';

@Controller('plan-statistics')
export class PlansStatisticsController {
  constructor(private readonly planStatisticsService: PlanStatisticsService) {}

  @Get('tokens')
  async getTokenStatistics(
    @Query('page') page = '1',
    @Query('limit') limit = '10',
  ) {
    const p = Number(page) || 1;
    const l = Number(limit) || 10;
    return await this.planStatisticsService.getTokenStatistics(p, l);
  }
}
