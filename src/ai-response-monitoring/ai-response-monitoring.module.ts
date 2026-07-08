import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiResponseMonitoringController } from './ai-response-monitoring.controller';
import { AiResponseMonitoringService } from './ai-response-monitoring.service';
import { AiResponseMonitoringRecord } from './entities/ai-response-monitoring-record.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AiResponseMonitoringRecord])],
  controllers: [AiResponseMonitoringController],
  providers: [AiResponseMonitoringService],
  exports: [AiResponseMonitoringService],
})
export class AiResponseMonitoringModule {}
