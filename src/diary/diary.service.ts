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
import { OpenAIService } from 'src/ai/openai.service';
import { UsersService } from 'src/users/users.service';
import { throwError, offsetToTimezoneStr } from 'src/common/utils';

@Injectable()
export class DiaryService {
  constructor(
    @InjectRepository(DiaryEntry)
    private diaryEntriesRepository: Repository<DiaryEntry>,
    private openaiService: OpenAIService,
    private usersService: UsersService,
  ) {}
  async createEntry(
    entryData: CreateDiaryEntryDto,
    userId: number,
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
    const embedding = await this.openaiService.getEmbedding(entryData.content);
    const newEntry = this.diaryEntriesRepository.create({
      ...entryData,
      user,
      embedding,
    });
    const savedEntry = await this.diaryEntriesRepository.save(newEntry);

    return savedEntry;
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

    const { date, offsetMinutes } = getDiaryEntriesByDayDto;

    const startLocal = new Date(`${date}T00:00:00`);
    const endLocal = new Date(`${date}T23:59:59.999`);
    const startUTC = new Date(startLocal.getTime() - offsetMinutes * 60 * 1000);
    const endUTC = new Date(endLocal.getTime() - offsetMinutes * 60 * 1000);

    return await this.diaryEntriesRepository.find({
      where: {
        user,
        createdAt: Between(startUTC, endUTC),
      },
      select: ['id', 'title', 'content', 'mood', 'createdAt'],
      order: {
        createdAt: 'DESC',
      },
    });
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

    const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
    const endDate = new Date(Date.UTC(year, month, 1, 0, 0, 0));

    type MoodByDate = {
      date: string;
      value: number;
    };

    const rows = await this.diaryEntriesRepository
      .createQueryBuilder('entry')
      .select([
        `to_char(("entry"."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE '${tz}'), 'YYYY-MM-DD') as date`,
        `ceil(avg("entry"."mood"::float)) as value`,
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
  //
  // async getEntries(): Promise<DiaryEntry[]> {
  //   // Logic to retrieve all diary entries
  // }
  //
  // async updateEntry(
  //   id: number,
  //   updateData: UpdateDiaryEntryDto,
  // ): Promise<DiaryEntry> {
  //   // Logic to update a diary entry
  // }
  //
  // async deleteEntry(id: number): Promise<void> {
  //   // Logic to delete a diary entry
  // }
}
