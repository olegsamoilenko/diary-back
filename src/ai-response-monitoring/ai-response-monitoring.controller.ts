import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AiResponseMonitoringService } from './ai-response-monitoring.service';
import { AiResponseMonitoringMode } from './types/ai-response-monitoring-mode';

@UseGuards(AuthGuard('admin-jwt'))
@Controller('ai-response-monitoring')
export class AiResponseMonitoringController {
  constructor(
    private readonly aiResponseMonitoringService: AiResponseMonitoringService,
  ) {}

  @Get('records')
  async getRecords(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('mode') mode?: AiResponseMonitoringMode,
    @Query('isRead') isRead?: string,
  ) {
    return await this.aiResponseMonitoringService.getRecords({
      page: Number(page) || 1,
      limit: Number(limit) || 50,
      mode,
      isRead: isRead === 'true' ? true : isRead === 'false' ? false : undefined,
    });
  }

  @Post('mark-as-read')
  async markAsRead(@Body() body: { id: number }) {
    return await this.aiResponseMonitoringService.markAsRead(body.id);
  }

  @Delete('delete')
  async deleteRecord(@Body() body: { id: number }) {
    return await this.aiResponseMonitoringService.deleteRecord(body.id);
  }
}
