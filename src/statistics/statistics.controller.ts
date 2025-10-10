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
  async getNewUsersByDates(
    @Body()
    body: {
      startDate: string;
      endDate: string;
      granularity: Granularity;
    },
  ) {
    return await this.statisticsService.getNewUsersByDates(
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
    return await this.statisticsService.getNewPaidUsersByDates(
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

  @Get('get-total-entries')
  async getTotalEntries() {
    return await this.statisticsService.getTotalEntries();
  }

  @Get('get-total-dialogs')
  async getTotalDialogs() {
    return await this.statisticsService.getTotalDialogs();
  }

  @Post('get-new-entries-and-dialogs')
  async getNewEntriesAndDialogsByDates(
    @Body()
    body: {
      startDate: string;
      endDate: string;
      granularity: Granularity;
    },
  ) {
    return await this.statisticsService.getNewEntriesAndDialogsByDates(
      body.startDate,
      body.endDate,
      body.granularity,
    );
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
    return await this.statisticsService.getUsersActivityByDates(
      body.startDate,
      body.endDate,
      body.granularity,
      body.paidType,
    );
  }
}
