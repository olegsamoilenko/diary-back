import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ForumNotification } from '../entities/forum-notification.entity';
import { Repository } from 'typeorm';
import { ForumNotificationType } from '../types/forum-notification-type.enum';
import { ForumNotificationEntityType } from '../types/forum-notification-entity-type.enum';

type CreateForumNotificationInput = {
  userId: number;
  type: ForumNotificationType;
  actorId?: number | null;
  entityType: ForumNotificationEntityType;
  entityId: string;
  topicId?: string | null;
  commentId?: string | null;
};

@Injectable()
export class ForumNotificationsService {
  constructor(
    @InjectRepository(ForumNotification)
    private readonly notificationsRepo: Repository<ForumNotification>,
  ) {}

  async create(input: CreateForumNotificationInput) {
    const notification = this.notificationsRepo.create({
      userId: input.userId,
      type: input.type,
      actorId: input.actorId ?? null,
      entityType: input.entityType,
      entityId: input.entityId,
      topicId: input.topicId ?? null,
      commentId: input.commentId ?? null,
      isRead: false,
      readAt: null,
    });

    return this.notificationsRepo.save(notification);
  }

  async createMany(inputs: CreateForumNotificationInput[]) {
    if (!inputs.length) return [];

    const notifications = this.notificationsRepo.create(
      inputs.map((input) => ({
        userId: input.userId,
        type: input.type,
        actorId: input.actorId ?? null,
        entityType: input.entityType,
        entityId: input.entityId,
        topicId: input.topicId ?? null,
        commentId: input.commentId ?? null,
        isRead: false,
        readAt: null,
      })),
    );

    return this.notificationsRepo.save(notifications);
  }

  async getMyNotifications(userId: number, page = 1, limit = 30) {
    const safeLimit = Math.min(Math.max(limit || 30, 1), 100);
    const safePage = Math.max(page || 1, 1);

    const [items, total] = await this.notificationsRepo.findAndCount({
      where: {
        userId,
      },
      order: {
        createdAt: 'DESC',
      },
      take: safeLimit,
      skip: (safePage - 1) * safeLimit,
      relations: {
        actor: true,
        topic: true,
        comment: true,
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

  async getUnreadCount(userId: number) {
    const count = await this.notificationsRepo.count({
      where: {
        userId,
        isRead: false,
      },
    });

    return { count };
  }

  async markAsRead(userId: number, notificationId: string) {
    await this.notificationsRepo.update(
      {
        id: notificationId,
        userId,
      },
      {
        isRead: true,
        readAt: new Date(),
      },
    );

    return { success: true };
  }

  async markAllAsRead(userId: number) {
    await this.notificationsRepo.update(
      {
        userId,
        isRead: false,
      },
      {
        isRead: true,
        readAt: new Date(),
      },
    );

    return { success: true };
  }
}
