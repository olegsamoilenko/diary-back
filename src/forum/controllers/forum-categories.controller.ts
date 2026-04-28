import { Controller, Get } from '@nestjs/common';
import { ForumCategoriesService } from '../services/forum-categories.service';

@Controller('forum/categories')
export class ForumCategoriesController {
  constructor(private readonly service: ForumCategoriesService) {}

  @Get()
  getCategories() {
    return this.service.findAllActive();
  }
}
