import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ForumMention } from '../entities/forum-mention.entity';
import { Repository } from 'typeorm';
import { ForumMentionTargetType } from '../types/forum-mention-target-type.enum';

type CreateForumMentionInput = {
  mentionedUserId: number;
  mentionedByUserId: number;
  targetType: ForumMentionTargetType;
  targetId: string;
  topicId?: string | null;
};

@Injectable()
export class ForumMentionsService {
  constructor(
    @InjectRepository(ForumMention)
    private readonly repo: Repository<ForumMention>,
  ) {}

  async createMany(inputs: CreateForumMentionInput[]) {
    if (!inputs.length) return [];

    await this.repo.upsert(
      inputs.map((input) => ({
        mentionedUserId: input.mentionedUserId,
        mentionedByUserId: input.mentionedByUserId,
        targetType: input.targetType,
        targetId: input.targetId,
        topicId: input.topicId ?? null,
      })),
      {
        conflictPaths: ['mentionedUserId', 'targetType', 'targetId'],
        skipUpdateIfNoValuesChanged: true,
      },
    );

    return { success: true };
  }

  async getMyMentions(userId: number, page = 1, limit = 30) {
    const safeLimit = Math.min(Math.max(limit || 30, 1), 100);
    const safePage = Math.max(page || 1, 1);

    const [items, total] = await this.repo.findAndCount({
      where: {
        mentionedUserId: userId,
      },
      order: {
        createdAt: 'DESC',
      },
      take: safeLimit,
      skip: (safePage - 1) * safeLimit,
      relations: {
        mentionedByUser: true,
        topic: true,
      },
    });

    return {
      items,
      total,
      page: safePage,
      limit: safeLimit,
      hasMore: safePage * safeLimit < total,
    };
  }
}
