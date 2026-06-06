import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ForumActivity } from '../entities/forum-activity.entity';

@Injectable()
export class ForumActivityService {
  constructor(
    @InjectRepository(ForumActivity)
    private readonly forumActivityRepo: Repository<ForumActivity>,
  ) {}

  async trackCommunityVisit(userId: number) {
    if (!userId) return;

    await this.forumActivityRepo
      .createQueryBuilder()
      .insert()
      .into(ForumActivity)
      .values({
        userId,
        activityDate: () => 'CURRENT_DATE',
      })
      .orIgnore()
      .execute();
  }

  async getDailyCommunityActivity(days = 30) {
    const safeDays = Math.min(Math.max(days, 1), 365);

    return this.forumActivityRepo
      .createQueryBuilder('activity')
      .select('activity.activityDate', 'date')
      .addSelect('COUNT(activity.userId)', 'usersCount')
      .where(`activity.activityDate >= CURRENT_DATE - (:days::int - 1)`, {
        days: safeDays,
      })
      .groupBy('activity.activityDate')
      .orderBy('activity.activityDate', 'ASC')
      .getRawMany<{
        date: string;
        usersCount: string;
      }>();
  }
}
