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
import { GetForumTopicsDto } from '../dto/get-forum-topics.dto';

@Controller('forum/topics')
export class ForumTopicsController {
  constructor(private readonly topicsService: ForumTopicsService) {}

  @UseGuards(AuthGuard('jwt'))
  @Post('get')
  getTopics(
    @ActiveUserData() user: ActiveUserDataT,
    @Body() dto: GetForumTopicsDto,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.topicsService.getTopics({
      userId: user.id,
      categories: dto.categories,
      sort: dto.sort,
      showTopics: dto.showTopics,
      page: Number(page || 1),
      limit: Number(limit || 30),
    });
  }

  @UseGuards(AuthGuard('jwt'))
  @Get(':topicId')
  getTopicById(
    @ActiveUserData() user: ActiveUserDataT,
    @Param('topicId') topicId: string,
  ) {
    return this.topicsService.getTopicById(topicId, user.id);
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
