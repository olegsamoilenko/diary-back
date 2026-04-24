import { Injectable } from '@nestjs/common';
import { AddPositiveNegativeAiModelAnswerDto } from './dto/add-positive-negative-ai-model-answer.dto';
import { throwError } from '../common/utils';
import { HttpStatus } from '../common/utils/http-status';
import { AddAiModelAnswerReviewDto } from './dto/add-ai-model-answer-review.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { AiModelAnswerReview } from './entities/ai-model-answer-review.entity';
import { Repository } from 'typeorm';
import { IsNull } from 'typeorm';
import type { MemoryKind, MemoryTopic, ProposedMemoryItem } from './types';
import { PositiveNegativeAiModelAnswer } from './entities/positive-negative-ai-model-answer.entity';

@Injectable()
export class ModelReviewService {
  constructor(
    @InjectRepository(AiModelAnswerReview)
    private aiModelAnswerReviewRepository: Repository<AiModelAnswerReview>,
    @InjectRepository(PositiveNegativeAiModelAnswer)
    private positiveNegativeAiModelAnswerRepository: Repository<PositiveNegativeAiModelAnswer>,
  ) {}

  async addAiModelAnswersReview(
    userId: number,
    dto: AddAiModelAnswerReviewDto,
  ) {
    if (!userId) return;

    try {
      const review = this.aiModelAnswerReviewRepository.create({
        userId,
        ...dto,
      });

      await this.aiModelAnswerReviewRepository.save(review);

      return true;
    } catch (err) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'Failed to add AI model answer review',
        'Failed to add AI model answer review.',
        '',
        err,
      );
    }
  }

  async addPositiveNegativeAiModelAnswer(
    userId: number,
    dto: AddPositiveNegativeAiModelAnswerDto,
  ) {
    if (!userId) return;

    try {
      const review = this.positiveNegativeAiModelAnswerRepository.create({
        userId,
        ...dto,
      });

      await this.positiveNegativeAiModelAnswerRepository.save(review);

      return true;
    } catch (err) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'Failed to add AI positive/negative answer',
        'Failed to add AI positive/negative answer',
        '',
        err,
      );
    }
  }

  async getAiModelAnswerReviews() {
    return await this.aiModelAnswerReviewRepository.find({
      where: [{ isRead: false }, { isRead: IsNull() }],
    });
  }

  async markAsReadAiModelAnswerReview(id: number) {
    try {
      const result = await this.aiModelAnswerReviewRepository.update(
        { id },
        { isRead: true },
      );

      if (!result.affected) {
        throwError(
          HttpStatus.NOT_FOUND,
          'AI model answer review not found',
          'AI model answer review not found',
          '',
        );
      }

      return true;
    } catch (err) {
      throwError(
        HttpStatus.INTERNAL_SERVER_ERROR,
        'Failed to mark AI model answer review as read',
        'Failed to mark AI model answer review as read',
        '',
        err,
      );
    }
  }
}
