import { Controller } from '@nestjs/common';
import { ForumService } from '../services/forum.service';

@Controller('forum')
export class ForumController {
  constructor(private readonly forumService: ForumService) {}
}
