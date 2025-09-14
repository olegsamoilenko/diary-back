import { Module } from '@nestjs/common';
import { IapService } from './iap.service';
import { IapController } from './iap.controller';

@Module({
  providers: [IapService],
  exports: [IapService],
  controllers: [IapController],
})
export class IapModule {}
