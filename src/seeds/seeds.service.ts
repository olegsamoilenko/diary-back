import { Injectable } from '@nestjs/common';
import { DiaryService } from 'src/diary/diary.service';
import { AiService } from 'src/ai/ai.service';
import { fakeDiary } from './fakeData/fakeDiary';
import { fakeAiComments } from './fakeData/fakeAiComments';

@Injectable()
export class SeedsService {
  constructor(
    private readonly diaryService: DiaryService,
    private readonly aiService: AiService,
  ) {}
  async createEntries(): Promise<boolean> {
    for (const entry of fakeDiary) {
      const { user, date, ...entryData } = entry;
      await this.diaryService.createEntry(entryData, user, date);
    }
    return true;
  }

  //   async createAiComments(): Promise<boolean> {
  //     for (const comment of fakeAiComments) {
  //       const { entry, ...commentData } = comment;
  //       await this.aiService.createAiComment(entry.id, commentData);
  //     }
  //     return true;
  //   }
}
