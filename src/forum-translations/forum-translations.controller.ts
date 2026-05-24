import { Body, Controller, Post } from '@nestjs/common';
import { ForumTranslationsService } from './forum-translations.service';
import { ForumTranslationTargetType } from './entities/forum-translation.entity';

@Controller('forum/translations')
export class ForumTranslationsController {
  constructor(
    private readonly forumTranslationsService: ForumTranslationsService,
  ) {}

  @Post()
  async translateForumContent(
    @Body()
    body: {
      targetLang: string;
      items: {
        targetType: ForumTranslationTargetType;
        targetId: string;
        text: string;
        mimeType?: 'text/plain' | 'text/html';
      }[];
    },
  ) {
    return this.forumTranslationsService.translateManyAndCache(body);
  }
}
