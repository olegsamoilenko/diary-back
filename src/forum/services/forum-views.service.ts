import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ForumView } from '../entities/forum-view.entity';
import { ForumTopic } from '../entities/forum-topic.entity';
import { ForumContentStatus } from '../types/forum-content-status.enum';

@Injectable()
export class ForumViewsService {
  constructor(
    @InjectRepository(ForumView)
    private readonly viewsRepo: Repository<ForumView>,

    @InjectRepository(ForumTopic)
    private readonly topicsRepo: Repository<ForumTopic>,

    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async registerTopicView(userId: number, topicId: string) {
    const topicExists = await this.topicsRepo.exists({
      where: {
        id: topicId,
        status: ForumContentStatus.PUBLISHED,
      },
    });

    if (!topicExists) {
      throw new NotFoundException('Topic not found');
    }

    return this.dataSource.transaction(async (manager) => {
      const viewRepo = manager.getRepository(ForumView);
      const topicRepo = manager.getRepository(ForumTopic);

      const existingView = await viewRepo.findOne({
        where: {
          userId,
          topicId,
        },
      });

      const now = new Date();

      if (existingView) {
        await viewRepo.update(existingView.id, {
          viewedAt: now,
        });

        return {
          counted: false,
        };
      }

      await viewRepo.save(
        viewRepo.create({
          userId,
          topicId,
          viewedAt: now,
        }),
      );

      await topicRepo.update(topicId, {
        viewsCount: () => '"views_count" + 1',
      });

      return {
        counted: true,
      };
    });
  }
}
