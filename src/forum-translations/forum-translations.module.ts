import { Module } from '@nestjs/common';
import { ForumTranslationsService } from './forum-translations.service';
import { ForumTranslationsController } from './forum-translations.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ForumTranslation } from './entities/forum-translation.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ForumTranslation])],
  controllers: [ForumTranslationsController],
  providers: [ForumTranslationsService],
  exports: [ForumTranslationsService],
})
export class ForumTranslationsModule {}
