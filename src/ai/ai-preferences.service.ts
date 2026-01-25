import { Injectable, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserAiPreferences } from './entities/user-ai-preferences.entity';
import { DEFAULT_AI_PREFERENCES } from './ai-preferences.defaults';
import { deriveColumnsFromPrefs } from './ai-preferences.derive';
import { AiPreferences, AiPrefsPayload, StylePresetId } from './types';
import deepmerge from 'deepmerge';
import { getStyleByPreset } from './utils/presets';

type Mergeable = Record<string, unknown>;

export function mergePrefs<T extends Mergeable>(base: T, patch: Partial<T>): T {
  return deepmerge<T>(base, patch as T, {
    arrayMerge: (_destinationArray: unknown[], sourceArray: unknown[]) =>
      sourceArray,
  });
}

@Injectable()
export class AiPreferencesService {
  constructor(
    @InjectRepository(UserAiPreferences)
    private readonly repo: Repository<UserAiPreferences>,
  ) {}

  async ensureDefaults(userId: number): Promise<UserAiPreferences> {
    const existing = await this.repo.findOne({ where: { userId } });
    if (existing) return existing;

    const prefs: AiPreferences = DEFAULT_AI_PREFERENCES;
    const derived = deriveColumnsFromPrefs(prefs);

    const row = this.repo.create({
      userId,
      prefsJson: prefs,
      ...derived,
    });

    return this.repo.save(row);
  }

  async getForUser(userId: number): Promise<AiPrefsPayload> {
    await this.ensureDefaults(userId);

    const e = await this.repo
      .createQueryBuilder('p')
      .select(['p.userId', 'p.prefsJson', 'p.rowVersion', 'p.updatedAt'])
      .where('p.userId = :userId', { userId })
      .getOne();

    if (!e) throw new Error('AI_PREFS_NOT_FOUND_AFTER_ENSURE');

    return {
      prefsJson: e.prefsJson,
      rowVersion: e.rowVersion,
      updatedAt: e.updatedAt.toISOString(),
    };
  }

  async patchForUser(
    userId: number,
    patch: Partial<AiPreferences>,
    baseRowVersion?: number,
  ): Promise<AiPrefsPayload> {
    const current = await this.ensureDefaults(userId);

    if (baseRowVersion != null && current.rowVersion !== baseRowVersion) {
      throw new ConflictException('AI_PREFERENCES_CONFLICT');
    }

    const nextPrefs = mergePrefs(current.prefsJson, patch);

    const derived = deriveColumnsFromPrefs(nextPrefs);

    current.prefsJson = nextPrefs;
    current.prefsJson.preset = null;
    Object.assign(current, derived);

    const res = await this.repo.save(current);

    return {
      prefsJson: res.prefsJson,
      rowVersion: res.rowVersion,
      updatedAt: res.updatedAt.toISOString(),
    };
  }

  async changeByPreset(userId: number, preset: StylePresetId) {
    const current = await this.ensureDefaults(userId);
    if (!current) throw new Error('AI_PREFS_NOT_FOUND_AFTER_ENSURE');

    const presetPrefs = getStyleByPreset(preset);
    const nextPrefs = mergePrefs(current.prefsJson.style, presetPrefs);

    current.prefsJson.style = nextPrefs;
    current.prefsJson.preset = preset;
    const derived = deriveColumnsFromPrefs(current.prefsJson);

    Object.assign(current, derived);

    const res = await this.repo.save(current);

    return {
      prefsJson: res.prefsJson,
      rowVersion: res.rowVersion,
      updatedAt: res.updatedAt.toISOString(),
    };
  }
}
