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
import { throwError } from '../../common/utils';
import { HttpStatus } from '../../common/utils/http-status';

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
      throwError(
        HttpStatus.BAD_REQUEST,
        'You cannot message yourself',
        'You cannot message yourself',
        'YOU_CANNOT_MESSAGE_YOURSELF',
      );
    }

    const targetProfile = await this.profilesRepo.findOne({
      where: {
        userId: targetUserId,
        isForumEnabled: true,
        isBanned: false,
      },
    });

    if (!targetProfile) {
      throwError(
        HttpStatus.NOT_FOUND,
        'User forum profile not found',
        'User forum profile not found',
        'USER_FORUM_PROFILE_NOT_FOUND',
      );
    }

    if (!targetProfile.allowDirectMessages) {
      throwError(
        HttpStatus.FORBIDDEN,
        'User does not accept direct messages',
        'User does not accept direct messages',
        'USER_DOES_NOT_ACCEPT_DIRECT_MESSAGES',
      );
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
        throwError(
          HttpStatus.FORBIDDEN,
          'Conversation is blocked',
          'Conversation is blocked',
          'CONVERSATION_IS_BLOCKED',
        );
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
      throwError(
        HttpStatus.FORBIDDEN,
        'Conversation not found',
        'Conversation not found',
        'CONVERSATION_NOT_FOUND',
      );
    }

    const isMember =
      conversation.userOneId === userId || conversation.userTwoId === userId;

    if (!isMember) {
      throwError(
        HttpStatus.FORBIDDEN,
        'You do not have access to this conversation',
        'You do not have access to this conversation',
        'YOU_DO_NOT_HAVE_ACCESS_TO_THIS_CONVERSATION',
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
