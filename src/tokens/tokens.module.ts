import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TokenUsageHistory } from './entities/tokenUsageHistory.entity';
import { TokensService } from './tokens.service';
import { TokenStatisticsController } from './token-statistics.controller';
import { TokenStatisticsService } from './token-statistics.service';
import { PlansModule } from 'src/plans/plans.module';

@Module({
  imports: [TypeOrmModule.forFeature([TokenUsageHistory]), PlansModule],
  providers: [TokensService, TokenStatisticsService],
  controllers: [TokenStatisticsController],
  exports: [TokensService],
})
export class TokensModule {}
