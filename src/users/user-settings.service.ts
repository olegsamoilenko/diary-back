import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { UserSettings } from './entities/user-settings.entity';
import { Repository } from 'typeorm';
import { Font, Theme } from './types';

@Injectable()
export class UserSettingsService {
  constructor(
    @InjectRepository(UserSettings)
    private usersSettingsRepository: Repository<UserSettings>,
  ) {}

  async getThemeStatistics(): Promise<{ theme: Theme; count: string }[]> {
    const rows = await this.usersSettingsRepository
      .createQueryBuilder('s')
      .select('s.theme', 'theme')
      .addSelect('COUNT(s.id)', 'count')
      .where('s.theme IS NOT NULL')
      .groupBy('s.theme')
      .getRawMany<{ theme: Theme; count: string }>();

    const byTheme = new Map<Theme, string>();
    for (const row of rows) {
      if (!row.theme) continue;
      byTheme.set(row.theme, row.count);
    }

    return Object.values(Theme).map((theme) => ({
      theme,
      count: byTheme.get(theme) ?? '0',
    }));
  }

  async getFontStatistics(): Promise<{ font: Font; count: string }[]> {
    const rows = await this.usersSettingsRepository
      .createQueryBuilder('s')
      .select('s.font', 'font')
      .addSelect('COUNT(s.id)', 'count')
      .where('s.font IS NOT NULL')
      .groupBy('s.font')
      .getRawMany<{ font: Font; count: string }>();

    const byFont = new Map<Font, string>();
    for (const row of rows) {
      if (!row.font) continue;
      byFont.set(row.font, row.count);
    }

    return Object.values(Font).map((font) => ({
      font,
      count: byFont.get(font) ?? '0',
    }));
  }

  async getAppBuildStatistics(): Promise<
    { appBuild: number; count: string }[]
  > {
    return await this.usersSettingsRepository
      .createQueryBuilder('s')
      .select('s.appBuild', 'appBuild')
      .addSelect('COUNT(s.id)', 'count')
      .where('s.appBuild IS NOT NULL')
      .groupBy('s.appBuild')
      .orderBy('s.appBuild', 'ASC')
      .getRawMany<{ appBuild: number; count: string }>();
  }

  async getAiModelStatistics(): Promise<{ aiModel: number; count: string }[]> {
    return await this.usersSettingsRepository
      .createQueryBuilder('s')
      .select('s.aiModel', 'aiModel')
      .addSelect('COUNT(s.id)', 'count')
      .where('s.aiModel IS NOT NULL')
      .groupBy('s.aiModel')
      .orderBy('s.aiModel', 'ASC')
      .getRawMany<{ aiModel: number; count: string }>();
  }

  async getLocaleStatistics(): Promise<{ locale: string; count: string }[]> {
    return await this.usersSettingsRepository
      .createQueryBuilder('s')
      .select('s.locale', 'locale')
      .addSelect('COUNT(s.id)', 'count')
      .where('s.locale IS NOT NULL')
      .groupBy('s.locale')
      .orderBy('s.locale', 'ASC')
      .getRawMany<{ locale: string; count: string }>();
  }
}
