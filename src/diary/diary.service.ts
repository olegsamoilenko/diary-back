import { HttpStatus, Injectable } from '@nestjs/common';
import { DiaryEntry } from './entities/diary.entity';
import {
  CreateDiaryEntryDto,
  GetDiaryEntriesByDayDto,
  UpdateDiaryEntryDto,
  GetMoodsByDateDto,
} from './dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { AiService } from 'src/ai/ai.service';
import { UsersService } from 'src/users/users.service';
import { throwError, offsetToTimezoneStr } from 'src/common/utils';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

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
        'User with this email does not exist.',
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
        'User with this email does not exist.',
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
  ): Promise<{ date: string; value: number }[] | undefined> {
    const user = await this.usersService.findById(userId);

    if (!user) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'User not found',
        'User with this email does not exist.',
      );
      return;
    }

    const { year, month, offsetMinutes } = getMoodsByDateDto;

    const tz = offsetToTimezoneStr(offsetMinutes);

    const startDate = new Date(Date.UTC(year, month - 2, 1, 0, 0, 0));
    const endDate = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0));

    type MoodByDate = {
      date: string;
      value: number;
    };

    const rows = await this.diaryEntriesRepository
      .createQueryBuilder('entry')
      .select([
        `to_char(("entry"."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE '${tz}'), 'YYYY-MM-DD') as date`,
        `round(avg("entry"."mood"::float)) as value`,
      ])
      .where('entry.userId = :userId', { userId })
      .andWhere('entry.createdAt >= :startDate', { startDate })
      .andWhere('entry.createdAt < :endDate', { endDate })
      .groupBy('date')
      .orderBy('date')
      .getRawMany<MoodByDate>();

    return rows.map((row) => ({
      date: row.date,
      value: Number(row.value),
    }));
  }

  async getEntryById(id: number): Promise<DiaryEntry | null> {
    return await this.diaryEntriesRepository.findOne({
      where: { id },
      relations: ['user', 'aiComment'],
    });
  }
}
