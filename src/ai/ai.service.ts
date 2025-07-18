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
        content: `Ти – професійний психолог, який відповідає на запитання користувача. Твоя задача зрозуміти суть питання та враховуючи попередні записи та діалог які ти отримав, дати щиру, креативну, небанальну відповідь, яка допоможе людині краще зрозуміти себе. Не повторюйся. Відповідай мовою, якою вона використовує у своєму запитанні. Не відповідай просто емоджі, чи дуже коротко. Дай змістовну відповідь.`,
      };
      // systemMsg = {
      //   role: 'system',
      //   content: `Роби що користувач просить`,
      // };
    } else {
      systemMsg = {
        role: 'system',
        content: `Ти — розумний щоденник, особистий асистент саморозвитку.

                  Проаналізуй мій сьоголняшній та попередні записи з точки зору психології та саморефлексії.
                  Які головні емоції чи думки ти помічаєш?
                  Дай коротку, креативну, небанальну пораду або підтримку, як краще зрозуміти себе чи зробити крок вперед.
                  Якщо бачиш повтори/патерни — проаналізуй з точки зору позитивне чи негативне це. Якщо негативне, дай пораду, як з цим працювати. Ящо позитивне, дай пораду як розвивати.

                  Ось мій сьогоднішній запис у щоденнику:
                  """
                  ${text
                    .replace(/<[^>]*>/g, '')
                    .replace(/&nbsp;/g, ' ')
                    .trim()}
                  """
                  Мій настрій: ${mood}.

                  Ти отримаєш ще мої попередні схожі записи як контекст. В кожному записі є твоя відповідь та може бути діалог з тобою в формі "Питання - Відповідь". Він відмічений як "Діалог"
                  Фокусуйся в першу чергу на аналізі останнього (сьогоднішнього) запису, а попередні використовуй лише як додатковий контекст для виявлення патернів або змін.
                  Не повторюйся.
                  Уникай надмірних узагальнень. Дай коротку, конкретну рефлексію по сьогоднішній події.
                  Якщо запис короткий чи неочевидний — можеш задати уточнююче питання.
                  Уникай шаблонних фраз про "цінування життя" чи "рутинні радощі", якщо їх немає в записі.

                  Відповідай тепло, підтримуюче, змістовно.
                  `,
      };
    }

    // const currentEntryMsg: OpenAiMessage = {
    //   role: 'user',
    //   content: `Ось новий запис у щоденнику: "${text
    //     .replace(/<[^>]*>/g, '')
    //     .replace(/&nbsp;/g, ' ')
    //     .trim()}". Його психологічний стан під час створення цього запису в емоджі ${mood}`,
    // };

    const messages: OpenAiMessage[] = [systemMsg, ...prompt];
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

  async generateTagsForEntry(text: string, aiModel: string): Promise<string[]> {
    const systemMsg: OpenAiMessage = {
      role: 'system',
      content: `Згенеруй теги, а також синоніми для цих тегів, для цього запису в щоденнику ${text
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .trim()}}. Теги мають бути короткими, зрозумілими та відображати основні теми та суть запису. Кожен тег має бути або одним словом, або коротким словосполученням через пробіл, не обʼєднуй кілька слів в одне. Використовуй мову запису. Усе має бути одним списком у такому форматі: ["тег1", "синонім1", "синонім2", "тег2", "синонім1", "синонім2", "тег3"].`,
    };

    const messages: OpenAiMessage[] = [systemMsg];
    const resp = await this.openai.chat.completions.create({
      model: aiModel,
      messages,
      max_completion_tokens: 2048,
      temperature: 0.7,
    });

    let tags: string[] = [];
    const aiResp = resp.choices[0].message.content?.trim() ?? '';

    try {
      tags = JSON.parse(aiResp) as string[];
      if (!Array.isArray(tags)) throw new Error('Not array');
    } catch {
      tags = aiResp
        .replace(/[[]"']/g, '')
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean);
    }

    return tags;
  }

  async deleteAiComment(commentId: number): Promise<void> {
    await this.aiCommentRepository.delete(commentId);
  }
}
