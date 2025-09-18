import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ReleaseNotification } from './entities/release-notification.entity';
import { ReleaseNotificationTranslation } from './entities/release-notification-translations.entity';
import { UserSkippedVersion } from './entities/user-skipped-version.entity';
import { Repository, DataSource } from 'typeorm';
import { CreateReleaseNotificationDto } from './dto/create-release-notification.dto';
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
export class ReleaseNotificationsService {
  constructor(
    @InjectRepository(ReleaseNotification)
    private readonly releaseNotificationRepository: Repository<ReleaseNotification>,
    @InjectRepository(ReleaseNotificationTranslation)
    private readonly releaseNotificationTranslationRepository: Repository<ReleaseNotificationTranslation>,
    @InjectRepository(UserSkippedVersion)
    private readonly userSkippedVersionRepository: Repository<UserSkippedVersion>,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateReleaseNotificationDto) {
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

    const notification = await this.releaseNotificationRepository.findOne({
      where: { platform: dto.platform, build: dto.build },
    });

    if (notification) {
      throwError(
        HttpStatus.CONFLICT,
        'Notification exists',
        `Notification for this platform and build already exists`,
        'NOTIFICATION_EXISTS',
      );
    }

    try {
      return await this.dataSource.transaction(async (manager) => {
        const note = manager.create(ReleaseNotification, {
          defaultLocale: dto.defaultLocale,
          platform: dto.platform ?? null,
          build: dto.build,
        });
        await manager.save(note);

        const rows = dto.translations
          .map((t) => {
            return manager.create(ReleaseNotificationTranslation, {
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

        await manager.save(ReleaseNotificationTranslation, rows);

        const created = await manager.findOneOrFail(ReleaseNotification, {
          where: { id: note.id },
          relations: { translations: true },
        });
        return created;
      });
    } catch (e: any) {
      if (e?.code === '23505') {
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
        'Failed to create release notification',
      );
    }
  }

  async getLastReleaseNotification(
    platform: Platform,
    build: number,
    userId: number,
  ) {
    const notification = await this.releaseNotificationRepository.findOne({
      where: { platform },
      order: { build: 'DESC' },
      relations: ['translations'],
    });

    if (!notification) {
      return null;
    }

    if (build >= (notification?.build || 0)) {
      return null;
    }

    const skippedVersion = await this.userSkippedVersionRepository.findOne({
      where: { user: { id: userId }, platform, build: notification.build },
    });

    if (skippedVersion) {
      return null;
    }

    return notification;
  }

  async skipThisVersion(
    platform: Platform,
    build: number,
    userId: number,
  ): Promise<void> {
    const alreadySkipped = await this.userSkippedVersionRepository.findOne({
      where: { user: { id: userId }, platform, build },
    });

    if (alreadySkipped) {
      throwError(
        HttpStatus.CONFLICT,
        'Already skipped',
        `This version has already been skipped.`,
        'ALREADY_SKIPPED',
      );
    }

    const skipped = this.userSkippedVersionRepository.create({
      user: { id: userId },
      platform,
      build,
    });

    await this.userSkippedVersionRepository.save(skipped);
  }

  async deleteSkippedVersion(userId: number): Promise<void> {
    await this.userSkippedVersionRepository.delete({ user: { id: userId } });
  }
}
