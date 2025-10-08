import { Body, Controller, Get, Post } from '@nestjs/common';
import { StatisticsService } from './statistics.service';
import type { Granularity } from './types';

@Controller('statistics')
export class StatisticsController {
  constructor(private readonly statisticsService: StatisticsService) {}

  @Get('get-user-count')
  async getUsers() {
    return await this.statisticsService.getUserCount();
  }

  @Get('get-users-entries')
  async getUsersEntriesForStatistics() {
    return await this.statisticsService.getUsersEntries();
  }

  @Post('get-new-users')
  async getNewUsers(
    @Body()
    body: {
      startDate: string;
      endDate: string;
      granularity: Granularity;
    },
  ) {
    return await this.statisticsService.getNewUsers(
      body.startDate,
      body.endDate,
      body.granularity,
    );
  }

  @Post('get-new-paid-users')
  async getNewPaidUsers(
    @Body()
    body: {
      startDate: string;
      endDate: string;
      granularity: Granularity;
    },
  ) {
    return await this.statisticsService.getNewPaidUsers(
      body.startDate,
      body.endDate,
      body.granularity,
    );
  }

  @Get('get-total-paid-users')
  async getTotalPaidUsers() {
    return await this.statisticsService.getTotalPaidUsers();
  }

  @Get('get-paid-users-by-plan')
  async getPaidUsersByPlan() {
    return await this.statisticsService.getPaidUsersByPlan();
  }
}
