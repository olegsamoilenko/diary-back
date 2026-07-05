import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { ForumUserAccess } from './entities/forum-user-access.entity';
import { ForumMonthlyUsage } from './entities/forum-monthly-usage.entity';
import { ForumAccessMode } from './enums/forum-access-mode.enum';
import { ForumAccessPolicy } from './types/forum-access-policy.type';
import { throwError } from '../common/utils';
import { HttpStatus } from '../common/utils/http-status';
import { ForumAccessStatusResponseDto } from './dto/forum-access-status.response.dto';
import { User } from '../users/entities/user.entity';
import { Role } from '../users/types';
import { UserPlanState } from 'src/subscriptions/entities/user-plan-state.entity';
import {
  SubscriptionAccessStatus,
  SubscriptionSource,
} from 'src/subscriptions/types';

@Injectable()
export class ForumAccessService {
  constructor(
    @InjectRepository(ForumUserAccess)
    private readonly forumUserAccessRepo: Repository<ForumUserAccess>,

    @InjectRepository(ForumMonthlyUsage)
    private readonly forumMonthlyUsageRepo: Repository<ForumMonthlyUsage>,

    @InjectRepository(User)
    private usersRepo: Repository<User>,

    @InjectRepository(UserPlanState)
    private userPlanStatesRepo: Repository<UserPlanState>,
  ) {}

  async assertCanCreateTopic(userId: number): Promise<void> {
    const status = await this.getAccessStatus(userId);

    if (status.hasUnlimitedAccess || !status.isLimited) return;

    if (
      status.topics.limit !== null &&
      status.topics.used >= status.topics.limit
    ) {
      throwError(
        HttpStatus.FORUM_TOPIC_MONTHLY_LIMIT_REACHED,
        'Forum monthly topic limit reached',
        'You have reached your monthly limit for free forum topics.',
        'FORUM_TOPIC_MONTHLY_LIMIT_REACHED',
        {
          limit: status.topics.limit,
          used: status.topics.used,
          remaining: 0,
          period: status.period,
        },
      );
    }
  }

  async assertCanCreateComment(userId: number): Promise<void> {
    const status = await this.getAccessStatus(userId);

    if (status.hasUnlimitedAccess || !status.isLimited) return;

    if (
      status.comments.limit !== null &&
      status.comments.used >= status.comments.limit
    ) {
      throwError(
        HttpStatus.FORUM_COMMENT_MONTHLY_LIMIT_REACHED,
        'Forum monthly comment limit reached',
        'You have reached your monthly limit for free forum comments.',
        'FORUM_COMMENT_MONTHLY_LIMIT_REACHED',
        {
          limit: status.comments.limit,
          used: status.comments.used,
          remaining: 0,
          period: status.period,
        },
      );
    }
  }

  async incrementTopicUsage(
    userId: number,
    manager?: EntityManager,
  ): Promise<void> {
    const repo = manager
      ? manager.getRepository(ForumMonthlyUsage)
      : this.forumMonthlyUsageRepo;

    const period = this.getCurrentPeriod();

    await repo
      .createQueryBuilder()
      .insert()
      .into(ForumMonthlyUsage)
      .values({
        userId,
        period,
        topicsCreated: 0,
        commentsCreated: 0,
      })
      .orIgnore()
      .execute();

    await repo.increment({ userId, period }, 'topicsCreated', 1);
  }

  async incrementCommentUsage(
    userId: number,
    manager?: EntityManager,
  ): Promise<void> {
    const repo = manager
      ? manager.getRepository(ForumMonthlyUsage)
      : this.forumMonthlyUsageRepo;

    const period = this.getCurrentPeriod();

    await repo
      .createQueryBuilder()
      .insert()
      .into(ForumMonthlyUsage)
      .values({
        userId,
        period,
        topicsCreated: 0,
        commentsCreated: 0,
      })
      .orIgnore()
      .execute();

    await repo.increment({ userId, period }, 'commentsCreated', 1);
  }

  async getAccessStatus(userId: number): Promise<ForumAccessStatusResponseDto> {
    const user = await this.usersRepo.findOne({
      where: { id: userId },
      select: {
        id: true,
        createdAt: true,
        role: true,
        usesWithoutSubscription: true,
      },
    });

    if (!user) {
      throwError(
        HttpStatus.NOT_FOUND,
        'User not found',
        'User not found',
        'USER_NOT_FOUND',
      );

      return null as never;
    }

    const hasUnlimitedForumAccess = await this.hasUnlimitedForumAccess(user.id);

    return this.buildAccessStatus({
      userId: user.id,
      userCreatedAt: user.createdAt,
      hasUnlimitedForumAccess,
      isAdmin: user.role === Role.ADMIN,
    });
  }

  private async hasUnlimitedForumAccess(userId: number): Promise<boolean> {
    const subscription = await this.userPlanStatesRepo.findOne({
      where: { userId },
      select: {
        id: true,
        userId: true,
        source: true,
        accessStatus: true,
        useWithoutSubscription: true,
        expiryTime: true,
      },
    });

    if (!subscription) {
      return false;
    }

    if (subscription.useWithoutSubscription) {
      return false;
    }

    if (subscription.source === SubscriptionSource.NONE) {
      return false;
    }

    if (subscription.accessStatus !== SubscriptionAccessStatus.ACTIVE) {
      return false;
    }

    return (
      !subscription.expiryTime ||
      new Date(subscription.expiryTime).getTime() > Date.now()
    );
  }

  private getPolicy(): ForumAccessPolicy {
    const mode =
      (process.env.FORUM_ACCESS_MODE as ForumAccessMode) ??
      ForumAccessMode.FREE;

    const limitsStartAtRaw = process.env.FORUM_LIMITS_START_AT;

    return {
      mode,
      isEnabled: mode !== ForumAccessMode.FREE,
      limitsStartAt: limitsStartAtRaw ? new Date(limitsStartAtRaw) : null,
      grandfatherExistingUsers:
        process.env.FORUM_GRANDFATHER_EXISTING_USERS !== 'false',
      freeTopicsPerMonth: Number(process.env.FORUM_FREE_TOPICS_PER_MONTH ?? 1),
      freeCommentsPerMonth: Number(
        process.env.FORUM_FREE_COMMENTS_PER_MONTH ?? 3,
      ),
    };
  }

  private async getOrCreateUserAccess(params: {
    userId: number;
    userCreatedAt: Date | null;
    policy: ForumAccessPolicy;
  }): Promise<ForumUserAccess> {
    if (params.policy.mode === ForumAccessMode.FREE) {
      return this.forumUserAccessRepo.create({
        userId: params.userId,
        isGrandfathered: false,
        limitStartedAt: null,
      });
    }

    const existing = await this.forumUserAccessRepo.findOne({
      where: { userId: params.userId },
    });

    if (existing) return existing;

    const isGrandfathered = this.shouldGrandfatherUser({
      userCreatedAt: params.userCreatedAt,
      policy: params.policy,
    });

    const entity = this.forumUserAccessRepo.create({
      userId: params.userId,
      isGrandfathered,
      limitStartedAt: params.policy.limitsStartAt,
    });

    return this.forumUserAccessRepo.save(entity);
  }

  private async getCurrentMonthUsage(
    userId: number,
    period: string,
  ): Promise<ForumMonthlyUsage> {
    const existing = await this.forumMonthlyUsageRepo.findOne({
      where: { userId, period },
    });

    if (existing) return existing;

    return this.forumMonthlyUsageRepo.create({
      userId,
      period,
      topicsCreated: 0,
      commentsCreated: 0,
    });
  }

  private shouldGrandfatherUser(params: {
    userCreatedAt: Date | null;
    policy: ForumAccessPolicy;
  }): boolean {
    const { userCreatedAt, policy } = params;

    if (!policy.grandfatherExistingUsers) return false;
    if (!policy.limitsStartAt) return false;
    if (!userCreatedAt) return false;

    return userCreatedAt < policy.limitsStartAt;
  }

  private isUserLimited(params: {
    policy: ForumAccessPolicy;
    access: ForumUserAccess;
    userCreatedAt: Date | null;
    hasUnlimitedAccess: boolean;
  }): boolean {
    const { policy, access, userCreatedAt, hasUnlimitedAccess } = params;

    if (hasUnlimitedAccess) return false;

    if (policy.mode === ForumAccessMode.FREE) {
      return false;
    }

    if (policy.mode === ForumAccessMode.SUBSCRIPTION_ONLY) {
      return true;
    }

    if (policy.mode === ForumAccessMode.LIMITED_FOR_ALL_FREE_USERS) {
      return true;
    }

    if (policy.mode === ForumAccessMode.LIMITED_FOR_NEW_USERS) {
      if (access.isGrandfathered) return false;

      if (!policy.limitsStartAt) return true;
      if (!userCreatedAt) return true;

      return userCreatedAt >= policy.limitsStartAt;
    }

    return false;
  }

  private getCurrentPeriod(): string {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');

    return `${year}-${month}`;
  }

  private async buildAccessStatus(params: {
    userId: number;
    userCreatedAt: Date | null;
    hasUnlimitedForumAccess: boolean;
    isAdmin?: boolean;
  }): Promise<ForumAccessStatusResponseDto> {
    const policy = this.getPolicy();
    const period = this.getCurrentPeriod();

    const [access, usage] = await Promise.all([
      this.getOrCreateUserAccess({
        userId: params.userId,
        userCreatedAt: params.userCreatedAt,
        policy,
      }),
      this.getCurrentMonthUsage(params.userId, period),
    ]);

    const hasUnlimitedAccess =
      params.hasUnlimitedForumAccess || !!params.isAdmin;

    const isLimited = this.isUserLimited({
      policy,
      access,
      userCreatedAt: params.userCreatedAt,
      hasUnlimitedAccess,
    });

    const topicLimit = isLimited ? policy.freeTopicsPerMonth : null;
    const commentLimit = isLimited ? policy.freeCommentsPerMonth : null;

    return {
      mode: policy.mode,
      isLimited,
      isGrandfathered: access.isGrandfathered,
      hasUnlimitedAccess,
      period,
      topics: {
        used: usage.topicsCreated,
        limit: topicLimit,
        remaining:
          topicLimit === null
            ? null
            : Math.max(topicLimit - usage.topicsCreated, 0),
      },
      comments: {
        used: usage.commentsCreated,
        limit: commentLimit,
        remaining:
          commentLimit === null
            ? null
            : Math.max(commentLimit - usage.commentsCreated, 0),
      },
    };
  }
}
