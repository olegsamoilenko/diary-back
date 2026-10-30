import { Module } from '@nestjs/common';
import { Payment } from './entities/payment.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentsService } from './payments.service';
import { GooglePlaySubscriptionsModule } from '../iap/google-play-subscriptions.module';
import { GooglePlayPaymentFinanceService } from './google-play-payment-finance.service';
import { PurchaseNotificationsService } from './purchase-notifications.service';

@Module({
  imports: [TypeOrmModule.forFeature([Payment]), GooglePlaySubscriptionsModule],
  providers: [
    PaymentsService,
    GooglePlayPaymentFinanceService,
    PurchaseNotificationsService,
  ],
  controllers: [],
  exports: [
    PaymentsService,
    GooglePlayPaymentFinanceService,
    PurchaseNotificationsService,
  ],
})
export class PaymentsModule {}
