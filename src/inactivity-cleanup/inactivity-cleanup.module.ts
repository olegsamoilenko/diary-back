import { Module } from '@nestjs/common';
import { InactivityCleanupCronService } from './inactivity-cleanup.cron.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from 'src/users/entities/user.entity';
import { EmailsModule } from 'src/emails/emails.module';
import { UsersModule } from 'src/users/users.module';

import { RedisModule } from 'src/redis/redis.module';
import { UserPlanState } from 'src/subscriptions/entities/user-plan-state.entity';
import { CreditWallet } from 'src/credits/entities/credit-wallet.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, UserPlanState, CreditWallet]),
    RedisModule,
    EmailsModule,
    UsersModule,
  ],
  providers: [InactivityCleanupCronService],
})
export class InactivityCleanupModule {}
