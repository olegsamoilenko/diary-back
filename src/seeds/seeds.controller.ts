import { Controller, Post } from '@nestjs/common';
import { SeedsService } from './seeds.service';

@Controller('seeds')
export class SeedsController {
  constructor(private readonly seedsService: SeedsService) {}
  // @Post('entries')
  // async createEntries() {
  //   return await this.seedsService.createEntries();
  // }

  // @Post('ai-comments')
  // async createAiComments() {
  //   return await this.seedsService.createAiComments();
  // }

  // @Post('dialogs')
  // async createPlans() {
  //   return await this.seedsService.createDialogs();
  // }
}
