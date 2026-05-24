import { BadRequestException, Injectable } from '@nestjs/common';
import { TranslationServiceClient } from '@google-cloud/translate';
import { InjectRepository } from '@nestjs/typeorm';
import {
  ForumTranslation,
  ForumTranslationTargetType,
} from './entities/forum-translation.entity';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';

type ForumTranslationItemResult = {
  targetType: ForumTranslationTargetType;
  targetId: string;
  translatedText: string;
  detectedLanguage: string | null;
  targetLang: string;
  fromCache: boolean;
};

@Injectable()
export class ForumTranslationsService {
  private readonly client: TranslationServiceClient;

  constructor(
    @InjectRepository(ForumTranslation)
    private readonly translationsRepo: Repository<ForumTranslation>,
  ) {
    this.client = new TranslationServiceClient({
      keyFilename: process.env.GOOGLE_TRANSLATION_CREDENTIALS,
    });
  }

  private hashText(text: string) {
    return createHash('sha256').update(text).digest('hex');
  }

  async translateAndCache(params: {
    targetType: ForumTranslationTargetType;
    targetId: string;
    text: string;
    targetLang: string;
    sourceLang?: string;
    mimeType?: 'text/plain' | 'text/html';
  }) {
    const projectId = process.env.GOOGLE_TRANSLATION_PROJECT_ID;

    if (!projectId) throw new Error('GOOGLE_TRANSLATION_PROJECT_ID is not set');
    if (!params.text?.trim()) throw new BadRequestException('Text is required');
    if (!params.targetLang?.trim()) {
      throw new BadRequestException('Target language is required');
    }

    const sourceHash = this.hashText(params.text);
    const mimeType = params.mimeType ?? 'text/plain';

    const cached = await this.translationsRepo.findOne({
      where: {
        targetType: params.targetType,
        targetId: params.targetId,
        targetLang: params.targetLang,
        sourceHash,
      },
    });

    if (cached) {
      return {
        translatedText: cached.translatedText,
        detectedLanguage: cached.sourceLang,
        targetLang: cached.targetLang,
        fromCache: true,
      };
    }

    const [response] = await this.client.translateText({
      parent: `projects/${projectId}/locations/global`,
      contents: [params.text],
      mimeType,
      targetLanguageCode: params.targetLang,
      sourceLanguageCode: params.sourceLang,
    });

    const translation = response.translations?.[0];
    const translatedText = translation?.translatedText ?? '';
    const detectedLanguage = translation?.detectedLanguageCode ?? null;

    const saved = await this.translationsRepo.save(
      this.translationsRepo.create({
        targetType: params.targetType,
        targetId: params.targetId,
        sourceText: params.text,
        sourceHash,
        sourceLang: detectedLanguage,
        targetLang: params.targetLang,
        translatedText,
        provider: 'google',
        mimeType,
      }),
    );

    return {
      translatedText: saved.translatedText,
      detectedLanguage: saved.sourceLang,
      targetLang: saved.targetLang,
      fromCache: false,
    };
  }

  async translateManyAndCache(params: {
    targetLang: string;
    items: {
      targetType: ForumTranslationTargetType;
      targetId: string;
      text: string;
      mimeType?: 'text/plain' | 'text/html';
    }[];
  }) {
    const results: ForumTranslationItemResult[] = [];

    for (const item of params.items) {
      const result = await this.translateAndCache({
        ...item,
        targetLang: params.targetLang,
      });

      results.push({
        targetType: item.targetType,
        targetId: item.targetId,
        ...result,
      });
    }

    return {
      targetLang: params.targetLang,
      items: results,
    };
  }
}
