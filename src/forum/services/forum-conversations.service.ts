import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ForumConversation } from '../entities/forum-conversation.entity';
import { ForumPublicProfile } from '../entities/forum-public-profile.entity';
import { Repository } from 'typeorm';
import { normalizeConversationUsers } from '../utils/normalize-conversation-users';
import { ForumConversationStatus } from '../types/forum-conversation-status.enum';

@Injectable()
export class ForumConversationsService {
  constructor(
    @InjectRepository(ForumConversation)
    private readonly conversationsRepo: Repository<ForumConversation>,

    @InjectRepository(ForumPublicProfile)
    private readonly profilesRepo: Repository<ForumPublicProfile>,
  ) {}

  async getOrCreateConversation(userId: number, targetUserId: number) {
    if (userId === targetUserId) {
      throw new BadRequestException('You cannot message yourself');
    }

    const targetProfile = await this.profilesRepo.findOne({
      where: {
        userId: targetUserId,
        isForumEnabled: true,
        isBanned: false,
      },
    });

    if (!targetProfile) {
      throw new NotFoundException('User forum profile not found');
    }

    if (!targetProfile.allowDirectMessages) {
      throw new ForbiddenException('User does not accept direct messages');
    }

    const { userOneId, userTwoId } = normalizeConversationUsers(
      userId,
      targetUserId,
    );

    let conversation = await this.conversationsRepo.findOne({
      where: {
        userOneId,
        userTwoId,
      },
      relations: {
        userOne: true,
        userTwo: true,
      },
    });

    if (conversation) {
      if (conversation.status === ForumConversationStatus.BLOCKED) {
        throw new ForbiddenException('Conversation is blocked');
      }

      return conversation;
    }

    conversation = this.conversationsRepo.create({
      userOneId,
      userTwoId,
      status: ForumConversationStatus.ACTIVE,
      lastMessageAt: null,
    });

    return this.conversationsRepo.save(conversation);
  }

  async getMyConversations(userId: number, page = 1, limit = 30) {
    const safeLimit = Math.min(Math.max(limit || 30, 1), 100);
    const safePage = Math.max(page || 1, 1);

    const qb = this.conversationsRepo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.userOne', 'userOne')
      .leftJoinAndSelect('c.userTwo', 'userTwo')
      .where('(c.user_one_id = :userId OR c.user_two_id = :userId)', { userId })
      .andWhere('c.status != :blocked', {
        blocked: ForumConversationStatus.BLOCKED,
      })
      .orderBy('c.last_message_at', 'DESC', 'NULLS LAST')
      .addOrderBy('c.updated_at', 'DESC')
      .take(safeLimit)
      .skip((safePage - 1) * safeLimit);

    const [items, total] = await qb.getManyAndCount();

    return {
      items,
      total,
      page: safePage,
      limit: safeLimit,
      hasMore: safePage * safeLimit < total,
    };
  }

  async getConversation(userId: number, conversationId: string) {
    const conversation = await this.conversationsRepo.findOne({
      where: {
        id: conversationId,
      },
      relations: {
        userOne: true,
        userTwo: true,
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    const isMember =
      conversation.userOneId === userId || conversation.userTwoId === userId;

    if (!isMember) {
      throw new ForbiddenException(
        'You do not have access to this conversation',
      );
    }

    return conversation;
  }

  async archiveConversation(userId: number, conversationId: string) {
    const conversation = await this.getConversation(userId, conversationId);

    await this.conversationsRepo.update(conversation.id, {
      status: ForumConversationStatus.ARCHIVED,
    });

    return { success: true };
  }
}
