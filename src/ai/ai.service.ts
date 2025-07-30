import { forwardRef, Inject, Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { AiComment } from './entities/aiComments.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DiaryService } from 'src/diary/diary.service';
import { CreateAiCommentDto } from './dto/';
import { encoding_for_model, TiktokenModel } from 'tiktoken';
import { OpenAiMessage } from './types';
import { DiaryEntry } from '../diary/entities/diary.entity';
import { DiaryEntryDialog } from 'src/diary/entities/dialog.entity';
import { PlansService } from 'src/plans/plans.service';
import { UsersService } from 'src/users/users.service';

@Injectable()
export class AiService {
  private readonly openai: OpenAI;

  constructor(
    @InjectRepository(AiComment)
    private aiCommentRepository: Repository<AiComment>,
    @Inject(forwardRef(() => DiaryService))
    private readonly diaryService: DiaryService,
    private readonly plansService: PlansService,
    private readonly usersService: UsersService,
  ) {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async generateComment(
    userId: number,
    prompt: OpenAiMessage[],
    text: string,
    aiModel: TiktokenModel,
    mood: string,
    isDialog: boolean = false,
    diaryContent?: string,
    aiComment?: string,
    dialogs?: DiaryEntryDialog[],
  ): Promise<string> {
    let systemMsg: OpenAiMessage;

    const user = await this.usersService.findById(userId);

    if (isDialog) {
      systemMsg = {
        role: 'system',
        content: `Моє ім'я ${user?.name}. Ти — мій особистий розумний щоденник і співрозмовник.  
          Ти відповідаєш так, ніби ми давно знайомі: дружньо, легко, часом із гумором чи іронією, але завжди уважно і з підтримкою.  
          Не використовуй кліше або формальні психологічні фрази. Веди діалог природньо, як справжній друг, що розуміє мій настрій і ситуацію.  
          Уникай звернень типу "Шановний користувачу", і не повторюй фраз на кшталт "у твоєму записі видно…".
          
          Контекст:  
          Ось мій запис у щоденнику:  
          """
          ${diaryContent
            ?.replace(/<[^>]*>/g, '')
            .replace(/&nbsp;/g, ' ')
            .trim()}
          """
          
          Мій настрій: ${mood}
          
          Твоя попередня відповідь:  
          """
          ${aiComment}
          """
          
          Ось діалог, який ми вели раніше, якщо він є:
          """
          ${dialogs
            ?.filter((d) => d.question && d.answer)
            .map((d) => `Питання: ${d.question}\nВідповідь: ${d.answer}`)
            .join('\n')}
          """
          
          Я (користувач) запитую:  
          """
          ${text}
          """
          
          **Твоє завдання:**  
          Відповідай на моє питання або коментуй так, щоб це виглядало як продовження живої, довірливої розмови.  
          Якщо доречно — можеш вставити легкий жарт або дружню іронію.
          Ти отримаєш мої попередні схожі записи а також можливі діалоги по них. Враховуй їх але не підсумовуй їх ще раз, а просто підтримуй діалог по суті питання.  
          Якщо бачиш, що я хочу емоційної підтримки — додай її, але без банальщини.
          Можеш ставити зустрічне запитання або дати лайфхак для саморефлексії, якщо це допоможе продовжити діалог.  
          
          Відповідай мовою, якою я пишу.
          Відповідай тільки текстом, не звертайся до мене формально.`,
      };
    } else {
      systemMsg = {
        role: 'system',
        content: `Моє ім'я ${user?.name}. Ти — мій особистий розумний щоденник. Відповідай мені, як найкращий друг, із живим почуттям гумору, дружньо, інколи з легким сарказмом або іронією (але не переходь межу поваги). Ти завжди підтримуєш, можеш пожартувати, але водночас глибоко аналізуєш мої записи з точки зору психології, емоцій і саморефлексії. Не використовуй шаблонні фрази й “розумні” формулювання в стилі підручника психології.

          Веди себе природно, немов у тебе свій характер. Можеш ставити зустрічні питання, реагувати на емоції, підтримувати чи підбадьорювати. Не повторюй стандартні формули типу “у твоєму сьогоднішньому записі видно”. Відповідай особисто, ненав’язливо, наче пишеш другу в месенджері.
          
          Ось мій запис:
          """
          ${text
            .replace(/<[^>]*>/g, '')
            .replace(/&nbsp;/g, ' ')
            .trim()}
          """
          
          Мій настрій: ${mood}
          
          Ти отримаєш ще мої попередні схожі записи як контекст. В кожному записі є твоя відповідь та може бути діалог з тобою в формі "Питання - Відповідь". Він відмічений як "Діалог" Враховуй їх у своїй відповіді.
          
          Твоє завдання:
          Відреагуй на цей запис як друг і трохи “психотерапевт”.
          Зроби це жваво, живою мовою, якою пишу я, з легкими жартами чи іронією, якщо доречно.
          Якщо хочеш — можеш запитати щось уточнююче або кинути “фразу дня”/лайфхак для саморозвитку.
          Уникай нудних загальних фраз. Відповідай природно та неформально.
          
          Відповідай мовою, якою я пишу.
          Відповідай тільки текстом, без звернень на кшталт “Шановний користувачу”.
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

    console.log('text:', text);

    console.log(`AI response: ${resp.choices[0].message.content?.trim()}`);

    const enc = encoding_for_model(aiModel);

    const respTokens: number = enc.encode(
      resp.choices[0].message.content?.trim() ?? '',
    ).length;

    const usedTokens = this.countOpenAiTokens(messages, aiModel);

    await this.plansService.updateByUser(userId, {
      usedTokens: usedTokens + respTokens,
    });

    return resp.choices[0].message.content?.trim() ?? '';
  }

  async createAiComment(
    userId: number,
    entryId: number,
    createAiCommentDto: CreateAiCommentDto,
  ): Promise<AiComment> {
    const { content, aiModel, mood } = createAiCommentDto;

    const prompt = await this.diaryService.generatePromptSemantic(
      userId,
      entryId,
      aiModel,
    );

    const text = await this.generateComment(
      userId,
      prompt,
      content,
      aiModel,
      mood,
    );

    const aiComment = this.aiCommentRepository.create({
      content: text,
      aiModel,
      entry: { id: entryId },
    });

    return await this.aiCommentRepository.save(aiComment);
  }

  async getAnswerToQuestion(
    userId: number,
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

    const dialogs = await this.diaryService.findOllDialogsByEntryId(entry.id);

    const answer = await this.generateComment(
      userId,
      prompt,
      question,
      comment.aiModel ?? 'gpt-4o',
      entry.mood ?? 'neutral',
      true,
      entry.content,
      comment.content,
      dialogs,
    );

    return answer;
  }

  async generateTagsForEntry(text: string, aiModel: string): Promise<string[]> {
    const systemMsg: OpenAiMessage = {
      role: 'system',
      content: `Згенеруй теги, а також синоніми для цих тегів, для цього запису в щоденнику ${text
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .trim()}}. Навіть якщо це одне слово. Якщо немає тексту то нічого не генеруй. Теги мають бути короткими, зрозумілими та відображати основні теми та суть запису. Кожен тег має бути або одним словом, або коротким словосполученням через пробіл, не обʼєднуй кілька слів в одне. Використовуй мову запису. Усе має бути одним списком у такому форматі: ["тег1", "синонім1", "синонім2", "тег2", "синонім1", "синонім2", "тег3"].`,
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

  countOpenAiTokens(messages: OpenAiMessage[], aiModel: TiktokenModel): number {
    const enc = encoding_for_model(aiModel);
    let totalTokens = 0;

    const tokensPerMessage = 3;

    for (const message of messages) {
      totalTokens += tokensPerMessage;
      totalTokens += enc.encode(message.content).length;
    }

    totalTokens += 3;
    return totalTokens;
  }
}
