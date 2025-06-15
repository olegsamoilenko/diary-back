import { Injectable } from '@nestjs/common';
import { DiaryEntry } from './entities/diary.entity';
import {
  CreateDiaryEntryDto,
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
import { MAX_TOKENS, BATCH_SIZE } from 'src/ai/constants';
import { encoding_for_model, TiktokenModel } from 'tiktoken';
import { OpenAiMessage } from 'src/ai/types';
import { MoodByDate } from './types';
import { HttpStatus } from 'src/common/utils/http-status';

dayjs.extend(utc);
dayjs.extend(timezone);

// type MoodsByDate = {
//   date: string; // Format: 'YYYY-MM-DD'
//   value: number[]; // Array of mood values for that date
// }[];

@Injectable()
export class DiaryService {
  constructor(
    @InjectRepository(DiaryEntry)
    private diaryEntriesRepository: Repository<DiaryEntry>,
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
    const embedding = await this.aiService.getEmbedding(entryData.content);
    const createParams: Partial<DiaryEntry> = {
      ...entryData,
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
      select: ['id', 'title', 'content', 'mood', 'createdAt'],
      order: {
        createdAt: 'DESC',
      },
      relations: ['user', 'aiComment'],
    });

    return entries
      .map((entry) => {
        const createdAtLocal = dayjs.utc(entry.createdAt).tz(timeZone);

        const dateObj = createdAtLocal.toDate();

        return {
          ...entry,
          createdAtLocal: createdAtLocal.format('YYYY-MM-DD HH:mm:ss'),
          dateObj,
        };
      })
      .sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime());
  }

  async getMoodsByDate(
    userId: number,
    getMoodsByDateDto: GetMoodsByDateDto,
  ): Promise<MoodByDate[] | undefined> {
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
        `SUM("entry"."mood"::float) as mood`,
        `COUNT(*) as length`,
      ])
      .where('entry.userId = :userId', { userId })
      .andWhere('entry.createdAt >= :startDate', { startDate })
      .andWhere('entry.createdAt < :endDate', { endDate })
      .groupBy('date')
      .orderBy('date')
      .getRawMany<{ date: string; mood: string; length: string }>();

    return rows.map((row) => ({
      date: row.date,
      mood: Number(row.mood),
      length: Number(row.length),
    }));
  }

  async getEntryById(id: number): Promise<DiaryEntry | null> {
    return await this.diaryEntriesRepository.findOne({
      where: { id },
      relations: ['user', 'aiComment'],
    });
  }

  async generatePrompt(userId: number, model: TiktokenModel) {
    const enc = encoding_for_model(model);

    let offset = 0;
    let tokens = 0;
    const promptMessages: OpenAiMessage[] = [];
    let keepLoading = true;

    while (keepLoading) {
      const entries = await this.diaryEntriesRepository.find({
        where: { user: { id: userId } },
        order: { createdAt: 'DESC' },
        skip: offset,
        take: BATCH_SIZE,
      });

      if (!entries.length) break;

      for (const entry of entries) {
        const msg: OpenAiMessage = {
          role: 'user',
          content: `Запис у щоденнику: дата: "${entry.createdAt.toISOString()}", контент: "${entry.content}", настрій: ${entry.mood}`,
        };
        const entryTokens = enc.encode(msg.content).length;

        if (tokens + entryTokens > MAX_TOKENS) {
          keepLoading = false;
          break;
        }
        promptMessages.push(msg);
        tokens += entryTokens;
      }
      offset += BATCH_SIZE;
    }
    return promptMessages.reverse();
  }

  async generatePromptSemantic(
    userId: number,
    embedding: number[],
    model: TiktokenModel,
  ) {
    const relevantEntries = await this.findRelevantEntries(userId, embedding);

    const enc = encoding_for_model(model);
    let tokens = 0;
    const promptMessages: OpenAiMessage[] = [];
    for (const entry of relevantEntries) {
      const msg: OpenAiMessage = {
        role: 'user',
        content: `Схожий запис: дата: "${entry.createdAt.toISOString()}", контент: "${entry.content}", настрій: ${entry.mood}`,
      };
      const entryTokens = enc.encode(msg.content).length;
      if (tokens + entryTokens > MAX_TOKENS) break;
      promptMessages.push(msg);
      tokens += entryTokens;
    }
    console.log('tokens', tokens);
    return promptMessages.reverse();
  }

  async findRelevantEntries(
    userId: number,
    newEmbedding: number[],
  ): Promise<DiaryEntry[]> {
    const entries = await this.diaryEntriesRepository.find({
      where: { user: { id: userId }, embedding: Not(IsNull()) },
      select: ['id', 'content', 'mood', 'embedding', 'createdAt'],
      order: { createdAt: 'DESC' },
    });

    const THRESHOLD = 0;
    const withScores = entries.map((entry) => {
      const score = this.cosineSimilarity(newEmbedding, entry.embedding);
      return { ...entry, score };
    });

    console.log(
      withScores
        .map((e) => ({
          id: e.id,
          score: e.score,
          content: e.content.slice(0, 30),
        }))
        .slice(0, 10),
    );

    return withScores
      .filter((entry) => entry.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .slice(0, 200);
  }

  cosineSimilarity(a: number[], b: number[]): number {
    const dot = a.reduce((sum, v, i) => sum + v * b[i], 0);
    const normA = Math.sqrt(a.reduce((sum, v) => sum + v * v, 0));
    const normB = Math.sqrt(b.reduce((sum, v) => sum + v * v, 0));
    return dot / (normA * normB);
  }
}
