import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { FinanceStatisticsService } from './finance-statistics.service';
import { FinanceStatisticsController } from './finance-statistics.controller';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Payment } from 'src/payments/entities/payment.entity';
import { TokenUsageHistory } from 'src/tokens/entities/token-usage-history.entity';
import { FxRatesService } from './fx-rates.service';
import { AdminFinanceService } from './admin-finance.service';
import { GooglePlaySubscriptionsModule } from '../iap/google-play-subscriptions.module';

@Module({
  imports: [
    ConfigModule,
    GooglePlaySubscriptionsModule,
    HttpModule,
    TypeOrmModule.forFeature([Payment, TokenUsageHistory]),
  ],
  providers: [FinanceStatisticsService, FxRatesService, AdminFinanceService],
  controllers: [FinanceStatisticsController],
  exports: [FinanceStatisticsService],
})
export class FinanceStatisticsModule {}
