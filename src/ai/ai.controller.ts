import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AiService } from './ai.service';
import { CreateAiCommentDto } from './dto';
import {
  ActiveUserData,
  ActiveUserDataT,
} from '../auth/decorators/active-user.decorator';
import { AuthGuard } from '@nestjs/passport';
import { PlanGuard } from './guards/plan.guard';

@UseGuards(AuthGuard('jwt'), PlanGuard)
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}
  @Post('generate-comment')
  async createAiComment(
    @ActiveUserData() user: ActiveUserDataT,
    @Body() data: { entryId: number; data: CreateAiCommentDto },
  ) {
    return this.aiService.createAiComment(user.id, data.entryId, data.data);
  }
}
