import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ForumUserRestriction } from '../entities/forum-user-restrictions.entity';
import { RestrictForumUserDto } from '../dto/restrict-forum-user.dto';
import { UnrestrictForumUserDto } from '../dto/unrestrict-forum-user.dto';
import { ForumModerationLogsService } from './forum-moderation-logs.service';
import { ForumModerationAction } from '../types/forum-moderation-action.enum';
import { ForumModerationTargetType } from '../types/forum-moderation-target-type.enum';
import { UsersService } from 'src/users/users.service';
import { getForumRestrictUserPushText } from '../../push-notifications/utils/getForumRestrictUserPushText';
import { PushNotificationsService } from '../../push-notifications/push-notifications.service';
import { getForumUnrestrictUserPushText } from '../../push-notifications/utils/getForumUnrestrictUserPushText';
import { throwError } from 'src/common/utils';
import { HttpStatus } from 'src/common/utils/http-status';

@Injectable()
export class ForumUserRestrictionsService {
  constructor(
    @InjectRepository(ForumUserRestriction)
    private readonly restrictionRepo: Repository<ForumUserRestriction>,

    private readonly moderationLogsService: ForumModerationLogsService,

    private readonly usersService: UsersService,

    private readonly pushNotificationsService: PushNotificationsService,
  ) {}

  async restrictUser(userId: number, dto: RestrictForumUserDto) {
    if (!userId || Number.isNaN(userId)) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'Invalid user id',
        'Invalid user id',
        'INVALID_USER_ID',
      );
    }

    const startsAt = new Date(dto.startsAt);
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : null;

    if (Number.isNaN(startsAt.getTime())) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'Invalid startsAt',
        'Invalid startsAt',
        'INVALID_STARTS_AT',
      );
    }

    if (endsAt && Number.isNaN(endsAt.getTime())) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'Invalid endsAt',
        'Invalid endsAt',
        'INVALID_ENDS_AT',
      );
    }

    if (endsAt && endsAt <= startsAt) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'endsAt must be after startsAt',
        'endsAt must be after startsAt',
        'ENDS_AT_MUST_BE_AFTER_STARTS_AT',
      );
    }

    const user = await this.usersService.findById(userId, ['settings']);

    if (!user) {
      throwError(
        HttpStatus.NOT_FOUND,
        'User not found',
        'User not found',
        'USER_NOT_FOUND',
      );
    }

    const now = new Date();

    const activeRestriction = await this.restrictionRepo
      .createQueryBuilder('restriction')
      .where('restriction.user_id = :userId', { userId })
      .andWhere('restriction.is_active = true')
      .andWhere('restriction.lifted_at IS NULL')
      .andWhere('restriction.starts_at <= :now', { now })
      .andWhere('(restriction.ends_at IS NULL OR restriction.ends_at > :now)', {
        now,
      })
      .orderBy('restriction.created_at', 'DESC')
      .getOne();

    if (activeRestriction) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'User already has an active restriction',
        'User already has an active restriction',
        'USER_ALREADY_HAS_AN_ACTIVE_RESTRICTION',
      );
    }

    const restriction = await this.restrictionRepo.save(
      this.restrictionRepo.create({
        userId,
        type: dto.type,
        reason: dto.reason?.trim() || null,
        violationCount: dto.violationCount,
        createdByAdminId: dto.createdByAdminId,
        isActive: true,
        startsAt,
        endsAt,
        liftedAt: null,
        liftedByAdminId: null,
      }),
    );

    await this.moderationLogsService.create({
      moderatorId: dto.createdByAdminId,
      targetUserId: userId,
      action: ForumModerationAction.RESTRICT_USER,
      targetType: ForumModerationTargetType.USER,
      targetId: String(userId),
      reason: null,
      note: dto.reason?.trim() || null,
      metadataJson: {
        restrictionId: restriction.id,
        type: restriction.type,
        violationCount: restriction.violationCount,
        startsAt: restriction.startsAt,
        endsAt: restriction.endsAt,
      },
    });

    const userLang = user.settings?.lang || user.settings?.locale || 'en';

    const text = getForumRestrictUserPushText({
      locale: userLang,
      type: restriction.type,
      reason: restriction.reason?.trim() || null,
      endsAt: restriction.endsAt,
    });

    await this.pushNotificationsService.sendForumUserRestrictedPush({
      userId: userId,
      title: text.title,
      body: text.body,
    });

    return {
      success: true,
      restriction,
    };
  }

  async unrestrictUser(userId: number, dto: UnrestrictForumUserDto) {
    if (!userId || Number.isNaN(userId)) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'Invalid user id',
        'Invalid user id',
        'INVALID_USER_ID',
      );
    }

    const user = await this.usersService.findById(userId, ['settings']);

    if (!user) {
      throwError(
        HttpStatus.NOT_FOUND,
        'User not found',
        'User not found',
        'USER_NOT_FOUND',
      );
    }

    const now = new Date();

    const activeRestriction = await this.restrictionRepo
      .createQueryBuilder('restriction')
      .where('restriction.user_id = :userId', { userId })
      .andWhere('restriction.is_active = true')
      .andWhere('restriction.lifted_at IS NULL')
      .andWhere('restriction.starts_at <= :now', { now })
      .andWhere('(restriction.ends_at IS NULL OR restriction.ends_at > :now)', {
        now,
      })
      .orderBy('restriction.created_at', 'DESC')
      .getOne();

    if (!activeRestriction) {
      throwError(
        HttpStatus.NOT_FOUND,
        'Active restriction not found',
        'Active restriction not found',
        'ACTIVE_RESTRICTION_NOT_FOUND',
      );
    }

    activeRestriction.isActive = false;
    activeRestriction.liftedAt = now;
    activeRestriction.liftedByAdminId = dto.createdByAdminId;

    const restriction = await this.restrictionRepo.save(activeRestriction);

    await this.moderationLogsService.create({
      moderatorId: dto.createdByAdminId,
      targetUserId: userId,
      action: ForumModerationAction.UNRESTRICT_USER,
      targetType: ForumModerationTargetType.USER,
      targetId: String(userId),
      reason: null,
      note: null,
      metadataJson: {
        restrictionId: restriction.id,
        type: restriction.type,
        violationCount: restriction.violationCount,
        originalStartsAt: restriction.startsAt,
        originalEndsAt: restriction.endsAt,
        liftedAt: restriction.liftedAt,
      },
    });

    const userLang = user.settings?.lang || user.settings?.locale || 'en';

    const text = getForumUnrestrictUserPushText({
      locale: userLang,
    });

    await this.pushNotificationsService.sendForumUserUnrestrictedPush({
      userId: userId,
      title: text.title,
      body: text.body,
    });

    return {
      success: true,
      restriction,
    };
  }

  async getActiveUserRestriction(userId: number) {
    if (!userId || Number.isNaN(userId)) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'Invalid user id',
        'Invalid user id',
        'INVALID_USER_ID',
      );
    }

    const restriction = await this.getActiveRestrictionQuery(userId)
      .leftJoinAndSelect('restriction.user', 'user')
      .leftJoinAndSelect('restriction.createdByAdmin', 'createdByAdmin')
      .getOne();

    return {
      isRestricted: !!restriction,
      restriction,
    };
  }

  async isUserRestricted(userId: number) {
    if (!userId || Number.isNaN(userId)) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'Invalid user id',
        'Invalid user id',
        'INVALID_USER_ID',
      );
    }

    const restriction = await this.getActiveRestrictionQuery(userId).getOne();

    return {
      isRestricted: !!restriction,
      restriction: restriction
        ? {
            type: restriction.type,
            reason: restriction.reason,
            startsAt: restriction.startsAt,
            endsAt: restriction.endsAt,
          }
        : null,
    };
  }

  async assertCanWrite(userId: number) {
    const result = await this.isUserRestricted(userId);

    if (result.isRestricted) {
      throwError(
        HttpStatus.FORBIDDEN,
        'Your community posting is restricted',
        'Your community posting is restricted',
        'YOUR_COMMUNITY_POSTING_IS_RESTRICTED',
      );
    }
  }

  private getActiveRestrictionQuery(userId: number) {
    const now = new Date();

    return this.restrictionRepo
      .createQueryBuilder('restriction')
      .where('restriction.user_id = :userId', { userId })
      .andWhere('restriction.is_active = true')
      .andWhere('restriction.lifted_at IS NULL')
      .andWhere('restriction.starts_at <= :now', { now })
      .andWhere('(restriction.ends_at IS NULL OR restriction.ends_at > :now)', {
        now,
      })
      .orderBy('restriction.created_at', 'DESC');
  }
}
