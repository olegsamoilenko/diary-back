import { Module } from '@nestjs/common';
import { Payment } from './entities/payment.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentsService } from './payments.service';

@Module({
  imports: [TypeOrmModule.forFeature([Payment])],
  providers: [PaymentsService],
  controllers: [],
  exports: [PaymentsService],
})
export class PaymentsModule {}
