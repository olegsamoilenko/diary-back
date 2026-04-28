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

      if (dto.targetType === ForumReportTargetType.TOPIC) {
        await topicsRepo.update(dto.targetId, {
          reportsCount: () => '"reports_count" + 1',
        });
      }

      if (dto.targetType === ForumReportTargetType.COMMENT) {
        await commentsRepo.update(dto.targetId, {
          reportsCount: () => '"reports_count" + 1',
        });
      }

      return report;
    });
  }

  async getMyReports(userId: number, page = 1, limit = 30) {
    const safeLimit = Math.min(Math.max(limit || 30, 1), 100);
    const safePage = Math.max(page || 1, 1);

    const [items, total] = await this.reportsRepo.findAndCount({
      where: {
        reporterId: userId,
      },
      order: {
        createdAt: 'DESC',
      },
      take: safeLimit,
      skip: (safePage - 1) * safeLimit,
    });

    return {
      items,
      total,
      page: safePage,
      limit: safeLimit,
      hasMore: safePage * safeLimit < total,
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

      if (!exists) throw new NotFoundException('Topic not found');
      return;
    }

    if (targetType === ForumReportTargetType.COMMENT) {
      const exists = await this.commentsRepo.exists({
        where: { id: targetId },
      });

      if (!exists) throw new NotFoundException('Comment not found');
      return;
    }

    if (targetType === ForumReportTargetType.USER) {
      const exists = await this.usersRepo.exists({
        where: { id: Number(targetId) },
      });

      if (!exists) throw new NotFoundException('User not found');
      return;
    }

    if (targetType === ForumReportTargetType.MESSAGE) {
      // Підключимо після forum_messages
      return;
    }

    throw new BadRequestException('Invalid report target type');
  }
}
