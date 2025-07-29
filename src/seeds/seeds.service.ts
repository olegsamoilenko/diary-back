import { Injectable } from '@nestjs/common';
import { DiaryService } from 'src/diary/diary.service';
import { AiService } from 'src/ai/ai.service';
import { fakeDiary } from './fakeData/fakeDiary';
import { fakeAiComments } from './fakeData/fakeAiComments';
import { fakeDialogs } from './fakeData/fakeDialog';
import { PLANS } from 'src/plans/constants';
import { PlansService } from 'src/plans/plans.service';
import { DeepPartial, Repository } from 'typeorm';
import { Plan } from '../plans/entities/plan.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { AiComment } from '../ai/entities/aiComments.entity';
import { AIAnswer } from '../ai/entities/dialog.entity';
import { DiaryEntry } from '../diary/entities/diary.entity';
import { DiaryEntryDialog } from '../diary/entities/dialog.entity';
import { throwError } from '../common/utils';
import { HttpStatus } from '../common/utils/http-status';
import { UsersService } from 'src/users/users.service';
import truncate, { type IOptions } from 'truncate-html';

@Injectable()
export class SeedsService {
  constructor(
    @InjectRepository(AiComment)
    private aiCommentRepository: Repository<AiComment>,
    @InjectRepository(DiaryEntry)
    private diaryEntriesRepository: Repository<DiaryEntry>,
    @InjectRepository(DiaryEntryDialog)
    private diaryEntryDialogRepository: Repository<DiaryEntryDialog>,
    @InjectRepository(AIAnswer)
    private aiAnswerRepository: Repository<AIAnswer>,
    private readonly aiService: AiService,
    private readonly usersService: UsersService,
  ) {}
  async createEntries(): Promise<boolean> {
    const user = await this.usersService.findById(1);

    if (!user) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'User not found',
        'User with this id does not exist.',
      );
      return false;
    }

    for (const entry of fakeDiary) {
      const previewContent = truncate(entry.content, {
        length: 100,
      });

      const tags = await this.aiService.generateTagsForEntry(
        entry.content,
        entry.aiModel,
      );

      const createParams: Partial<DiaryEntry> = {
        ...entry,
        user,
        tags,
        previewContent: previewContent,
        createdAt: new Date(entry.date),
      };

      const newEntry = this.diaryEntriesRepository.create(createParams);

      await this.diaryEntriesRepository.save(newEntry);
    }
    return true;
  }

  async createAiComments(): Promise<boolean> {
    for (const comment of fakeAiComments) {
      const { entry, ...commentData } = comment;
      const aiComment = this.aiCommentRepository.create({
        content: commentData.content,
        entry: { id: entry.id },
      });

      await this.aiCommentRepository.save(aiComment);
    }
    return true;
  }

  // async createDialogs() {
  //   for (const dialog of fakeDialogs) {
  //     const { entryId, content, answer } = dialog;
  //     const diaryDialog = this.diaryEntryDialogRepository.create({
  //       entry: { id: entryId },
  //       content,
  //     });
  //     const savedDiaryDialog =
  //       await this.diaryEntryDialogRepository.save(diaryDialog);
  //
  //     const aiAnswer = this.aiAnswerRepository.create({
  //       content: answer.content,
  //       question: savedDiaryDialog,
  //     });
  //
  //     await this.aiAnswerRepository.save(aiAnswer);
  //   }
  //   return true;
  // }
}
