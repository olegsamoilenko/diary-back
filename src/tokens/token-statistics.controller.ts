import { Controller, Get, Query } from '@nestjs/common';
import { TokenStatisticsService } from './token-statistics.service';

@Controller('token-statistics')
export class TokenStatisticsController {
  constructor(
    private readonly tokenStatisticsService: TokenStatisticsService,
  ) {}

  @Get('usage')
  async getTokenUsageStatistics(
    @Query('page') page = '1',
    @Query('limit') limit = '10',
  ) {
    const p = Number(page) || 1;
    const l = Number(limit) || 10;
    return await this.tokenStatisticsService.getTokenUsageStatistics(p, l);
  }
}
