import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ForumReactionsService } from '../services/forum-reactions.service';
import { ToggleForumReactionDto } from '../dto/toggle-forum-reaction.dto';
import { ForumReactionTargetType } from '../types/forum-reaction-target-type.enum';
import { AuthGuard } from '@nestjs/passport';
import {
  ActiveUserData,
  ActiveUserDataT,
} from '../../auth/decorators/active-user.decorator';

@Controller('forum/reactions')
export class ForumReactionsController {
  constructor(private readonly reactionsService: ForumReactionsService) {}

  @UseGuards(AuthGuard('jwt'))
  @Post('toggle')
  toggleReaction(
    @ActiveUserData() user: ActiveUserDataT,
    @Body() dto: ToggleForumReactionDto,
  ) {
    return this.reactionsService.toggleReaction(user.id, dto);
  }

  @Get(':targetType/:targetId')
  getTargetReactions(
    @Param('targetType') targetType: ForumReactionTargetType,
    @Param('targetId') targetId: string,
  ) {
    return this.reactionsService.getTargetReactions(targetType, targetId);
  }
}
