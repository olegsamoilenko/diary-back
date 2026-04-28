import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ForumTopicsService } from '../services/forum-topics.service';
import { CreateForumTopicDto } from '../dto/create-forum-topic.dto';
import { UpdateForumTopicDto } from '../dto/update-forum-topic.dto';
import { AuthGuard } from '@nestjs/passport';
import {
  ActiveUserData,
  ActiveUserDataT,
} from '../../auth/decorators/active-user.decorator';

@Controller('forum/topics')
export class ForumTopicsController {
  constructor(private readonly topicsService: ForumTopicsService) {}

  @Get()
  getTopics(
    @Query('categoryId') categoryId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.topicsService.getTopics({
      categoryId,
      page: Number(page || 1),
      limit: Number(limit || 30),
    });
  }

  @Get(':topicId')
  getTopicById(@Param('topicId') topicId: string) {
    return this.topicsService.getTopicById(topicId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post()
  createTopic(
    @ActiveUserData() user: ActiveUserDataT,
    @Body() dto: CreateForumTopicDto,
  ) {
    return this.topicsService.createTopic(user.id, dto);
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch(':topicId')
  updateTopic(
    @ActiveUserData() user: ActiveUserDataT,
    @Param('topicId') topicId: string,
    @Body() dto: UpdateForumTopicDto,
  ) {
    return this.topicsService.updateTopic(user.id, topicId, dto);
  }

  @UseGuards(AuthGuard('jwt'))
  @Delete(':topicId')
  deleteTopic(
    @ActiveUserData() user: ActiveUserDataT,
    @Param('topicId') topicId: string,
  ) {
    return this.topicsService.deleteTopic(user.id, topicId);
  }
}
