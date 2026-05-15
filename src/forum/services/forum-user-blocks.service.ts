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
import { HttpStatus } from 'src/common/utils/http-status';
import { throwError } from 'src/common/utils';

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
      throwError(
        HttpStatus.BAD_REQUEST,
        'You cannot block yourself',
        'You cannot block yourself',
        'YOU_CANNOT_BLOCK_YOURSELF',
      );
    }

    const blockedProfile = await this.profilesRepo.findOne({
      where: {
        userId: dto.blockedUserId,
        isForumEnabled: true,
      },
    });

    if (!blockedProfile) {
      throwError(
        HttpStatus.NOT_FOUND,
        'User forum profile not found',
        'User forum profile not found',
        'USER_FORUM_PROFILE_NOT_FOUND',
      );
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
