import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { CommonNotification } from './entities/common-notification.entity';
import { CommonNotificationTranslation } from './entities/common-notification-translations.entity';
import { UserReadNotification } from './entities/user-read-notification';
import { Repository, DataSource } from 'typeorm';
import { CreateCommonNotificationDto } from './dto/create-common-notification.dto';
import { throwError } from 'src/common/utils';
import { HttpStatus } from 'src/common/utils/http-status';
import { Platform } from 'src/common/types/platform';
import { Locale } from 'src/common/types/locale';

function makeLocaleFallbackChain(
  requested: string | undefined,
  defaultLocale = 'en',
): string[] {
  if (!requested) return [defaultLocale, 'en'];
  const [lang, region] = requested.split('-');
  const chain = region ? [`${lang}-${region}`, lang] : [lang];
  if (!chain.includes(defaultLocale)) chain.push(defaultLocale);
  if (!chain.includes('en')) chain.push('en');
  return chain;
}

@Injectable()
export class CommonNotificationsService {
  constructor(
    @InjectRepository(CommonNotification)
    private readonly commonNotificationRepository: Repository<CommonNotification>,
    @InjectRepository(CommonNotificationTranslation)
    private readonly commonNotificationTranslationRepository: Repository<CommonNotificationTranslation>,
    @InjectRepository(UserReadNotification)
    private readonly userReadNotificationRepository: Repository<UserReadNotification>,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateCommonNotificationDto) {
    if (!dto.translations?.length) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'Translation is required',
        'At least one translation is required.',
        'TRANSLATIONS_REQUIRED',
      );
    }
    const seen = new Set<string>();
    for (const t of dto.translations) {
      const loc = (t.locale || '').trim();
      if (!loc) {
        throwError(
          HttpStatus.BAD_REQUEST,
          'Locale is required',
          'Translation locale is required.',
          'LOCALE_REQUIRED',
        );
      }
      if (seen.has(loc)) {
        throwError(
          HttpStatus.BAD_REQUEST,
          'Duplicate locale',
          `Duplicate locale in payload: ${loc}`,
          'DUPLICATE_LOCALE',
        );
      }
      seen.add(loc);
    }

    try {
      return await this.dataSource.transaction(async (manager) => {
        const note = manager.create(CommonNotification, {
          defaultLocale: dto.defaultLocale,
        });
        await manager.save(note);

        const rows = dto.translations
          .map((t) => {
            return manager.create(CommonNotificationTranslation, {
              note,
              locale: t.locale.trim(),
              html: t.html,
              docJson: t.docJson ?? null,
            });
          })
          .filter(Boolean);

        if (rows.length === 0) {
          throwError(
            HttpStatus.BAD_REQUEST,
            'All translations are empty',
            `All translations are empty`,
            'ALL_TRANSLATIONS_EMPTY',
          );
        }

        await manager.save(CommonNotificationTranslation, rows);

        const created = await manager.findOneOrFail(CommonNotification, {
          where: { id: note.id },
          relations: { translations: true },
        });
        return created;
      });
    } catch (e: any) {
      const code = this.getPgErrorCode(e);
      if (code === '23505') {
        throwError(
          HttpStatus.CONFLICT,
          'Translation exists',
          `Translation for this locale already exists for this note`,
          'TRANSLATION_EXISTS',
        );
      }
      throwError(
        HttpStatus.BAD_REQUEST,
        'Unknown error',
        'Failed to create common notification',
        'UNKNOWN_ERROR',
      );
    }
  }

  async getAllCommonNotificationsPaged(
    page = 1,
    limit = 10,
  ): Promise<{
    notifications: CommonNotification[];
    total: number;
    page: number;
    pageCount: number;
    limit: number;
  }> {
    const take = Math.min(Math.max(limit, 1), 100);
    const skip = (Math.max(page, 1) - 1) * take;

    const [items, total] = await this.commonNotificationRepository.findAndCount(
      {
        order: { createdAt: 'DESC' },
        relations: ['translations'],
        skip,
        take,
      },
    );

    return {
      notifications: items,
      total,
      page: Math.max(page, 1),
      pageCount: Math.max(1, Math.ceil(total / take)),
      limit: take,
    };
  }

  async getUnreadCommonNotifications(userId: number) {
    const qb = this.commonNotificationRepository
      .createQueryBuilder('n')
      .leftJoin('n.readNotifications', 'rn', 'rn.userId = :userId', { userId })
      .leftJoinAndSelect('n.translations', 't')
      .where('rn.id IS NULL');

    return await qb.orderBy('n.createdAt', 'ASC').getMany();
  }

  async markAsRead(ids: number[], userId: number): Promise<void> {
    for (const id of ids) {
      const alreadyRead = await this.userReadNotificationRepository.findOne({
        where: { user: { id: userId }, notification: { id: id } },
      });

      if (alreadyRead) {
        throwError(
          HttpStatus.CONFLICT,
          'Already read',
          `This notification has already been read.`,
          'ALREADY_Read',
        );
      }

      const read = this.userReadNotificationRepository.create({
        user: { id: userId },
        notification: { id: id },
      });

      await this.userReadNotificationRepository.save(read);
    }
  }

  async deleteCommonNotification(id: number): Promise<void> {
    await this.commonNotificationRepository.delete(id);
  }

  getPgErrorCode(e: unknown): string | undefined {
    if (typeof e !== 'object' || e === null) return undefined;

    const obj = e as Record<string, unknown>;
    const direct = obj.code;
    if (typeof direct === 'string') return direct;

    const driver = obj.driverError;
    if (typeof driver === 'object' && driver !== null) {
      const dcode = (driver as Record<string, unknown>).code;
      if (typeof dcode === 'string') return dcode;
    }
    return undefined;
  }

  async deleteReadNotificationsByUserId(userId: number) {
    await this.userReadNotificationRepository.delete({ user: { id: userId } });
  }
}
