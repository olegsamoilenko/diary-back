import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ForumAccessService } from './forum-access.service';
import { ForumAccessController } from './forum-access.controller';
import { ForumUserAccess } from './entities/forum-user-access.entity';
import { ForumMonthlyUsage } from './entities/forum-monthly-usage.entity';
import { User } from '../users/entities/user.entity';
import { UserPlanState } from 'src/subscriptions/entities/user-plan-state.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ForumUserAccess,
      ForumMonthlyUsage,
      User,
      UserPlanState,
    ]),
  ],
  controllers: [ForumAccessController],
  providers: [ForumAccessService],
  exports: [ForumAccessService],
})
export class ForumAccessModule {}
