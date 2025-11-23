import { Body, Controller, Get, Post } from '@nestjs/common';
import { UserStatisticsService } from './user-statistics.service';
import type { Granularity } from './types';

@Controller('user-statistics')
export class UserStatisticsController {
  constructor(private readonly userStatisticsService: UserStatisticsService) {}

  @Get('get-user-count')
  async getUsers() {
    return await this.userStatisticsService.getUserCount();
  }

  @Post('get-new-users')
  async getNewUsersByDates(
    @Body()
    body: {
      startDate: string;
      endDate: string;
      granularity: Granularity;
    },
  ) {
    return await this.userStatisticsService.getNewUsersByDates(
      body.startDate,
      body.endDate,
      body.granularity,
    );
  }

  @Post('get-new-paid-users')
  async getNewPaidUsersByDates(
    @Body()
    body: {
      startDate: string;
      endDate: string;
      granularity: Granularity;
    },
  ) {
    return await this.userStatisticsService.getNewPaidUsersByDates(
      body.startDate,
      body.endDate,
      body.granularity,
    );
  }

  @Get('get-total-paid-users')
  async getTotalPaidUsers() {
    return await this.userStatisticsService.getTotalPaidUsers();
  }

  @Get('get-paid-users-by-plan')
  async getPaidUsersByPlan() {
    return await this.userStatisticsService.getPaidUsersByPlan();
  }

  @Post('get-users-activity-by-dates')
  async getUsersActivityByDates(
    @Body()
    body: {
      startDate: string;
      endDate: string;
      granularity: Granularity;
      paidType: 'paid' | 'not-paid';
    },
  ) {
    return await this.userStatisticsService.getUsersActivityByDates(
      body.startDate,
      body.endDate,
      body.granularity,
      body.paidType,
    );
  }
}
