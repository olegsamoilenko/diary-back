// src/seeds/run-ai-model-answer-review.seed.ts

import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AppModule } from 'src/app.module';
import { AiModelAnswerReview } from 'src/ai/entities/ai-model-answer-review.entity';
import { UnhelpfulAnswerDescription } from 'src/ai/types/unhelpfulAnswerDescription';
import { AiModel } from 'src/users/types/settings';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);

  const repo = app.get<Repository<AiModelAnswerReview>>(
    getRepositoryToken(AiModelAnswerReview),
  );

  const seedData: Partial<AiModelAnswerReview>[] = [
    {
      userId: 1,
      type: 'comment',
      isHelpful: true,
      // unhelpfulAnswerDescriptions: null,
      // unhelpfulComment: null,
      improvementComment:
        'The answer was clear and helped me understand my mood better.',
      aiModel: AiModel.GPT_5_4,
      // isRead: false,
    },
    {
      userId: 2,
      type: 'dialog',
      isHelpful: false,
      unhelpfulAnswerDescriptions: [
        UnhelpfulAnswerDescription.TOO_GENERAL,
        UnhelpfulAnswerDescription.NOT_ENOUGH_SPECIFIC_ACTIONABLE_STEPS,
      ],
      // unhelpfulComment: null,
      improvementComment:
        'Give more concrete steps that I can apply during the day.',
      aiModel: AiModel.GPT_5_4,
      // isRead: false,
    },
    {
      userId: 1,
      type: 'comment',
      isHelpful: true,
      // unhelpfulAnswerDescriptions: null,
      // unhelpfulComment: null,
      // improvementComment: null,
      aiModel: AiModel.GPT_5_4,
      // isRead: true,
    },
    {
      userId: 2,
      type: 'dialog',
      isHelpful: false,
      unhelpfulAnswerDescriptions: [
        UnhelpfulAnswerDescription.OFF_TOPIC,
        UnhelpfulAnswerDescription.INCORRECTLY_UNDERSTOOD_REQUEST,
      ],
      // unhelpfulComment: null,
      // improvementComment: null,
      aiModel: AiModel.GPT_5_4,
      // isRead: false,
    },
    {
      userId: 1,
      type: 'comment',
      isHelpful: false,
      unhelpfulAnswerDescriptions: [UnhelpfulAnswerDescription.OTHER],
      unhelpfulComment:
        'The answer focused on productivity, but I was writing about anxiety.',
      improvementComment:
        'React more directly to the emotional context of the entry.',
      aiModel: AiModel.GPT_5_4,
      // isRead: null,
    },
    {
      userId: 2,
      type: 'dialog',
      isHelpful: true,
      // unhelpfulAnswerDescriptions: null,
      // unhelpfulComment: null,
      // improvementComment: null,
      aiModel: AiModel.GPT_5_4,
      // isRead: false,
    },
    {
      userId: 1,
      type: 'comment',
      isHelpful: false,
      unhelpfulAnswerDescriptions: [
        UnhelpfulAnswerDescription.TOO_LONG,
        UnhelpfulAnswerDescription.WRONG_TONE_TOO_DRY_TOO_INTRUSIVE,
      ],
      // unhelpfulComment: null,
      improvementComment: 'Make the response shorter and softer in tone.',
      aiModel: AiModel.GPT_5_4,
      // isRead: false,
    },
    {
      userId: 2,
      type: 'dialog',
      isHelpful: false,
      unhelpfulAnswerDescriptions: [
        UnhelpfulAnswerDescription.INACCURATE_QUESTIONABLE_FACTS,
      ],
      // unhelpfulComment: null,
      // improvementComment: null,
      aiModel: AiModel.GPT_5_4,
      // isRead: true,
    },
    {
      userId: 1,
      type: 'comment',
      isHelpful: true,
      // unhelpfulAnswerDescriptions: null,
      // unhelpfulComment: null,
      improvementComment:
        'It felt personal and gave useful reflection prompts.',
      aiModel: AiModel.GPT_5_4,
      // isRead: false,
    },
    {
      userId: 2,
      type: 'dialog',
      isHelpful: false,
      unhelpfulAnswerDescriptions: [UnhelpfulAnswerDescription.OTHER],
      unhelpfulComment: 'The answer repeated the same idea several times.',
      // improvementComment: null,
      aiModel: AiModel.GPT_5_4,
      // isRead: null,
    },
  ];

  await repo.save(seedData);

  console.log('✅ AI model answer reviews seed completed');

  await app.close();
}

bootstrap().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
