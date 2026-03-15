import { Body, Controller, Get, Post, Delete } from '@nestjs/common';
import { UserMonitoringService } from './user-monitoring.service';
import { MonitoringType } from './types';

@Controller('user-monitoring')
export class UserMonitoringController {
  constructor(private readonly userMonitoringService: UserMonitoringService) {}

  @Post('add-to-monitoring')
  async addToMonitoring(
    @Body()
    body: {
      userUuid: string;
      type: MonitoringType;
      description: string;
    },
  ) {
    return await this.userMonitoringService.addToMonitoring(
      body.userUuid,
      body.type,
      body.description,
    );
  }

  @Post('get-all')
  async getAll(@Body() body: { type: MonitoringType }) {
    return await this.userMonitoringService.getAll(body.type);
  }

  @Delete('delete')
  async deleteFromMonitoring(@Body() body: { id: number }) {
    return await this.userMonitoringService.deleteFromMonitoring(body.id);
  }
}
