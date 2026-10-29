import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AdminFinanceService } from './admin-finance.service';
import { FinanceStatisticsService } from './finance-statistics.service';
import { GetFinanceStatisticsQuery } from './dto/get-finance-statistics.query';

@Controller('finance-statistics')
export class FinanceStatisticsController {
  constructor(
    private readonly financeStatisticsService: FinanceStatisticsService,
    private readonly adminFinance: AdminFinanceService,
  ) {}

  @Get('admin-revenue')
  @UseGuards(AuthGuard('admin-jwt'))
  getAdminRevenue(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('granularity') granularity = 'day',
    @Query('includeTest') includeTest = 'false',
  ) {
    return this.adminFinance.report(
      from,
      to,
      granularity,
      includeTest === 'true',
    );
  }

  @Get('common')
  async getCommon(@Query() query: GetFinanceStatisticsQuery) {
    return await this.financeStatisticsService.getCommonFinanceStatistics(
      query,
    );
  }
}
