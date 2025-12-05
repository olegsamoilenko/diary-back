import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Log } from './entities/log.entity';
import { LogsService } from './logs.service';
import { LogsController } from './logs.controller';
import { LogsCronService } from './logs.cron.service';

@Module({
  imports: [TypeOrmModule.forFeature([Log])],
  controllers: [LogsController],
  providers: [LogsService, LogsCronService],
  exports: [LogsService],
})
export class LogsModule {}
