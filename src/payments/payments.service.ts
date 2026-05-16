import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Payment } from './entities/payment.entity';
import { Repository } from 'typeorm';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
  ) {}

  async create(paymentData: Partial<Payment>): Promise<Payment | null> {
    if (paymentData.orderId) {
      const existing = await this.paymentRepository.findOne({
        where: {
          orderId: paymentData.orderId,
        },
      });

      if (existing) {
        return existing;
      }
    }

    try {
      const payment = this.paymentRepository.create(paymentData);
      return await this.paymentRepository.save(payment);
    } catch (error: any) {
      if (error?.code === '23505' && paymentData.orderId) {
        return await this.paymentRepository.findOne({
          where: {
            orderId: paymentData.orderId,
          },
        });
      }

      throw error;
    }
  }
}
