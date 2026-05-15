import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { ForumMessage } from '../entities/forum-message.entity';
import { ForumConversation } from '../entities/forum-conversation.entity';
import { ForumPublicProfile } from '../entities/forum-public-profile.entity';
import { SendForumMessageDto } from '../dto/send-forum-message.dto';
import { ForumMessageStatus } from '../types/forum-message-status.enum';
import { ForumConversationStatus } from '../types/forum-conversation-status.enum';
import { normalizeConversationUsers } from '../utils/normalize-conversation-users';
import { ForumUserBlock } from '../entities/forum-user-block.entity';
import { throwError } from '../../common/utils';
import { HttpStatus } from '../../common/utils/http-status';

@Injectable()
export class ForumMessagesService {
  constructor(
    @InjectRepository(ForumMessage)
    private readonly messagesRepo: Repository<ForumMessage>,

    @InjectRepository(ForumConversation)
    private readonly conversationsRepo: Repository<ForumConversation>,

    @InjectRepository(ForumPublicProfile)
    private readonly profilesRepo: Repository<ForumPublicProfile>,

    @InjectRepository(ForumUserBlock)
    private readonly blocksRepo: Repository<ForumUserBlock>,

    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async sendMessage(senderId: number, dto: SendForumMessageDto) {
    const content = dto.content.trim();

    if (!content) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'Message content is required',
        'Message content is required',
        'MESSAGE_CONTENT_IS_REQUIRED',
      );
    }

    if (senderId === dto.recipientId) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'You cannot message yourself',
        'You cannot message yourself',
        'YOU_CANNOT_MESSAGE_YOURSELF',
      );
    }

    const recipientProfile = await this.profilesRepo.findOne({
      where: {
        userId: dto.recipientId,
        isForumEnabled: true,
        isBanned: false,
      },
    });

    if (!recipientProfile) {
      throwError(
        HttpStatus.NOT_FOUND,
        'Recipient forum profile not found',
        'Recipient forum profile not found',
        'RECIPIENT_FORUM_PROFILE_NOT_FOUND',
      );
    }

    if (!recipientProfile.allowDirectMessages) {
      throwError(
        HttpStatus.FORBIDDEN,
        'User does not accept direct messages',
        'User does not accept direct messages',
        'USER_DOES_NOT_ACCEPT_DIRECT_MESSAGES',
      );
    }

    const isBlocked = await this.blocksRepo.exists({
      where: [
        {
          blockerId: senderId,
          blockedUserId: dto.recipientId,
        },
        {
          blockerId: dto.recipientId,
          blockedUserId: senderId,
        },
      ],
    });

    if (isBlocked) {
      throwError(
        HttpStatus.FORBIDDEN,
        'Messaging is not allowed between these users',
        'Messaging is not allowed between these users',
        'MESSAGING_IS_NOT_ALLOWED_BETWEEN_THESE_USERS',
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const conversationRepo = manager.getRepository(ForumConversation);
      const messageRepo = manager.getRepository(ForumMessage);

      const { userOneId, userTwoId } = normalizeConversationUsers(
        senderId,
        dto.recipientId,
      );

      let conversation = await conversationRepo.findOne({
        where: {
          userOneId,
          userTwoId,
        },
      });

      const now = new Date();

      if (!conversation) {
        conversation = await conversationRepo.save(
          conversationRepo.create({
            userOneId,
            userTwoId,
            status: ForumConversationStatus.ACTIVE,
            lastMessageAt: now,
          }),
        );
      }

      if (conversation.status === ForumConversationStatus.BLOCKED) {
        throwError(
          HttpStatus.FORBIDDEN,
          'Conversation is blocked',
          'Conversation is blocked',
          'CONVERSATION_IS_BLOCKED',
        );
      }

      if (conversation.status === ForumConversationStatus.ARCHIVED) {
        await conversationRepo.update(conversation.id, {
          status: ForumConversationStatus.ACTIVE,
        });
      }

      const message = await messageRepo.save(
        messageRepo.create({
          conversationId: conversation.id,
          senderId,
          recipientId: dto.recipientId,
          content,
          status: ForumMessageStatus.SENT,
          isRead: false,
          readAt: null,
        }),
      );

      await conversationRepo.update(conversation.id, {
        lastMessageAt: now,
      });

      return message;
    });
  }

  async getConversationMessages(
    userId: number,
    conversationId: string,
    page = 1,
    limit = 50,
  ) {
    const conversation = await this.conversationsRepo.findOne({
      where: {
        id: conversationId,
      },
    });

    if (!conversation) {
      throwError(
        HttpStatus.NOT_FOUND,
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

    const safeLimit = Math.min(Math.max(limit || 50, 1), 100);
    const safePage = Math.max(page || 1, 1);

    const [items, total] = await this.messagesRepo.findAndCount({
      where: {
        conversationId,
        status: ForumMessageStatus.SENT,
        deletedAt: IsNull(),
      },
      order: {
        createdAt: 'DESC',
      },
      take: safeLimit,
      skip: (safePage - 1) * safeLimit,
      relations: {
        sender: true,
        recipient: true,
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

  async markConversationAsRead(userId: number, conversationId: string) {
    const conversation = await this.conversationsRepo.findOne({
      where: {
        id: conversationId,
      },
    });

    if (!conversation) {
      throwError(
        HttpStatus.NOT_FOUND,
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

    const now = new Date();

    await this.messagesRepo.update(
      {
        conversationId,
        recipientId: userId,
        isRead: false,
      },
      {
        isRead: true,
        readAt: now,
      },
    );

    return { success: true };
  }

  async getUnreadMessagesCount(userId: number) {
    const count = await this.messagesRepo.count({
      where: {
        recipientId: userId,
        isRead: false,
        status: ForumMessageStatus.SENT,
        deletedAt: IsNull(),
      },
    });

    return { count };
  }

  async deleteMessage(userId: number, messageId: string) {
    const message = await this.messagesRepo.findOne({
      where: {
        id: messageId,
      },
    });

    if (!message) {
      throwError(
        HttpStatus.NOT_FOUND,
        'Message not found',
        'Message not found',
        'MESSAGE_NOT_FOUND',
      );
    }

    if (message.senderId !== userId) {
      throwError(
        HttpStatus.FORBIDDEN,
        'You cannot delete this message',
        'You cannot delete this message',
        'YOU_CANNOT_DELETE_THIS_MESSAGE',
      );
    }

    await this.messagesRepo.softDelete(messageId);

    return { success: true };
  }
}
