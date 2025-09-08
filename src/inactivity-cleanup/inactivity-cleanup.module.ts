import { Module } from '@nestjs/common';
import { InactivityCleanupService } from './inactivity-cleanup.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from 'src/users/entities/user.entity';
import { EmailsModule } from 'src/emails/emails.module';
import { UsersModule } from 'src/users/users.module';

import { RedisModule } from 'src/redis/redis.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    RedisModule,
    EmailsModule,
    UsersModule,
  ],
  providers: [InactivityCleanupService],
})
export class InactivityCleanupModule {}
