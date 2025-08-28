import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { DiaryEntry } from './entities/diary.entity';
import {
  CreateDiaryEntryDto,
  GetDiaryEntriesByDayDto,
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
import { MAX_TOKENS } from 'src/ai/constants';
import { encoding_for_model, TiktokenModel } from 'tiktoken';
import { OpenAiMessage } from 'src/ai/types';
import { MoodByDate } from './types';
import { HttpStatus } from 'src/common/utils/http-status';
import { DiaryEntrySetting } from './entities/setting.entity';
import truncate from 'truncate-html';
import { DiaryEntryDialog } from './entities/dialog.entity';
import { PlainDiaryEntryDto } from './dto';
import { CryptoService } from 'src/kms/crypto.service';
import { CipherBlobV1 } from 'src/kms/types';
import { decrypt } from 'src/kms/utils/decrypt';

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
    @Inject(forwardRef(() => AiService))
    private aiService: AiService,
    @Inject(forwardRef(() => UsersService))
    private usersService: UsersService,
    private readonly crypto: CryptoService,
  ) {}
  async createEntry(
    entryData: CreateDiaryEntryDto,
    userId: number,
    createdAt?: Date | string,
  ): Promise<
    | {
        id: number;
        title?: string | null;
        mood?: string | null;
        previewContent: string;
        createdAt: Date;
        updatedAt?: Date | null;
        content: string;
      }
    | undefined
  > {
    const user = await this.usersService.findById(userId);

    if (!user) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'User not found',
        'User with this id does not exist.',
      );
      return;
    }

    const { settings, aiModel, content, ...rest } = entryData;

    let entrySettings: DiaryEntrySetting | undefined;
    if (settings) {
      const createSettings = this.diaryEntrySettingsRepository.create({
        ...settings,
      });

      entrySettings =
        await this.diaryEntrySettingsRepository.save(createSettings);
    }

    const previewContent = truncate(content, {
      length: 100,
    });

    const tags = await this.aiService.generateTagsForEntry(
      content
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim(),
      entryData.aiModel,
    );

    const contentBlob: CipherBlobV1 = await this.crypto.encryptForUser(
      userId,
      'entry.content',
      content,
    );

    const createParams: Partial<DiaryEntry> = {
      ...rest,
      content: contentBlob,
      settings: entrySettings,
      previewContent,
      user,
      tags,
    };
    if (createdAt) {
      createParams.createdAt = new Date(createdAt);
    }

    const entry = this.diaryEntriesRepository.create(createParams);

    const newEntry = await this.diaryEntriesRepository.save(entry);

    const promptMessages: OpenAiMessage[] =
      (await this.generatePromptSemantic(userId, newEntry.id, aiModel)) ?? [];

    if (promptMessages.length) {
      const promptJson = JSON.stringify(promptMessages);
      const promptBlob: CipherBlobV1 = await this.crypto.encryptForUser(
        userId,
        'entry.prompt',
        promptJson,
      );
      await this.diaryEntriesRepository.update(newEntry.id, {
        prompt: promptBlob,
      });
      newEntry.prompt = promptBlob;
    }

    const { prompt, user: u, tags: t, ...restEntry } = newEntry;

    return {
      ...restEntry,
      content,
    };
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

    const startOfDayLocal = dayjs.tz(`${date} 00:00:00`, timeZone);
    const endOfDayLocal = dayjs.tz(`${date} 23:59:59.999`, timeZone);

    const startUTC = new Date(
      startOfDayLocal.valueOf() - startOfDayLocal.utcOffset() * 60 * 1000,
    );
    const endUTC = new Date(
      endOfDayLocal.valueOf() - endOfDayLocal.utcOffset() * 60 * 1000,
    );

    const entries = await this.diaryEntriesRepository.find({
      where: {
        user: { id: user.id },
        createdAt: Between(startUTC, endUTC),
      },
      select: ['id', 'title', 'previewContent', 'mood', 'createdAt'],
      order: {
        createdAt: 'DESC',
      },
      relations: ['settings'],
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
        '"entry"."id" as id',
      ])
      .where('entry.userId = :userId', { userId })
      .andWhere('entry.createdAt >= :startDate', { startDate })
      .andWhere('entry.createdAt < :endDate', { endDate })
      .orderBy('"createdAt"', 'ASC')
      .getRawMany<{
        id: number;
        date: string;
        createdAt: string;
        mood: string;
      }>();

    const result: Record<string, MoodByDate[]> = {};
    for (const row of rows) {
      if (!result[row.date]) result[row.date] = [];
      result[row.date].push({
        id: row.id,
        createdAt: row.createdAt,
        mood: row.mood,
      });
    }

    return result;
  }

  async getEntryById(
    entryId: number,
    userId: number,
  ): Promise<PlainDiaryEntryDto | null> {
    const entry = await this.diaryEntriesRepository.findOne({
      where: { id: entryId },
      relations: ['aiComment', 'dialogs'],
    });

    if (!entry) {
      throwError(
        HttpStatus.NOT_FOUND,
        'Entry not found',
        'Diary entry with this id does not exist.',
      );
      return null;
    }
    const decEntryContent = await decrypt(this.crypto, userId, entry.content);
    let decAiComment: string | undefined;
    if (entry.aiComment?.content) {
      decAiComment = await decrypt(
        this.crypto,
        userId,
        entry.aiComment.content,
      );
    }

    const dialogsPlain = await Promise.all(
      (entry.dialogs ?? []).map(async (d) => {
        const [decDialogQuestion, decDialogAnswer] = await Promise.all([
          decrypt(this.crypto, userId, d.question as unknown as CipherBlobV1),
          decrypt(this.crypto, userId, d.answer as unknown as CipherBlobV1),
        ]);

        return {
          id: d.id,
          uuid: d.uuid,
          createdAt: d.createdAt,
          loading: d.loading,
          question: decDialogQuestion,
          answer: decDialogAnswer,
        };
      }),
    );

    const dialogsSorted = (dialogsPlain || []).sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

    return {
      id: entry.id,
      title: entry.title ?? undefined,
      mood: entry.mood ?? undefined,
      content: decEntryContent,
      dialogs: dialogsSorted,
      prompt: entry.prompt,
      createdAt: entry.createdAt,
      aiComment:
        entry.aiComment && entry.aiComment.content && decAiComment !== undefined
          ? {
              id: entry.aiComment.id,
              content: decAiComment,
              createdAt: entry.aiComment.createdAt,
            }
          : undefined,
    };
  }

  async generatePromptSemantic(
    userId: number,
    entryId: number,
    model: TiktokenModel,
  ): Promise<OpenAiMessage[]> {
    const relevantEntries = await this.findRelevantEntries(userId, entryId);
    const enc = encoding_for_model(model);

    try {
      let tokens = 0;
      const promptMessages: OpenAiMessage[] = [];

      for (const entry of relevantEntries) {
        let entryContentPlain = '';
        try {
          const buf = await this.crypto.decryptForUser(userId, entry.content);
          entryContentPlain = buf.toString('utf8');
        } catch {
          continue;
        }

        const contentClean = entryContentPlain
          .replace(/<[^>]*>/g, '')
          .replace(/&nbsp;/g, ' ')
          .trim();

        const msg: OpenAiMessage = {
          role: 'user',
          content: `Journal entry ("${entry.createdAt.toISOString()}"): "${contentClean}", mood: ${entry.mood ?? 'unknown'}`,
        };
        const entryMsgTokens = enc.encode(msg.content).length;
        if (tokens + entryMsgTokens > MAX_TOKENS) break;
        promptMessages.push(msg);
        tokens += entryMsgTokens;

        if (entry.aiComment?.content) {
          try {
            const buf = await this.crypto.decryptForUser(
              userId,
              entry.aiComment.content,
            );
            const aiCommentPlain = buf.toString('utf8');

            const comment: OpenAiMessage = {
              role: 'assistant',
              content: aiCommentPlain,
            };
            const cTokens = enc.encode(comment.content).length;
            if (tokens + cTokens > MAX_TOKENS) break;
            promptMessages.push(comment);
            tokens += cTokens;
          } catch {
            //
          }
        }

        if (entry.dialogs?.length) {
          for (const d of entry.dialogs) {
            let qPlain = '';
            let aPlain = '';
            try {
              const qb = await this.crypto.decryptForUser(
                userId,
                d.question as unknown as CipherBlobV1,
              );
              qPlain = qb.toString('utf8');
            } catch (e: any) {
              console.log('Error decrypting dialog question', e);
            }
            try {
              const ab = await this.crypto.decryptForUser(
                userId,
                d.answer as unknown as CipherBlobV1,
              );
              aPlain = ab.toString('utf8');
            } catch (e: any) {
              console.log('Error decrypting dialog answer', e);
            }

            if (!qPlain && !aPlain) continue;

            const qMsg: OpenAiMessage = {
              role: 'user',
              content: `Q: ${qPlain}`,
            };
            const aMsg: OpenAiMessage = {
              role: 'assistant',
              content: `A: ${aPlain}`,
            };

            const qTokens = enc.encode(qMsg.content).length;
            const aTokens = enc.encode(aMsg.content).length;
            if (tokens + qTokens + aTokens > MAX_TOKENS) break;

            promptMessages.push(qMsg, aMsg);
            tokens += qTokens + aTokens;
          }
        }
      }

      return promptMessages;
    } finally {
      try {
        enc.free?.();
      } catch (e: any) {
        console.log('Error freeing tiktoken encoding', e);
      }
    }
  }

  async findRelevantEntries(
    userId: number,
    entryId: number,
  ): Promise<DiaryEntry[]> {
    const entries = await this.diaryEntriesRepository.find({
      where: { user: { id: userId } },
      select: ['id', 'content', 'mood', 'createdAt', 'tags'],
      relations: ['aiComment', 'dialogs'],
      order: { createdAt: 'ASC' },
    });

    const newEntry = entries.find((entry) => entry.id === entryId);

    const filteredEntries = entries.filter((entry) => entry.id !== entryId);

    return filteredEntries.filter(
      (entry) =>
        Array.isArray(entry.tags) &&
        Array.isArray(newEntry?.tags) &&
        entry.tags.some((tag) => newEntry.tags.includes(tag)),
    );
  }

  async saveDialog(
    userId: number,
    entryId: number,
    uuid: string,
    question: string,
    answer: string,
  ): Promise<DiaryEntryDialog | undefined> {
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
      where: { id: entryId, user: { id: userId } },
    });

    if (!entry) {
      throwError(
        HttpStatus.NOT_FOUND,
        'Entry not found',
        'Diary entry with this id does not exist.',
      );
      return;
    }

    const qBlob: CipherBlobV1 = await this.crypto.encryptForUser(
      userId,
      'dialog.question',
      question,
    );
    const aBlob: CipherBlobV1 = await this.crypto.encryptForUser(
      userId,
      'dialog.answer',
      answer,
    );

    const dialog = this.diaryEntryDialogRepository.create({
      uuid,
      question: qBlob,
      answer: aBlob,
      entry,
    });

    return await this.diaryEntryDialogRepository.save(dialog);
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
    if (entry?.settings) {
      await this.diaryEntrySettingsRepository.remove(entry.settings);
    }
    if (entry) {
      await this.diaryEntriesRepository.remove(entry);
    }

    return true;
  }

  async deleteByUserId(userId: number): Promise<boolean> {
    const entries = await this.diaryEntriesRepository.find({
      where: { user: { id: userId } },
      relations: ['settings', 'dialogs', 'aiComment'],
    });

    if (entries && entries.length) {
      for (const entry of entries) {
        if (entry.dialogs && entry.dialogs.length > 0) {
          await this.diaryEntryDialogRepository.remove(entry.dialogs);
        }

        if (entry.aiComment) {
          await this.aiService.deleteAiComment(entry.aiComment.id);
        }

        if (entry.settings) {
          await this.diaryEntrySettingsRepository.remove(entry.settings);
        }
      }

      await this.diaryEntriesRepository.remove(entries);
    }

    return true;
  }
}
