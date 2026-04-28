import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ForumUserBlock } from '../entities/forum-user-block.entity';
import { ForumPublicProfile } from '../entities/forum-public-profile.entity';
import { Repository } from 'typeorm';
import { BlockForumUserDto } from '../dto/block-forum-user.dto';

@Injectable()
export class ForumUserBlocksService {
  constructor(
    @InjectRepository(ForumUserBlock)
    private readonly blocksRepo: Repository<ForumUserBlock>,

    @InjectRepository(ForumPublicProfile)
    private readonly profilesRepo: Repository<ForumPublicProfile>,
  ) {}

  async blockUser(blockerId: number, dto: BlockForumUserDto) {
    if (blockerId === dto.blockedUserId) {
      throw new BadRequestException('You cannot block yourself');
    }

    const blockedProfile = await this.profilesRepo.findOne({
      where: {
        userId: dto.blockedUserId,
        isForumEnabled: true,
      },
    });

    if (!blockedProfile) {
      throw new NotFoundException('User forum profile not found');
    }

    await this.blocksRepo.upsert(
      {
        blockerId,
        blockedUserId: dto.blockedUserId,
        reason: dto.reason?.trim() || null,
      },
      {
        conflictPaths: ['blockerId', 'blockedUserId'],
        skipUpdateIfNoValuesChanged: true,
      },
    );

    return { success: true };
  }

  async unblockUser(blockerId: number, blockedUserId: number) {
    await this.blocksRepo.delete({
      blockerId,
      blockedUserId,
    });

    return { success: true };
  }

  async isBlockedBetween(userA: number, userB: number) {
    const exists = await this.blocksRepo.exists({
      where: [
        {
          blockerId: userA,
          blockedUserId: userB,
        },
        {
          blockerId: userB,
          blockedUserId: userA,
        },
      ],
    });

    return exists;
  }

  async getMyBlockedUsers(userId: number, page = 1, limit = 30) {
    const safeLimit = Math.min(Math.max(limit || 30, 1), 100);
    const safePage = Math.max(page || 1, 1);

    const [items, total] = await this.blocksRepo.findAndCount({
      where: {
        blockerId: userId,
      },
      order: {
        createdAt: 'DESC',
      },
      take: safeLimit,
      skip: (safePage - 1) * safeLimit,
      relations: {
        blockedUser: true,
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
