import { forwardRef, HttpStatus, Inject, Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { AiComment } from './entities/aiComments.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DiaryService } from 'src/diary/diary.service';
import { throwError } from '../common/utils';
import { CreateAiCommentDto } from './dto/';

@Injectable()
export class AiService {
  private readonly openai: OpenAI;

  constructor(
    @InjectRepository(AiComment)
    private aiCommentRepository: Repository<AiComment>,
    @Inject(forwardRef(() => DiaryService))
    private readonly diaryService: DiaryService,
  ) {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async getEmbedding(text: string): Promise<number[]> {
    const resp = await this.openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    });
    return resp.data[0].embedding;
  }

  async generateComment(
    text: string,
    aiModel: string,
    mood: number,
  ): Promise<string> {
    const resp = await this.openai.chat.completions.create({
      model: aiModel,
      messages: [
        {
          role: 'system',
          content: `Ти уважний, підтримуючий психолог-коментатор для щоденника користувача. Поясни людині її стан або дай просту пораду. Відповідай мовою, якою вона використовує у своєму записі. Його психологічний стан при написанні цього запису по шкалі від 1 до 5 де 1 - дуже погано, 2 - погано, 3 - нейтрально, 4 - добре, 5 - дуже добре є ${mood}.`,
        },
        {
          role: 'user',
          content: `Ось новий запис у щоденнику: "${text}"`,
        },
      ],
      max_completion_tokens: 128,
      temperature: 0.7,
    });

    return resp.choices[0].message.content?.trim() ?? '';
  }

  async createAiComment(
    entryId: number,
    createAiCommentDto: CreateAiCommentDto,
  ): Promise<AiComment> {
    const { content, aiModel, mood } = createAiCommentDto;

    const text = await this.generateComment(content, aiModel, mood);

    const embedding = await this.getEmbedding(text);

    const aiComment = this.aiCommentRepository.create({
      content: text,
      aiModel,
      entry: { id: entryId },
      embedding,
    });

    return await this.aiCommentRepository.save(aiComment);
  }
}
