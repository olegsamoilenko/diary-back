import { Module } from '@nestjs/common';
import { EmailsService } from './emails.service';
import { EmailsController } from './emails.controller';

@Module({
  providers: [EmailsService],
  exports: [EmailsService],
  controllers: [EmailsController],
})
export class EmailsModule {}
