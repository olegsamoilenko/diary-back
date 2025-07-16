import { forwardRef, Inject, Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { AiComment } from './entities/aiComments.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DiaryService } from 'src/diary/diary.service';
import { CreateAiCommentDto } from './dto/';
import { TiktokenModel } from 'tiktoken';
import { OpenAiMessage } from './types';
import { DiaryEntry } from '../diary/entities/diary.entity';
import axios from 'axios';

type BgeEmbeddingResponse = {
  embedding: number[];
};

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
    const resp = await axios.post<BgeEmbeddingResponse>(
      'http://localhost:8567/embed',
      {
        text,
      },
    );

    return resp.data.embedding;
  }

  async generateComment(
    prompt: OpenAiMessage[],
    text: string,
    aiModel: string,
    mood: string,
    isDialog: boolean = false,
  ): Promise<string> {
    let systemMsg: OpenAiMessage;

    if (isDialog) {
      systemMsg = {
        role: 'system',
        content: `Ти – професійний психолог, який відповідає на запитання користувача. Твоя задача – дати щиру, креативну, небанальну відповідь, яка допоможе людині краще зрозуміти себе. Відповідай мовою, якою вона використовує у своєму запитанні. Не відповідай просто емоджі, чи дуже коротко. Дай змістовну відповідь.`,
      };
      // systemMsg = {
      //   role: 'system',
      //   content: `Роби що користувач просить`,
      // };
    } else {
      systemMsg = {
        role: 'system',
        content: `Ти – професійний психолог і водночас хороший друг, якому люди довіряють свої щоденні думки та переживання. Користувач веде щоденник а ти допомагаєшь йому з аналізом. Далі ти отримаєшь історію особистих записів користувача, які змістовно відповідають поточному запису(кожен містить дату, настрій, зміст). Проаналізуй наведені записи користувача. Визнач основні емоції, які переважають у записах.  Відміть, якщо є повторювані думки, події чи проблеми. Дай щиру, креативну, небанальну відповідь, яка допоможе людині краще зрозуміти себе, підтримай її, задай 1-2 питання для роздумів або дай ідею для саморозвитку. Якщо бачиш позитив – похвали конкретно, якщо складнощі – підтримай і підкажи, як рухатись далі, але без банальних порад. Відповідай мовою, якою вона використовує у своєму записі. Не відповідай просто емоджі, чи дуже коротко. Дай змістовну відповідь`,
      };
    }
    // const systemMsg: OpenAiMessage = {
    //   role: 'system',
    //   content: `Ти – професійний психолог і водночас хороший друг, якому люди довіряють свої щоденні думки та переживання. Далі ти отримаєшь історію особистих записів користувача, які змістовно відповідають поточному запису(кожен містить дату, настрій, зміст). Проаналізуй наведені записи користувача. Визнач основні емоції, які переважають у записах.  Відміть, якщо є повторювані думки, події чи проблеми. Дай щиру, креативну, небанальну відповідь, яка допоможе людині краще зрозуміти себе, підтримай її, задай 1-2 питання для роздумів або дай ідею для саморозвитку. Якщо бачиш позитив – похвали конкретно, якщо складнощі – підтримай і підкажи, як рухатись далі, але без банальних порад. Відповідай мовою, якою вона використовує у своєму записі. Не відповідай просто емоджі, чи дуже коротко. Дай змістовну відповідь`,
    // };
    const currentEntryMsg: OpenAiMessage = {
      role: 'user',
      content: `Ось новий запис у щоденнику: "${text
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .trim()}}". Його психологічний стан під час створення цього запису в емоджі ${mood}`,
    };

    const messages: OpenAiMessage[] = [systemMsg, ...prompt, currentEntryMsg];
    const resp = await this.openai.chat.completions.create({
      model: aiModel,
      messages,
      max_completion_tokens: 2048,
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

    const prompt = await this.diaryService.generatePromptSemantic(
      userId,
      entryId,
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

  async getAnswerToQuestion(
    question: string,
    entry: DiaryEntry,
  ): Promise<string> {
    const prompt = JSON.parse(entry.prompt) as OpenAiMessage[];

    const comment: AiComment = (await this.aiCommentRepository.findOne({
      where: { entry: { id: entry.id } },
    })) as AiComment;

    if (!comment) {
      throw new Error('AI comment not found for this entry');
    }

    prompt.push({
      role: 'user',
      content: entry.content,
    });

    prompt.push({
      role: 'assistant',
      content: comment.content,
    });

    const dialogs = await this.diaryService.findOllDialogsByEntryId(entry.id);

    if (dialogs && dialogs.length > 0) {
      for (const dialog of dialogs) {
        prompt.push({
          role: 'assistant',
          content: dialog.answer,
        });
        prompt.push({
          role: 'user',
          content: dialog.question,
        });
      }
    }

    const answer = await this.generateComment(
      prompt,
      question,
      comment.aiModel ?? 'gpt-4o',
      entry.mood ?? 'neutral',
      true,
    );

    return answer;
  }

  async deleteAiComment(commentId: number): Promise<void> {
    await this.aiCommentRepository.delete(commentId);
  }
}
