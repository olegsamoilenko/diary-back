import { forwardRef, Inject, Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { AiComment } from './entities/aiComments.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DiaryService } from 'src/diary/diary.service';
import { CreateAiCommentDto } from './dto/';
import { TiktokenModel } from 'tiktoken';
import { OpenAiMessage } from './types';

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
    prompt: OpenAiMessage[],
    text: string,
    aiModel: string,
    mood: number,
  ): Promise<string> {
    const systemMsg: OpenAiMessage = {
      role: 'system',
      content: `Ти уважний, підтримуючий психолог-коментатор для щоденника користувача. Поясни людині її стан або дай просту пораду на основі попередніх записів. Відповідай мовою, якою вона використовує у своєму записі. Його психологічний стан при написанні цього запису по шкалі від 1 до 5 де 1 - дуже погано, 5 - дуже добре є ${mood}.`,
    };
    const currentEntryMsg: OpenAiMessage = {
      role: 'user',
      content: `Ось новий запис у щоденнику: "${text}"`,
    };

    const messages: OpenAiMessage[] = [systemMsg, ...prompt, currentEntryMsg];
    const resp = await this.openai.chat.completions.create({
      model: aiModel,
      messages,
      max_completion_tokens: 500,
      temperature: 0.7,
    });

    return resp.choices[0].message.content?.trim() ?? '';
  }

  async createAiComment(
    userId: number,
    entryId: number,
    createAiCommentDto: CreateAiCommentDto,
  ): Promise<AiComment> {
    const { content, embedding, aiModel, mood } = createAiCommentDto;

    // const prompt = await this.diaryService.generatePrompt(
    //   userId,
    //   aiModel as TiktokenModel,
    // );

    const prompt = await this.diaryService.generatePromptSemantic(
      userId,
      embedding,
      aiModel as TiktokenModel,
    );

    const text = await this.generateComment(prompt, content, aiModel, mood);

    const AIEmbedding = await this.getEmbedding(text);

    const aiComment = this.aiCommentRepository.create({
      content: text,
      aiModel,
      entry: { id: entryId },
      embedding: AIEmbedding,
    });

    return await this.aiCommentRepository.save(aiComment);
  }
}
