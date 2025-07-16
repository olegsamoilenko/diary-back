import { Injectable } from '@nestjs/common';
import { DiaryEntry } from './entities/diary.entity';
import {
  CreateDiaryEntryDto,
  DialogDto,
  GetDiaryEntriesByDayDto,
  GetMoodsByDateDto,
} from './dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, Not, IsNull } from 'typeorm';
import { AiService } from 'src/ai/ai.service';
import { UsersService } from 'src/users/users.service';
import { throwError, offsetToTimezoneStr } from 'src/common/utils';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { MAX_TOKENS } from 'src/ai/constants';
import { encoding_for_model, TiktokenModel } from 'tiktoken';
import { OpenAiMessage } from 'src/ai/types';
import { MoodByDate } from './types';
import { HttpStatus } from 'src/common/utils/http-status';
import { DiaryEntrySetting } from './entities/setting.entity';
import truncate from 'truncate-html';
import { DiaryEntryDialog } from './entities/dialog.entity';
import { DiaryEntryDialogResponseDto } from './dto';

dayjs.extend(utc);
dayjs.extend(timezone);

@Injectable()
export class DiaryService {
  constructor(
    @InjectRepository(DiaryEntry)
    private diaryEntriesRepository: Repository<DiaryEntry>,
    @InjectRepository(DiaryEntrySetting)
    private diaryEntrySettingsRepository: Repository<DiaryEntrySetting>,
    @InjectRepository(DiaryEntryDialog)
    private diaryEntryDialogRepository: Repository<DiaryEntryDialog>,
    private aiService: AiService,
    private usersService: UsersService,
  ) {}
  async createEntry(
    entryData: CreateDiaryEntryDto,
    userId: number,
    createdAt?: Date | string,
  ): Promise<DiaryEntry | undefined> {
    const user = await this.usersService.findById(userId);

    if (!user) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'User not found',
        'User with this id does not exist.',
      );
      return;
    }

    const { settings, ...rest } = entryData;

    let entrySettings: DiaryEntrySetting | undefined;
    if (settings) {
      const createSettings = this.diaryEntrySettingsRepository.create({
        ...settings,
      });

      entrySettings =
        await this.diaryEntrySettingsRepository.save(createSettings);
    }

    const previewContent = truncate(rest.content, {
      length: 100,
    });

    const embedding = await this.aiService.getEmbedding(
      entryData.content
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim(),
    );
    const createParams: Partial<DiaryEntry> = {
      ...rest,
      settings: entrySettings,
      previewContent,
      user,
      embedding,
    };
    if (createdAt) {
      createParams.createdAt = new Date(createdAt);
    }

    const newEntry = this.diaryEntriesRepository.create(createParams);

    return await this.diaryEntriesRepository.save(newEntry);
  }

  async getEntriesByDate(
    userId: number,
    getDiaryEntriesByDayDto: GetDiaryEntriesByDayDto,
  ): Promise<DiaryEntry[] | undefined> {
    const user = await this.usersService.findById(userId);

    if (!user) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'User not found',
        'User with this id does not exist.',
      );
      return;
    }

    const { date, timeZone } = getDiaryEntriesByDayDto;

    const startLocal = dayjs.tz(`${date} 00:00:00`, timeZone);
    const endLocal = dayjs.tz(`${date} 23:59:59.999`, timeZone);

    const startUTC = startLocal.utc().toDate();
    const endUTC = endLocal.utc().toDate();

    const entries = await this.diaryEntriesRepository.find({
      where: {
        user,
        createdAt: Between(startUTC, endUTC),
      },
      select: ['id', 'title', 'content', 'previewContent', 'mood', 'createdAt'],
      order: {
        createdAt: 'DESC',
      },
      relations: ['user', 'aiComment', 'dialogs', 'dialogs', 'settings'],
    });

    return entries
      .map((entry) => {
        const dialogsSorted = (entry.dialogs || []).sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );

        const createdAtLocal = dayjs.utc(entry.createdAt).tz(timeZone);
        const dateObj = createdAtLocal.toDate();

        return {
          ...entry,
          dialogs: dialogsSorted,
          createdAtLocal: createdAtLocal.format('YYYY-MM-DD HH:mm:ss'),
          dateObj,
        };
      })
      .sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime());
  }

  async getMoodsByDate(
    userId: number,
    getMoodsByDateDto: GetMoodsByDateDto,
  ): Promise<Record<string, MoodByDate[]> | undefined> {
    const user = await this.usersService.findById(userId);

    if (!user) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'User not found',
        'User with this id does not exist.',
      );
      return;
    }

    const { year, month, offsetMinutes } = getMoodsByDateDto;

    const tz = offsetToTimezoneStr(offsetMinutes);

    const startDate = new Date(Date.UTC(year, month - 2, 1, 0, 0, 0));
    const endDate = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0));

    const rows = await this.diaryEntriesRepository
      .createQueryBuilder('entry')
      .select([
        `to_char(("entry"."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE '${tz}'), 'YYYY-MM-DD') as date`,
        `("entry"."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE '${tz}') as "createdAt"`,
        '"entry"."mood" as mood',
      ])
      .where('entry.userId = :userId', { userId })
      .andWhere('entry.createdAt >= :startDate', { startDate })
      .andWhere('entry.createdAt < :endDate', { endDate })
      .orderBy('"createdAt"', 'ASC')
      .getRawMany<{
        date: string;
        createdAt: string;
        mood: number;
      }>();

    const result: Record<string, MoodByDate[]> = {};
    for (const row of rows) {
      if (!result[row.date]) result[row.date] = [];
      result[row.date].push({
        createdAt: row.createdAt,
        mood: row.mood,
      });
    }

    return result;
  }

  async getEntryById(id: number): Promise<DiaryEntry | null> {
    return await this.diaryEntriesRepository.findOne({
      where: { id },
    });
  }

  async generatePromptSemantic(
    userId: number,
    entryId: number,
    embedding: number[],
    model: TiktokenModel,
  ): Promise<OpenAiMessage[]> {
    const relevantEntries = await this.findRelevantEntries(
      userId,
      entryId,
      embedding,
    );

    const enc = encoding_for_model(model);
    let tokens = 0;
    const promptMessages: OpenAiMessage[] = [];
    for (const entry of relevantEntries) {
      const msg: OpenAiMessage = {
        role: 'user',
        content: `Схожий запис: дата: "${entry.createdAt.toISOString()}", контент: "${entry.content
          .replace(/<[^>]*>/g, '')
          .replace(/&nbsp;/g, ' ')
          .trim()}", настрій: ${entry.mood}`,
      };
      const entryTokens = enc.encode(msg.content).length;
      if (tokens + entryTokens > MAX_TOKENS) break;
      promptMessages.push(msg);
      tokens += entryTokens;
    }

    const entry = await this.diaryEntriesRepository.findOne({
      where: { id: entryId, user: { id: userId } },
    });

    if (!entry) {
      throwError(
        HttpStatus.NOT_FOUND,
        'Entry not found',
        'Diary entry with this id does not exist.',
      );
      return [];
    }

    entry.prompt = JSON.stringify(promptMessages);
    await this.diaryEntriesRepository.save(entry);

    console.log('tokens', tokens);
    return promptMessages;
  }

  async findRelevantEntries(
    userId: number,
    entryId: number,
    newEmbedding: number[],
  ): Promise<DiaryEntry[]> {
    const entries = await this.diaryEntriesRepository.find({
      where: { user: { id: userId }, embedding: Not(IsNull()) },
      select: ['id', 'content', 'mood', 'embedding', 'createdAt'],
      order: { createdAt: 'ASC' },
    });

    const THRESHOLD = 0.5;
    const withScores = entries
      .filter((entry) => entry.id !== entryId)
      .map((entry) => {
        const score = this.cosineSimilarity(newEmbedding, entry.embedding);
        return { ...entry, score };
      });

    return withScores.filter((entry) => entry.score >= THRESHOLD).slice(0, 200);
  }

  cosineSimilarity(a: number[], b: number[]): number {
    const dot = a.reduce((sum, v, i) => sum + v * b[i], 0);
    const normA = Math.sqrt(a.reduce((sum, v) => sum + v * v, 0));
    const normB = Math.sqrt(b.reduce((sum, v) => sum + v * v, 0));
    if (normA === 0 || normB === 0) return 0;
    return dot / (normA * normB);
  }

  async findOllDialogsByEntryId(
    entryId: number,
  ): Promise<DiaryEntryDialog[] | undefined> {
    return await this.diaryEntryDialogRepository.find({
      where: { entry: { id: entryId } },
      order: { createdAt: 'ASC' },
    });
  }

  async dialog(
    userId: number,
    dialogDto: DialogDto,
  ): Promise<DiaryEntryDialogResponseDto | undefined> {
    const user = await this.usersService.findById(userId);

    if (!user) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'User not found',
        'User with this id does not exist.',
      );
      return;
    }

    const entry = await this.diaryEntriesRepository.findOne({
      where: { id: dialogDto.entryId, user },
    });

    if (!entry) {
      throwError(
        HttpStatus.NOT_FOUND,
        'Entry not found',
        'Diary entry with this id does not exist.',
      );
      return;
    }

    const answer: string = await this.aiService.getAnswerToQuestion(
      dialogDto.question,
      entry,
    );

    if (!answer) {
      throwError(
        HttpStatus.INTERNAL_SERVER_ERROR,
        'AI service error',
        'Failed to get an answer from AI service.',
      );
      return;
    }

    const dialog = this.diaryEntryDialogRepository.create({
      question: dialogDto.question,
      answer,
      entry,
    });

    const savedDialog = await this.diaryEntryDialogRepository.save(dialog);

    return {
      id: savedDialog.id,
      question: savedDialog.question,
      answer: savedDialog.answer,
      createdAt: savedDialog.createdAt,
    };
  }

  async deleteEntry(entryId: number): Promise<boolean> {
    const entry = await this.diaryEntriesRepository.findOne({
      where: { id: entryId },
      relations: ['settings', 'dialogs', 'aiComment'],
    });

    if (!entry) {
      throwError(
        HttpStatus.NOT_FOUND,
        'Entry not found',
        'Diary entry with this id does not exist.',
      );
    }

    if (entry?.dialogs && entry.dialogs.length > 0) {
      await this.diaryEntryDialogRepository.remove(entry.dialogs);
    }

    if (entry?.aiComment) {
      await this.aiService.deleteAiComment(entry.aiComment.id);
    }
    if (entry) {
      await this.diaryEntriesRepository.remove(entry);
    }

    if (entry?.settings) {
      await this.diaryEntrySettingsRepository.remove(entry.settings);
    }

    return true;
  }
}
