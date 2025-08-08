import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TokenUsageHistory } from './entities/tokenUsageHistory.entity';
import { TokensService } from './tokens.service';

@Module({
  imports: [TypeOrmModule.forFeature([TokenUsageHistory])],
  providers: [TokensService],
  controllers: [],
  exports: [TokensService],
})
export class TokensModule {}
