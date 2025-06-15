import { Injectable } from '@nestjs/common';
import { DiaryService } from 'src/diary/diary.service';
import { AiService } from 'src/ai/ai.service';
import { fakeDiary } from './fakeData/fakeDiary';
import { fakeAiComments } from './fakeData/fakeAiComments';
import { PLANS } from 'src/plans/constants';
import { PlansService } from 'src/plans/plans.service';
import { DeepPartial } from 'typeorm';
import { Plan } from '../plans/entities/plan.entity';

@Injectable()
export class SeedsService {
  constructor(
    private readonly diaryService: DiaryService,
    private readonly aiService: AiService,
    private readonly plansService: PlansService,
  ) {}
  async createEntries(): Promise<boolean> {
    for (const entry of fakeDiary) {
      const { user, date, ...entryData } = entry;
      await this.diaryService.createEntry(entryData, user, date);
    }
    return true;
  }

  // async createPlans(): Promise<boolean> {
  //   for (const plan of PLANS) {
  //     await this.plansService.create(plan as Plan);
  //   }
  //   return true;
  // }

  //   async createAiComments(): Promise<boolean> {
  //     for (const comment of fakeAiComments) {
  //       const { entry, ...commentData } = comment;
  //       await this.aiService.createAiComment(entry.id, commentData);
  //     }
  //     return true;
  //   }
}
