import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { AiResponseMonitoringRecord } from './entities/ai-response-monitoring-record.entity';

const AI_MONITORING_RETENTION_DAYS = 7;

@Injectable()
export class AiResponseMonitoringCronService {
  private readonly logger = new Logger(AiResponseMonitoringCronService.name);

  constructor(
    @InjectRepository(AiResponseMonitoringRecord)
    private readonly monitoringRepository: Repository<AiResponseMonitoringRecord>,
  ) {}

  @Cron('0 15 3 * * *', { timeZone: 'Europe/Kyiv' })
  async removeExpiredRecords() {
    const cutoff = new Date(
      Date.now() - AI_MONITORING_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );

    this.logger.log(
      `Starting AI response monitoring cleanup. Deleting rows with createdAt < ${cutoff.toISOString()}`,
    );

    try {
      const result = await this.monitoringRepository.delete({
        createdAt: LessThan(cutoff),
      });

      this.logger.log(
        `AI response monitoring cleanup done. Deleted rows: ${result.affected ?? 0}`,
      );
    } catch (err: unknown) {
      if (err instanceof Error) {
        this.logger.error(
          `AI response monitoring cleanup failed: ${err.message}`,
          err.stack,
        );
      } else {
        this.logger.error(
          `AI response monitoring cleanup failed: ${JSON.stringify(err)}`,
        );
      }
    }
  }
}
