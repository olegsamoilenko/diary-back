import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ForumAccessService } from './forum-access.service';
import { ForumAccessController } from './forum-access.controller';
import { ForumUserAccess } from './entities/forum-user-access.entity';
import { ForumMonthlyUsage } from './entities/forum-monthly-usage.entity';
import { User } from '../users/entities/user.entity';
import { Plan } from '../plans/entities/plan.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([ForumUserAccess, ForumMonthlyUsage, User, Plan]),
  ],
  controllers: [ForumAccessController],
  providers: [ForumAccessService],
  exports: [ForumAccessService],
})
export class ForumAccessModule {}
