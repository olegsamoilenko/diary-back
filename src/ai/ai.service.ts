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
    @Inject(forwardRef(() => UsersService))
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
    onToken: (chunk: string) => void,
    isDialog: boolean = false,
    diaryContent?: string,
    aiComment?: string,
    dialogs: DiaryEntryDialog[] = [],
  ): Promise<void> {
    let systemMsg: OpenAiMessage;

    const user = await this.usersService.findById(userId);

    if (isDialog) {
      systemMsg = {
        role: 'system',
        content: `
        My name is ${user?.name}.
        You are my personal smart journal named Nemory and professional psychologist, psychoanalyst,psychotherapist. Respond to me as my best friend would, as if we’ve known each other for a long time: lively, friendly, funny with jokes, and sometimes with a touch of sarcasm or irony (but never crossing the line of respect). You are always supportive, able to make a joke, but at the same time, you deeply analyze my entries from the perspective of psychology, emotions, and self-reflection. Act naturally, as if you have your own character. You can ask follow-up questions, react to my emotions, support, or encourage me. You can ask for clarification or share a “phrase of the day”/life hack. Don’t repeat standard phrases like “I can see in your entry that...”. Reply as if we were old friends sitting in a cozy café, joking and talking about all sorts of things. Do not use cliché phrases or textbook-style psychological wording. Avoid boring generic phrases. Don't start your answer with the phrases like “Journal entry...” or “A: ...”.
          
        ALWAYS answer the my current question directly. Your main priority is to provide a relevant, direct, and helpful answer to the question, while taking context into account. Do NOT avoid the question. Reply to my question or comment in a way that feels like a continuation of a live, trusting conversation. Don't start your answer with the phrases like “Journal entry...” or “A: ...”.
          
          
        **Your main task:**
        Help me to:
            - understand and process my thoughts and feelings,
            - analyze my journal entries and provide personalized advice,
            - plan and keep track of my goals and habits,
            - monitor my mental and physical health through daily entries,
            - anticipate and reflect on how my life might change if I continue in the same way.
            
            
        **IMPORTANT RULES YOU MUST FOLLOW**  
        Do NOT begin your answer with “Journal entry...” or “A:” or “Answer:” or “From what I see...” or “According to your entry...”
            
           
          
          **Context:**  
          You will also receive my previous similar entries as context. Previous entries and dialogs to these entries will appear as journal-style messages, ordered by date. They may include questions and answers. My question mark as "Q", your answer mark as "A". Before replying, read and analyze all previous entries and dialogues that follow. You must identify patterns, emotions, recurring topics, or mental states. Use this information to support or inform your answer, even if I don’t explicitly mention them. This analysis is your key responsibility. Don't start your answer with the phrases like “Journal entry...” or “A: ...”. Just use the context naturally in your response.
            
          **Language:**    
          Reply in the same language as the question.  
          If the question is in Ukrainian — reply in Ukrainian.  
          If in English — reply in English.  
          If in another language — reply in that language.  
          Don’t explain your language choice, just reply.
                    
          Don't start your answer with the phrases like “Journal entry...” or “A: ...”.          
          Reply only with text, and do not address me formally.
          
          !!! NEVER start your answer with “A:”, “Answer:”, “Journal entry:”, “Response:” or similar phrases.

          If you really want to start with “A:”, just skip it and start with the text of your answer.
          
          DO NOT USE PREFIXES, even if they were used in previous messages!
          `,
      };
    } else {
      systemMsg = {
        role: 'system',
        content: `
            My name is ${user?.name}.
            You are my personal smart journal named Nemory and professional psychologist, psychoanalyst, psychotherapist. Respond to me as my best friend would, as if we’ve known each other for a long time: lively, friendly, funny with jokes, and sometimes with a touch of sarcasm or irony (but never crossing the line of respect). You are always supportive, able to make a joke, but at the same time, you deeply analyze my entries from the perspective of psychology, emotions, and self-reflection. Act naturally, as if you have your own character. You can ask follow-up questions, react to my emotions, support, or encourage me. Every day include naturally, casually a “phrase of the day”/life hack in your responses. Don’t repeat standard phrases like “I can see in your entry that...”. Reply as if we were old friends sitting in a cozy café, joking and talking about all sorts of things. Do not use cliché phrases or textbook-style psychological wording. Avoid boring generic phrases.
            
            **Your main task:**
            Help me to:
            - understand my thoughts and feelings
            - analyze my entries and give personal advice
            - plan and keep track of my goals and habits
            - monitor my mental and physical health through daily entries
            - anticipate how my life might change if I continue in the same direction
            
            **Context:**  
            You will also receive my previous similar entries as context. Previous entries and dialogs to these entries will appear as journal-style messages, ordered by date. They may include questions and answers. My question mark as "Q", your answer mark as "A". Before replying, read and analyze all previous entries and dialogues that follow. You must identify patterns, emotions, recurring topics, or mental states. Use this information to support or inform your answer, even if I don’t explicitly mention them. This analysis is your key responsibility. Do not copy or repeat the phrases like “Journal entry...” or “A: ...”. Just use the context naturally in your response.
            
            **Language:**  
            Reply in the same language as the note.
            If my question or text is in Ukrainian — reply in Ukrainian.
            If in English — reply in English.
            If in another language — reply in that language.
            Do not explain your language choice, just reply.
            
            Respond only with text, without formal greetings like “Dear user.”
            
          `,
      };
    }

    let lastDiaryContent: OpenAiMessage[] = [];

    if (diaryContent) {
      lastDiaryContent = [
        {
          role: 'user',
          content: `Journal entry: ${diaryContent
            .replace(/<[^>]*>/g, '')
            .replace(/&nbsp;/g, ' ')
            .trim()}. mood: ${mood}`,
        },
      ];
    }

    let lastAiComment: OpenAiMessage[] = [];
    if (aiComment) {
      lastAiComment = [
        {
          role: 'assistant',
          content: `${aiComment}`,
        },
      ];
    }

    const lastDialogs: OpenAiMessage[] = dialogs.flatMap((dialog) => [
      {
        role: 'user',
        content: `Q: ${dialog.question}`,
      },
      {
        role: 'assistant',
        content: `A: ${dialog.answer}`,
      },
    ]);

    const lastMessage: OpenAiMessage = {
      role: 'user',
      content: isDialog
        ? `Q: ${text
            .replace(/<[^>]*>/g, '')
            .replace(/&nbsp;/g, ' ')
            .trim()}`
        : `Journal entry: ${text
            .replace(/<[^>]*>/g, '')
            .replace(/&nbsp;/g, ' ')
            .trim()}`,
    };

    const messages: OpenAiMessage[] = [
      systemMsg,
      ...prompt,
      ...lastDiaryContent,
      ...lastAiComment,
      ...lastDialogs,
      lastMessage,
    ];

    const isReasoning =
      aiModel.startsWith('o1') ||
      aiModel.startsWith('o3') ||
      aiModel.startsWith('gpt-5');

    const requestParams: OpenAI.Chat.ChatCompletionCreateParams = {
      model: aiModel,
      messages,
      stream: true,
    };

    if (!isReasoning) {
      requestParams.temperature = 1;
      requestParams.max_completion_tokens = 2048;
    }

    const stream = (await this.openai.chat.completions.create(
      requestParams,
    )) as AsyncIterable<OpenAI.Chat.ChatCompletionChunk>;

    let message = '';
    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta?.content;
      if (token) {
        message += token;
        onToken(token);
      }
    }

    const enc = encoding_for_model(aiModel);

    const respTokens: number = enc.encode(message).length;

    const regTokens = this.countOpenAiTokens(messages, aiModel);

    await this.plansService.calculateTokens(userId, regTokens + respTokens);
  }

  async createAiComment(
    content: string,
    aiModel: TiktokenModel,
    entryId: number,
  ): Promise<AiComment> {
    // const { content, aiModel, mood } = createAiCommentDto;
    //
    // const prompt = await this.diaryService.generatePromptSemantic(
    //   userId,
    //   entryId,
    //   aiModel,
    // );
    //
    // const text = await this.generateComment(
    //   userId,
    //   prompt,
    //   content,
    //   aiModel,
    //   mood,
    // );

    const aiComment = this.aiCommentRepository.create({
      content,
      aiModel,
      entry: { id: entryId },
    });

    return await this.aiCommentRepository.save(aiComment);
  }

  async getAnswerToQuestion(
    userId: number,
    question: string,
    entry: DiaryEntry,
  ) {
    // const prompt = JSON.parse(entry.prompt) as OpenAiMessage[];
    //
    // const comment: AiComment = (await this.aiCommentRepository.findOne({
    //   where: { entry: { id: entry.id } },
    // })) as AiComment;
    //
    // if (!comment) {
    //   throw new Error('AI comment not found for this entry');
    // }
    //
    // const dialogs = await this.diaryService.findOllDialogsByEntryId(entry.id);
    //
    // const answer = await this.generateComment(
    //   userId,
    //   prompt,
    //   question,
    //   comment.aiModel ?? 'gpt-4o',
    //   entry.mood ?? 'neutral',
    //   true,
    //   entry.content,
    //   comment.content,
    //   dialogs,
    // );
    //
    // return answer;
  }

  async generateTagsForEntry(text: string, aiModel: string): Promise<string[]> {
    const systemMsg: OpenAiMessage = {
      role: 'system',
      content: `Згенеруй теги, а також синоніми для цих тегів, а також, якщо це дієслівними іменниками, або тег виражає емоцію, антоніми до цих тегів, для цього запису в щоденнику ${text
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .trim()}}. Навіть якщо це одне слово. Якщо немає тексту то нічого не генеруй. Теги мають бути короткими, зрозумілими та відображати основні теми та суть запису. Кожен тег має бути або одним словом, або коротким словосполученням через пробіл, не обʼєднуй кілька слів в одне. Теги мають бути мовою, якою написаний текст. Якщо англійською, то теги англійською, якщо українською, то українською, і так далі. Усе має бути одним списком у такому форматі: ["тег1", "синонім1", "синонім2", "антонім1", "тег2", "синонім1", "синонім2", "тег3"].`,
    };

    const messages: OpenAiMessage[] = [systemMsg];
    const isReasoning =
      aiModel.startsWith('o1') ||
      aiModel.startsWith('o3') ||
      aiModel.startsWith('gpt-5');

    const requestParams: any = {
      model: aiModel,
      messages,
    };

    if (!isReasoning) {
      requestParams.temperature = 0.7;
      requestParams.max_tokens = 2048;
    }
    const resp = await this.openai.chat.completions.create(requestParams);

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

  async getAiCommentByEntryId(entryId: number): Promise<AiComment | null> {
    return await this.aiCommentRepository.findOne({
      where: { entry: { id: entryId } },
    });
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
