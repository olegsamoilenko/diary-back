import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ForumReport } from '../entities/forum-report.entity';
import { ForumTopic } from '../entities/forum-topic.entity';
import { ForumComment } from '../entities/forum-comment.entity';
import { User } from 'src/users/entities/user.entity';
import { CreateForumReportDto } from '../dto/create-forum-report.dto';
import { ForumReportTargetType } from '../types/forum-report-target-type.enum';
import { ForumReportStatus } from '../types/forum-report-status.enum';
import { throwError } from '../../common/utils';
import { HttpStatus } from '../../common/utils/http-status';
import { ForumPublicProfile } from '../entities/forum-public-profile.entity';
import { sendForumReportsTelegram } from '../../telegram/send-telegram';
import { formatForumReportTelegram } from '../utils/telegram-feed-formatter';
import { UserSettings } from 'src/users/entities/user-settings.entity';

@Injectable()
export class ForumReportsService {
  constructor(
    @InjectRepository(ForumReport)
    private readonly reportsRepo: Repository<ForumReport>,

    @InjectRepository(ForumTopic)
    private readonly topicsRepo: Repository<ForumTopic>,

    @InjectRepository(ForumComment)
    private readonly commentsRepo: Repository<ForumComment>,

    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,

    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async createReport(userId: number, dto: CreateForumReportDto) {
    await this.ensureTargetExists(dto.targetType, dto.targetId);

    return this.dataSource.transaction(async (manager) => {
      const reportsRepo = manager.getRepository(ForumReport);
      const topicsRepo = manager.getRepository(ForumTopic);
      const commentsRepo = manager.getRepository(ForumComment);
      const forumPublicProfileRepo = manager.getRepository(ForumPublicProfile);

      const existingReport = await reportsRepo.findOne({
        where: {
          reporterId: userId,
          targetType: dto.targetType,
          targetId: dto.targetId,
        },
        select: {
          id: true,
        },
      });

      if (existingReport) {
        throwError(
          HttpStatus.CONFLICT,
          'Report already exists',
          'You have already reported this content.',
          'FORUM_REPORT_ALREADY_EXISTS',
        );
      }

      const report = await reportsRepo.save(
        reportsRepo.create({
          reporterId: userId,
          targetType: dto.targetType,
          targetId: dto.targetId,
          reason: dto.reason,
          details: dto.details?.trim() || null,
          status: ForumReportStatus.PENDING,
        }),
      );

      const authorPublicProfile = await forumPublicProfileRepo.findOne({
        where: { userId: userId },
        select: {
          username: true,
        },
      });

      const reporterNickname =
        authorPublicProfile?.username?.trim() || 'Someone';

      let topic: ForumTopic | null = null;
      let comment: ForumComment | null = null;

      if (dto.targetType === ForumReportTargetType.TOPIC) {
        topic = await topicsRepo.findOne({
          where: { id: dto.targetId },
          select: {
            id: true,
            title: true,
            content: true,
            authorId: true,
          },
        });

        await topicsRepo.update(dto.targetId, {
          reportsCount: () => '"reports_count" + 1',
        });
      }

      if (dto.targetType === ForumReportTargetType.COMMENT) {
        comment = await commentsRepo.findOne({
          where: { id: dto.targetId },
          select: {
            id: true,
            content: true,
            topicId: true,
            authorId: true,
          },
        });

        await commentsRepo.update(dto.targetId, {
          reportsCount: () => '"reports_count" + 1',
        });
      }

      const targetAuthorId =
        dto.targetType === ForumReportTargetType.TOPIC
          ? topic?.authorId
          : comment?.authorId;

      const targetAuthorPublicProfile = targetAuthorId
        ? await forumPublicProfileRepo.findOne({
            where: { userId: targetAuthorId },
            select: {
              username: true,
            },
          })
        : null;

      const targetAuthorNickname =
        targetAuthorPublicProfile?.username?.trim() || 'Unknown';

      void sendForumReportsTelegram(
        formatForumReportTelegram({
          reportId: report.id,
          targetType: report.targetType,
          targetId: report.targetId,
          reason: report.reason,
          details: report.details,

          reporterId: userId,
          reporterNickname,

          topicId: topic?.id ?? null,
          topicTitle: topic?.title ?? null,
          topicContent: topic?.content ?? null,

          commentId: comment?.id ?? null,
          commentContent: comment?.content ?? null,

          targetAuthorId: targetAuthorId ?? null,
          targetAuthorNickname,
        }),
      );

      return report;
    });
  }

  async getReports(page = 1, limit = 20, reportId?: string) {
    const safeLimit = Math.min(Math.max(limit || 20, 1), 100);
    const safePage = Math.max(page || 1, 1);
    const safeReportId = reportId?.trim();

    const reportsQb = this.reportsRepo
      .createQueryBuilder('report')
      .leftJoinAndSelect('report.reporter', 'reporter')
      .leftJoinAndMapOne(
        'report.reporterProfile',
        ForumPublicProfile,
        'reporterProfile',
        'reporterProfile.userId = report.reporterId',
      )
      .orderBy('report.createdAt', 'DESC');

    if (safeReportId) {
      reportsQb.where('report.id = :reportId', { reportId: safeReportId });
    } else {
      reportsQb.take(safeLimit).skip((safePage - 1) * safeLimit);
    }

    const countQb = this.reportsRepo.createQueryBuilder('report');

    if (safeReportId) {
      countQb.where('report.id = :reportId', { reportId: safeReportId });
    }

    const total = await countQb.getCount();
    const reports = await reportsQb.getMany();

    const topicIds = reports
      .filter((report) => report.targetType === ForumReportTargetType.TOPIC)
      .map((report) => report.targetId);

    const commentIds = reports
      .filter((report) => report.targetType === ForumReportTargetType.COMMENT)
      .map((report) => report.targetId);

    const topics = topicIds.length
      ? await this.topicsRepo
          .createQueryBuilder('topic')
          .leftJoinAndMapOne(
            'topic.author',
            User,
            'author',
            'author.id = topic.authorId',
          )
          .leftJoinAndMapOne(
            'topic.authorProfile',
            ForumPublicProfile,
            'authorProfile',
            'authorProfile.userId = topic.authorId',
          )
          .leftJoinAndMapOne(
            'topic.authorSettings',
            UserSettings,
            'authorSettings',
            'authorSettings.userId = topic.authorId',
          )
          .where('topic.id IN (:...topicIds)', { topicIds })
          .getMany()
      : [];

    const comments = commentIds.length
      ? await this.commentsRepo
          .createQueryBuilder('comment')
          .leftJoinAndMapOne(
            'comment.author',
            User,
            'author',
            'author.id = comment.authorId',
          )
          .leftJoinAndMapOne(
            'comment.authorProfile',
            ForumPublicProfile,
            'authorProfile',
            'authorProfile.userId = comment.authorId',
          )
          .leftJoinAndMapOne(
            'comment.authorSettings',
            UserSettings,
            'authorSettings',
            'authorSettings.userId = comment.authorId',
          )
          .leftJoinAndMapOne(
            'comment.topic',
            ForumTopic,
            'topic',
            'topic.id = comment.topicId',
          )
          .leftJoinAndMapOne(
            'topic.author',
            User,
            'topicAuthor',
            'topicAuthor.id = topic.authorId',
          )
          .leftJoinAndMapOne(
            'topic.authorProfile',
            ForumPublicProfile,
            'topicAuthorProfile',
            'topicAuthorProfile.userId = topic.authorId',
          )
          .leftJoinAndMapOne(
            'topic.authorSettings',
            UserSettings,
            'topicAuthorSettings',
            'topicAuthorSettings.userId = topic.authorId',
          )
          .where('comment.id IN (:...commentIds)', { commentIds })
          .getMany()
      : [];

    const topicsById = new Map(topics.map((topic) => [topic.id, topic]));
    const commentsById = new Map(
      comments.map((comment) => [comment.id, comment]),
    );

    const items = reports.map((report) => ({
      ...report,
      topic:
        report.targetType === ForumReportTargetType.TOPIC
          ? (topicsById.get(report.targetId) ?? null)
          : null,
      comment:
        report.targetType === ForumReportTargetType.COMMENT
          ? (commentsById.get(report.targetId) ?? null)
          : null,
    }));

    const pageCount = Math.ceil(total / safeLimit);

    return {
      items,
      total,
      page: safePage,
      pageCount,
      limit: safeLimit,
      hasMore: safeReportId ? false : safePage * safeLimit < total,
    };
  }

  async updateReportStatus(params: {
    reportId: string;
    status: ForumReportStatus;
    adminId: number;
  }) {
    const report = await this.reportsRepo.findOne({
      where: { id: params.reportId },
      select: {
        id: true,
      },
    });

    if (!report) {
      throwError(
        HttpStatus.NOT_FOUND,
        'Forum report not found',
        'Forum report not found',
        'FORUM_REPORT_NOT_FOUND',
      );
    }

    const reviewedAt = new Date();

    await this.reportsRepo.update(params.reportId, {
      status: params.status,
      reviewedBy: params.adminId,
      reviewedAt,
    });

    return {
      id: params.reportId,
      status: params.status,
      reviewedBy: params.adminId,
      reviewedAt,
    };
  }

  private async ensureTargetExists(
    targetType: ForumReportTargetType,
    targetId: string,
  ) {
    if (targetType === ForumReportTargetType.TOPIC) {
      const exists = await this.topicsRepo.exists({
        where: { id: targetId },
      });

      if (!exists) {
        throwError(
          HttpStatus.NOT_FOUND,
          'Topic not found',
          'Topic not found',
          'TOPIC_NOT_FOUND',
        );
      }
      return;
    }

    if (targetType === ForumReportTargetType.COMMENT) {
      const exists = await this.commentsRepo.exists({
        where: { id: targetId },
      });

      if (!exists) {
        throwError(
          HttpStatus.NOT_FOUND,
          'Comment not found',
          'Comment not found',
          'COMMENT_NOT_FOUND',
        );
      }
      return;
    }

    if (targetType === ForumReportTargetType.USER) {
      const exists = await this.usersRepo.exists({
        where: { id: Number(targetId) },
      });

      if (!exists) {
        throwError(
          HttpStatus.NOT_FOUND,
          'User not found',
          'User not found',
          'USER_NOT_FOUND',
        );
      }
      return;
    }

    if (targetType === ForumReportTargetType.MESSAGE) {
      // Підключимо після forum_messages
      return;
    }

    throwError(
      HttpStatus.BAD_REQUEST,
      'Invalid report target type',
      'Invalid report target type',
      'INVALID_REPORT_TARGET_TYPE',
    );
  }
}
