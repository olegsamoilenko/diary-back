import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Log } from './entities/log.entity';
import { ServerHttpLog } from './entities/server-http-logs.entity';
import { Cron, CronExpression } from '@nestjs/schedule';

const LOG_RETENTION_DAYS = 30;

@Injectable()
export class LogsCronService {
  private readonly logger = new Logger(LogsCronService.name);
  constructor(
    @InjectRepository(Log)
    private readonly logRepository: Repository<Log>,
    @InjectRepository(ServerHttpLog)
    private readonly serverHttpLogRepository: Repository<ServerHttpLog>,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM, { timeZone: 'Europe/Kyiv' })
  async removeOldLogs() {
    const now = new Date();
    const cutoff = new Date(
      now.getTime() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );

    this.logger.log(
      `Starting logs cleanup. Deleting rows with createdAt < ${cutoff.toISOString()}`,
    );

    try {
      const result = await this.logRepository.delete({
        createdAt: LessThan(cutoff),
      });

      this.logger.log(
        `Logs cleanup done. Deleted rows: ${result.affected ?? 0}`,
      );
    } catch (err: unknown) {
      if (err instanceof Error) {
        this.logger.error(`Logs cleanup failed: ${err.message}`, err.stack);
      } else {
        this.logger.error(`Logs cleanup failed: ${JSON.stringify(err)}`);
      }
    }

    try {
      const result = await this.serverHttpLogRepository.delete({
        createdAt: LessThan(cutoff),
      });

      this.logger.log(
        `Server HTTP logs cleanup done. Deleted rows: ${result.affected ?? 0}`,
      );
    } catch (err: unknown) {
      if (err instanceof Error) {
        this.logger.error(
          `Server HTTP logs cleanup failed: ${err.message}`,
          err.stack,
        );
      } else {
        this.logger.error(
          `Server HTTP logs cleanup failed: ${JSON.stringify(err)}`,
        );
      }
    }
  }
}
