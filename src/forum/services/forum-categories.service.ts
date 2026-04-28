import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ForumCategory } from '../entities/forum-category.entity';

@Injectable()
export class ForumCategoriesService {
  constructor(
    @InjectRepository(ForumCategory)
    private readonly repo: Repository<ForumCategory>,
  ) {}

  async findAllActive() {
    return this.repo.find({
      where: { isActive: true },
      order: {
        sortOrder: 'ASC',
        title: 'ASC',
      },
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        icon: true,
        sortOrder: true,
      },
    });
  }
}
