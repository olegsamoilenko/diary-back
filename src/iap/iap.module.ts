import { Module } from '@nestjs/common';
import { IapService } from './iap.service';
import { IapController } from './iap.controller';
import { PlansModule } from 'src/plans/plans.module';
import { PaymentsModule } from 'src/payments/payments.module';
import { UsersModule } from 'src/users/users.module';

@Module({
  imports: [PlansModule, PaymentsModule, UsersModule],
  providers: [IapService],
  exports: [IapService],
  controllers: [IapController],
})
export class IapModule {}
