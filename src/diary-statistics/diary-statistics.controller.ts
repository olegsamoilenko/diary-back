import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { DiaryStatisticsService } from './diary-statistics.service';
import { AuthGuard } from '@nestjs/passport';
import {
  ActiveUserData,
  ActiveUserDataT,
} from '../auth/decorators/active-user.decorator';
import type { Granularity } from '../user-statistics/types';

type CheckinStatBody = {
  checkinName?: string | null;
};

@Controller('diary-statistics')
export class DiaryStatisticsController {
  constructor(
    private readonly diaryStatisticsService: DiaryStatisticsService,
  ) {}

  @UseGuards(AuthGuard('jwt'))
  @Post('add-entry-stat')
  async addEntryStat(@ActiveUserData() user: ActiveUserDataT) {
    return await this.diaryStatisticsService.addEntryStat(user.id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('add-dialog-stat')
  async addDialogStat(@ActiveUserData() user: ActiveUserDataT) {
    return await this.diaryStatisticsService.addDialogStat(user.id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('add-checkin-stat')
  async addCheckinStat(
    @ActiveUserData() user: ActiveUserDataT,
    @Body() body: CheckinStatBody,
  ) {
    return await this.diaryStatisticsService.addCheckinStat(
      user.id,
      body?.checkinName,
    );
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('add-checkin-dialog-stat')
  async addCheckinDialogStat(
    @ActiveUserData() user: ActiveUserDataT,
    @Body() body: CheckinStatBody,
  ) {
    return await this.diaryStatisticsService.addCheckinDialogStat(
      user.id,
      body?.checkinName,
    );
  }

  @Get('get-total-entries-stat')
  async getTotalEntriesStat() {
    return await this.diaryStatisticsService.getTotalEntriesStat();
  }

  @Get('get-total-dialogs-stat')
  async getTotalDialogsStat() {
    return await this.diaryStatisticsService.getTotalDialogsStat();
  }

  @Get('get-total-checkins-stat')
  async getTotalCheckinsStat() {
    return await this.diaryStatisticsService.getTotalCheckinsStat();
  }

  @Get('get-total-checkin-dialogs-stat')
  async getTotalCheckinDialogsStat() {
    return await this.diaryStatisticsService.getTotalCheckinDialogsStat();
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
    return await this.diaryStatisticsService.getNewEntriesAndDialogsByDates(
      body.startDate,
      body.endDate,
      body.granularity,
    );
  }
}
