import { Controller, Get, Query } from '@nestjs/common';
import { FinanceStatisticsService } from './finance-statistics.service';
import { GetFinanceStatisticsQuery } from './dto/get-finance-statistics.query';

@Controller('finance-statistics')
export class FinanceStatisticsController {
  constructor(
    private readonly financeStatisticsService: FinanceStatisticsService,
  ) {}

  @Get('common')
  async getCommon(@Query() query: GetFinanceStatisticsQuery) {
    return await this.financeStatisticsService.getCommonFinanceStatistics(
      query,
    );
  }
}
