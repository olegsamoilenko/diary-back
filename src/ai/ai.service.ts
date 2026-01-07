import { forwardRef, Inject, Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { encoding_for_model, TiktokenModel } from 'tiktoken';
import type {
  ExtractMemoryResponse,
  MemoryKind,
  MemoryTopic,
  OpenAiMessage,
  ProposedMemoryItem,
  Request,
  TimeContext,
} from './types';
import { PlansService } from 'src/plans/plans.service';
import { UsersService } from 'src/users/users.service';
import { CryptoService } from 'src/kms/crypto.service';
import { throwError } from '../common/utils';
import { HttpStatus } from '../common/utils/http-status';
import { ConfigService } from '@nestjs/config';
import { formatDateForPrompt } from '../common/utils/formatDateForPrompt';
import { TokensService } from 'src/tokens/tokens.service';
import { TokenType } from '../tokens/types';
import { ExtractAssistantMemoryResponse } from './types/assistantMemory';
import { AiModel } from 'src/users/types';
import { AddAiModelAnswerReviewDto } from './dto/add-ai-model-answer-review.dto';
import { AiModelAnswerReview } from './entities/ai-model-answer-review.entity';
import { PositiveNegativeAiModelAnswer } from './entities/positive-negative-ai-model-answer.entity';
import { RegenerateAiModelAnswer } from './entities/regenerate-ai-model-answer.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CONVERSATION_LANGUAGE_LABELS_EN } from 'src/users/constants/conversation-language';
import { ConversationLanguage } from 'src/users/types/settings';
import { AddPositiveNegativeAiModelAnswerDto } from './dto/add-positive-negative-ai-model-answer.dto';
import { AiProvider, MODEL_REGISTRY } from './types/providers';

type StreamUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

type ChunkWithUsage = { usage?: StreamUsage };

type ClaudeTextDeltaEvent = {
  type: 'content_block_delta';
  delta: { type: 'text_delta'; text?: string };
};

type ClaudeMessageDeltaWithStopEvent = {
  type: 'message_delta';
  delta?: { stop_reason?: string | null };
  usage?: { input_tokens?: number; output_tokens?: number };
};

type ClaudeMessageStartEvent = {
  type: 'message_start';
  message?: { usage?: { input_tokens?: number; output_tokens?: number } };
};

@Injectable()
export class AiService {
  private readonly openai: OpenAI;
  private readonly anthropic: Anthropic;

  constructor(
    @InjectRepository(AiModelAnswerReview)
    private aiModelAnswerReviewRepository: Repository<AiModelAnswerReview>,
    @InjectRepository(PositiveNegativeAiModelAnswer)
    private positiveNegativeAiModelAnswerRepository: Repository<PositiveNegativeAiModelAnswer>,
    @InjectRepository(RegenerateAiModelAnswer)
    private regenerateAiModelAnswerRepository: Repository<RegenerateAiModelAnswer>,
    private readonly plansService: PlansService,
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
    private readonly crypto: CryptoService,
    private readonly configService: ConfigService,
    private readonly tokensService: TokensService,
  ) {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  private mapToTiktokenModel(model: AiModel | TiktokenModel): TiktokenModel {
    switch (model) {
      case AiModel.GPT_5_2:
        return 'gpt-5';
      case AiModel.GPT_5_MINI:
        return 'gpt-5-mini';
      default:
        return model as TiktokenModel;
    }
  }

  hasUsage(x: unknown): x is ChunkWithUsage {
    return (
      typeof x === 'object' &&
      x !== null &&
      'usage' in x &&
      typeof (x as Record<string, unknown>).usage === 'object' &&
      (x as Record<string, unknown>).usage !== null
    );
  }

  isOpenAiUsage(u: unknown): u is StreamUsage {
    if (!u || typeof u !== 'object') return false;
    const o = u as Record<string, unknown>;
    return (
      typeof o.prompt_tokens === 'number' &&
      typeof o.completion_tokens === 'number' &&
      typeof o.total_tokens === 'number'
    );
  }

  assertNever(x: never, msg?: string): never {
    throw new Error(msg ?? 'Unexpected value');
  }

  isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null;
  }

  isClaudeTextDeltaEvent(e: unknown): e is ClaudeTextDeltaEvent {
    if (!this.isRecord(e)) return false;
    if (e.type !== 'content_block_delta') return false;
    const delta = e.delta;
    if (!this.isRecord(delta)) return false;
    if (delta.type !== 'text_delta') return false;
    return delta.text == null || typeof delta.text === 'string';
  }

  isClaudeMessageStartEvent(e: unknown): e is ClaudeMessageStartEvent {
    if (!this.isRecord(e)) return false;
    if (e.type !== 'message_start') return false;
    const msg = e.message;
    if (msg == null) return true;
    if (!this.isRecord(msg)) return false;
    const usage = msg.usage;
    if (usage == null) return true;
    if (!this.isRecord(usage)) return false;
    return (
      (usage.input_tokens == null || typeof usage.input_tokens === 'number') &&
      (usage.output_tokens == null || typeof usage.output_tokens === 'number')
    );
  }

  isClaudeMessageDeltaWithStopEvent(
    e: unknown,
  ): e is ClaudeMessageDeltaWithStopEvent {
    if (!this.isRecord(e)) return false;
    if (e.type !== 'message_delta') return false;

    if (e.delta != null) {
      if (!this.isRecord(e.delta)) return false;
      const sr = e.delta.stop_reason;
      if (sr != null && typeof sr !== 'string') return false;
    }

    if (e.usage != null) {
      if (!this.isRecord(e.usage)) return false;
      const u = e.usage;
      if (u.input_tokens != null && typeof u.input_tokens !== 'number')
        return false;
      if (u.output_tokens != null && typeof u.output_tokens !== 'number')
        return false;
    }

    return true;
  }

  getMaxOutTokens(isDialog: boolean): number {
    return isDialog ? 1500 : 2500;
  }

  private async countClaudePayloadTokens(
    modelId: string,
    system: string,
    claudeMessages: { role: 'user' | 'assistant'; content: string }[],
  ): Promise<number> {
    const res = await this.anthropic.messages.countTokens({
      model: modelId,
      system,
      messages: claudeMessages,
    });
    return res.input_tokens;
  }

  private async countClaudeTextTokens(
    modelId: string,
    text: string,
  ): Promise<number> {
    const res = await this.anthropic.messages.countTokens({
      model: modelId,
      system: '',
      messages: [{ role: 'user', content: text }],
    });
    return res.input_tokens;
  }

  async generateComment(
    userId: number,
    userMemory: OpenAiMessage,
    assistantMemory: OpenAiMessage,
    assistantCommitment: OpenAiMessage,
    prompt: OpenAiMessage[],
    text: string,
    timeContext: TimeContext,
    aiModel: AiModel,
    mood: string,
    onToken: (chunk: string) => void,
    isDialog: boolean = false,
    diaryContent?: OpenAiMessage,
    aiComment?: OpenAiMessage,
    dialogs: OpenAiMessage[] = [],
  ): Promise<void> {
    let systemMsg: OpenAiMessage;

    const user = await this.usersService.findById(userId, ['settings']);

    if (!user) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'User not found',
        'User not found',
        'USER_NOT_FOUND',
      );
      return;
    }

    if (isDialog) {
      systemMsg = {
        role: 'system',
        content: `
          My name is ${user?.name}.
          You are my personal smart journal named Nemory.
          You are a professional psychologist, psychoanalyst, psychotherapist. Respond to me as my best friend would, as if we’ve known each other for a long time: lively, friendly, funny with jokes, and sometimes with a touch of sarcasm or irony (but never crossing the line of respect). You are always supportive, able to make a joke, but at the same time, you deeply analyze my entries from the perspective of psychology, emotions, and self-reflection. Act naturally, as if you have your own character. You can ask follow-up questions, react to my emotions, support, or encourage me. You can ask for clarification or share a “phrase of the day”/life hack. Don’t repeat standard phrases like “I can see in your entry that...”. Reply as if we were old friends sitting in a cozy café, joking and talking about all sorts of things. Do not use cliché phrases or textbook-style psychological wording. Avoid boring generic phrases.                  
            
          **Your main task:**
          Help me to:
          - understand and process my thoughts and feelings,
          - analyze my journal entries and provide personalized advice,
          - plan and keep track of my goals and habits,
          - monitor my mental and physical health through daily entries,
          - anticipate and reflect on how my life might change if I continue in the same way
          
          **Context:**
          You are continuing a dialog about one of my diary entries.    
          First, you will receive a short, structured summary of my long-term profile based on previous entries: my values, goals, typical patterns, vulnerabilities, strengths, triggers and coping strategies.
          Consider this general information about me. Use it to better understand how to communicate with me and what may be important to me.     
          Context is provided in the following format:
          - A short long-term profile summary as a system message right after this instruction.
          - A list of your own long-term memory items about our previous work together: key insights, focus areas, agreed directions and stable interaction rules.  
              Consider this your internal notes. Use them to stay consistent in how you have already supported me.
          - А list of your existing commitments and ongoing agreements with me (for example: regular summaries, check-ins, reminders or other routines).  
               You MUST adhere to these commitments, be consistent in your actions, and fulfill them.
          - Other similar past diary records, each starting with: “Previous journal entry (YYYY-MM-DD HH:MM): … mood: …”.
          - The main diary record as a user message starting with: “Current journal entry (YYYY-MM-DD HH:MM): … mood: …”.
          - Your earlier comment to this entry as an assistant message (without any prefix).
          - If there were previous dialogs about this entry, they appear as messages where my questions are prefixed inside the content with “Q: …” and your previous answers are prefixed with “A: …”.
          - Finally, you receive my current message in this dialog. It may be a direct question, a reflection, or a comment, and it does not have to end with a question mark. This is the message you must respond to.
          If you do NOT receive any long-term profile, long-term memory, commitments, or previous entries in the context, assume that this is one of my first entries with you, or that we have not yet talked about this topic.        
          Before replying, carefully read and analyze:
          - the main journal entry,
          - your earlier comment to it,
          - any previous Q/A dialog about this entry,
          - and the similar past entries.         
          Use this context to answer my current message in a way that is clear, thoughtful, and practical — not generic and not just supportive phrases. Ground your answer in what I’ve written and what has already happened in our previous dialogs, as if you remember our whole conversation history.
          Do not copy or repeat prefixes like “Journal entry:”, “Q:”, or “A:”. Just use the context naturally in your response.
          
          **Time context:**
          - timeZone: ${timeContext.timeZone}.
          - offsetMinutes: ${timeContext.offsetMinutes}.
          - nowEpochMs: ${timeContext.nowEpochMs}.
          - nowUtcIso: ${timeContext.nowUtcIso}.
          - locale: ${timeContext.locale}.
          
          **Answering rules (VERY IMPORTANT):**
          - ALWAYS answer my current message directly. Your first sentences must respond to what I just wrote, not only to past context.
          - At the same time, your answer MUST fully take into account the whole context: the main journal entry, your earlier comment to it, any previous Q/A dialog about this entry, and similar past entries. Never answer as if you only saw my last message.
          - Your main priority is to provide a relevant, direct, and helpful answer to my current question or comment, while integrating this context into your reasoning.
          - Pay attention to the dates and times of entries to understand how my state and patterns evolve over time. Recent entries may be more relevant, but older ones can show long-term patterns.
          - Do NOT avoid the question and do not go off into abstract reflections that ignore what I just wrote.
          - Never start your answer with prefixes like “A:”, “Answer:”, “Journal entry:”, “Response:”, “From what I see...”, “According to your entry...” or similar phrases. Just start talking naturally.
          - Never start your reply with meta-comments like "Interpreting:", "I see that you wrote", "From your entry", "According to your text" or similar.
          - Do not explain that you are analyzing or interpreting the text – just show the result of your understanding.
          - Do NOT add any prefixes like “Q:” or “A:” in your reply, even if they appear in the context.
          
          **VERY IMPORTANT:**
          Never invent or fabricate any specific facts about my life, past, personality, relationships, work, health or concrete events. Also do not make up factual information about anything else; if something is not given in the context or you are uncertain, say that you are not sure instead of guessing. When a question or topic requires more details to answer in a precise and helpful way, ask me one or two clear follow-up questions to get the missing information, rather than assuming things on your own.
          
          ${this.buildLanguageBlock(user.settings.conversationLanguage)}
          
          **CRITICAL:**
          Your only name is "Nemory".
          First letter N
          Never call yourself by any other name.
          If I call you by a different name, gently correct me and remind that your name is Nemory.  
          
          Reply only with text, and do not address me formally.
         
          `,
      };
    } else {
      systemMsg = {
        role: 'system',
        content: `
            My name is ${user?.name}.
            You are my personal smart journal named Nemory. 
            You are a professional psychologist, psychoanalyst, psychotherapist. Respond to me as my best friend would, as if we’ve known each other for a long time: lively, friendly, funny with jokes, and sometimes with a touch of sarcasm or irony (but never crossing the line of respect). You are always supportive, able to make a joke, but at the same time, you deeply analyze my entries from the perspective of psychology, emotions, and self-reflection. Act naturally, as if you have your own character. You can ask follow-up questions, react to my emotions, support, or encourage me. Every day include naturally, casually a “phrase of the day”/life hack in your responses. Don’t repeat standard phrases like “I can see in your entry that...”. Reply as if we were old friends sitting in a cozy café, joking and talking about all sorts of things. Do not use cliché phrases or textbook-style psychological wording. Avoid boring generic phrases.
            
            **Your main task:**
            Help me to:
            - understand my thoughts and feelings
            - analyze my entries and give personal advice
            - plan and keep track of my goals and habits
            - monitor my mental and physical health through daily entries
            - anticipate how my life might change if I continue in the same direction
            
            **Context:**
            First, you will receive a short, structured summary of my long-term profile based on previous entries: my values, goals, typical patterns, vulnerabilities, strengths, triggers and coping strategies.  
            Consider this basic information about me. Use it to better understand how to talk to me and what may be important to me. 
            
            Then you will receive a list of your own long-term memory items about our previous work together: key insights, focus areas, agreed directions and stable interaction rules.  
            Treat them as your internal notes. Use them to remain consistent in how you have already supported me.
            
            After that you will receive a list of your existing commitments and ongoing agreements with me (for example: regular summaries, check-ins, reminders or other routines).  
            You MUST adhere to these commitments, be consistent in your actions, and fulfill them.
            
            Then you will receive my current diary record and several previous similar diary entries as context.
            
            If you do NOT receive any long-term profile, long-term memory or previous entries in the context, assume that this is one of my first entries with you, or that we have not yet talked about this topic.
            Format of the context:
              - The main diary record is sent as a user message starting with: “Current journal entry (YYYY-MM-DD HH:MM): … mood: …”.
              - Then you may receive several previous similar diary records, each also starting with: “Previous journal entry (YYYY-MM-DD HH:MM): … mood: …”.
            Before replying, carefully read and analyze the current diary entry and all previous similar entries.  
            Identify patterns, emotions, recurring topics, and possible mental or emotional states.  
            Use this analysis to write a clear, thoughtful, and practical comment that:
            - Resonates with what I wrote and felt.
            - Reflects patterns you notice across entries (even if I don’t mention them directly).
            - Gently normalizes my experience and offers supportive perspective or soft guidance, not commands.
            - Pay attention to the dates and times of entries to understand how my state and patterns evolve over time. Recent entries may be more relevant, but older ones can show long-term patterns.          
            - Do not copy or repeat literal prefixes like “Current journal entry:” or “Previous journal entry:” in your reply. 
            - Never start your reply with meta-comments like "Interpreting:", "I see that you wrote", "From your entry", "According to your text" or similar.
            - Do not explain that you are analyzing or interpreting the text – just show the result of your understanding. 
            - Just write your comment as a natural, human-style response.
            
            **Time context:**
            - timeZone: ${timeContext.timeZone}.
            - offsetMinutes: ${timeContext.offsetMinutes}.
            - nowEpochMs: ${timeContext.nowEpochMs}.
            - nowUtcIso: ${timeContext.nowUtcIso}.
            - locale: ${timeContext.locale}.
            
            **VERY IMPORTANT:**
            Never invent or fabricate any specific facts about my life, past, personality, relationships, work, health or concrete events. Also do not make up factual information about anything else; if something is not given in the context or you are uncertain, say that you are not sure instead of guessing. When a question or topic requires more details to answer in a precise and helpful way, ask me one or two clear follow-up questions to get the missing information, rather than assuming things on your own.
            
            ${this.buildLanguageBlock(user.settings.conversationLanguage)}
            
            **CRITICAL:**
            Your only name is "Nemory".
            First letter N
            Never call yourself by any other name.
            If I call you by a different name, gently correct me and remind that your name is Nemory.  
            
            Respond only with text, without formal greetings like “Dear user.”
            
          `,
      };
    }

    const messages: OpenAiMessage[] = [
      systemMsg,
      userMemory,
      assistantMemory,
      assistantCommitment,
      ...prompt,
    ];

    if (diaryContent) {
      messages.push(diaryContent);
    }

    if (aiComment) {
      messages.push(aiComment);
    }

    const lastDialogs: OpenAiMessage[] = dialogs.flatMap((dialog) => [
      {
        role: dialog.role,
        content: dialog.content,
      },
    ]);

    messages.push(...lastDialogs);

    const lastMessage: OpenAiMessage = {
      role: 'user',
      content: isDialog
        ? `Q: ${text
            .replace(/<[^>]*>/g, '')
            .replace(/&nbsp;/g, ' ')
            .trim()}`
        : `Current journal entry (${formatDateForPrompt(Date.now())}): ${text
            .replace(/<[^>]*>/g, '')
            .replace(/&nbsp;/g, ' ')
            .trim()}. mood: ${mood}`,
    };

    messages.push(lastMessage);

    const spec = MODEL_REGISTRY[aiModel];
    if (!spec) throw new Error(`Unknown aiModel: ${aiModel}`);

    let fullText = '';
    let inputTokens: number | undefined;
    let outputTokens: number | undefined;
    let finishReason: string | undefined;
    let estimated = false;

    if (spec.provider === AiProvider.OPENAI) {
      const res = await this.streamOpenAiChat(
        aiModel,
        spec.providerModelId,
        messages,
        onToken,
        isDialog,
      );
      fullText = res.fullText;
      inputTokens = res.inputTokens;
      outputTokens = res.outputTokens;
      finishReason = res.finishReason;
      estimated = res.estimated;
    } else if (spec.provider === AiProvider.ANTHROPIC) {
      const system = systemMsg.content;
      const res = await this.streamClaudeChat(
        spec.providerModelId,
        system,
        messages,
        onToken,
        isDialog,
      );
      fullText = res.fullText;
      inputTokens = res.inputTokens;
      outputTokens = res.outputTokens;
      finishReason = res.finishReason;
      estimated = res.estimated;
    } else {
      this.assertNever(spec.provider, `Unsupported provider`);
    }

    const tokenType = isDialog ? TokenType.DIALOG : TokenType.ENTRY;

    if (inputTokens != null && outputTokens != null) {
      await this.tokensService.addTokenUserHistory(
        userId,
        tokenType,
        aiModel,
        inputTokens,
        outputTokens,
        finishReason,
        estimated,
      );

      await this.plansService.calculateCredits(
        userId,
        aiModel,
        inputTokens,
        outputTokens,
      );
    }
  }

  buildLanguageBlock(
    conversationLanguage: ConversationLanguage | null,
  ): string {
    if (conversationLanguage) {
      const langName =
        CONVERSATION_LANGUAGE_LABELS_EN[conversationLanguage] ??
        "the user's preferred language";

      return `
            **ABSOLUTE LANGUAGE RULE (HIGHEST PRIORITY):**
            The app has provided my preferred conversation language: ${langName}.
            You MUST answer ONLY in ${langName}.
            Do NOT use any other language –
            not even for a single word, phrase, example or quote.
            If my text is in another language, briefly interpret it in ${langName}
            and continue your answer in ${langName} only.
            Do not switch to any other language without my explicit request.
            Do not explain your language choice.
`.trim();
    }

    return `
            **ABSOLUTE LANGUAGE RULE (HIGHEST PRIORITY):**
            The app has NOT provided a fixed conversation language.
            You MUST answer in the SAME language as the my current journal entry or question.
            Do not mix multiple languages in one answer.
            Do not switch to another language without an explicit request.
            
            Exception:
            If my text is in Russian, you MUST answer in Ukrainian
            and briefly say that you do not know Russian.
`.trim();
  }

  private async streamOpenAiChat(
    aiModel: AiModel,
    modelId: string,
    messages: OpenAiMessage[],
    onToken: (chunk: string) => void,
    isDialog: boolean,
  ): Promise<{
    fullText: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens?: number;
    finishReason?: string;
    estimated: boolean;
  }> {
    const maxOut = this.getMaxOutTokens(isDialog);
    const requestParams: OpenAI.Chat.ChatCompletionCreateParams = {
      model: modelId,
      messages,
      stream: true,
      store: false,
      stream_options: { include_usage: true },
      max_completion_tokens: maxOut,
    };

    const stream = (await this.openai.chat.completions.create(
      requestParams,
    )) as AsyncIterable<OpenAI.Chat.ChatCompletionChunk>;

    let fullText = '';
    let usage: StreamUsage | undefined;
    let finishReason: string | undefined;

    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta?.content;
      if (token) {
        fullText += token;
        onToken(token);
      }

      const fr = chunk.choices?.[0]?.finish_reason;
      if (fr) finishReason = fr;

      const u = (chunk as unknown as { usage?: unknown }).usage;
      if (this.isOpenAiUsage(u)) usage = u;
    }

    if (usage?.prompt_tokens != null && usage?.completion_tokens != null) {
      return {
        fullText,
        inputTokens: usage.prompt_tokens,
        outputTokens: usage.completion_tokens,
        finishReason,
        estimated: false,
      };
    }

    const inputTokens = this.countOpenAiTokens(messages, aiModel);
    const tkModel = this.mapToTiktokenModel(aiModel);
    const enc = encoding_for_model(tkModel);
    const outputTokens = enc.encode(fullText).length;

    return {
      fullText,
      inputTokens,
      outputTokens,
      finishReason,
      estimated: true,
    };
  }

  private async streamClaudeChat(
    modelId: string,
    system: string,
    messages: OpenAiMessage[],
    onToken: (chunk: string) => void,
    isDialog: boolean,
  ): Promise<{
    fullText: string;
    inputTokens: number;
    outputTokens: number;
    finishReason?: string;
    estimated: boolean;
  }> {
    const claudeMessages = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

    const maxOut = this.getMaxOutTokens(isDialog);

    const stream = await this.anthropic.messages.create({
      model: modelId,
      system,
      max_tokens: maxOut,
      messages: claudeMessages,
      stream: true,
    });

    let fullText = '';
    let inputTokens: number | undefined;
    let outputTokens: number | undefined;
    let finishReason: string | undefined;

    for await (const raw of stream as AsyncIterable<unknown>) {
      if (this.isClaudeTextDeltaEvent(raw)) {
        const t = raw.delta.text ?? '';
        if (t) {
          fullText += t;
          onToken(t);
        }
        continue;
      }

      if (this.isClaudeMessageDeltaWithStopEvent(raw)) {
        if (raw.usage) {
          inputTokens = raw.usage.input_tokens ?? inputTokens;
          outputTokens = raw.usage.output_tokens ?? outputTokens;
        }
        const sr = raw.delta?.stop_reason;
        if (typeof sr === 'string' && sr.length) finishReason = sr;
        continue;
      }

      if (this.isClaudeMessageStartEvent(raw) && raw.message?.usage) {
        inputTokens = raw.message.usage.input_tokens ?? inputTokens;
        outputTokens = raw.message.usage.output_tokens ?? outputTokens;
        continue;
      }
    }

    if (inputTokens != null && outputTokens != null) {
      return {
        fullText,
        inputTokens,
        outputTokens,
        finishReason,
        estimated: false,
      };
    }

    const estIn = await this.countClaudePayloadTokens(
      modelId,
      system,
      claudeMessages,
    );
    const estOut = await this.countClaudeTextTokens(modelId, fullText);

    return {
      fullText,
      inputTokens: estIn,
      outputTokens: estOut,
      finishReason,
      estimated: true,
    };
  }

  async generateEmbeddings(
    userId: number,
    texts: string[],
    modelOverride?: string,
  ): Promise<{ tokens: number; vectors: number[][] }> {
    if (!Array.isArray(texts) || texts.length === 0) {
      return { tokens: 0, vectors: [] };
    }

    const model =
      modelOverride ??
      this.configService.get<AiModel>('AI_EMBEDDINGS_MODEL') ??
      AiModel.TEXT_EMBEDDING_3_SMALL;

    const cleaned = texts.map((t) =>
      (t ?? '')
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .trim(),
    );

    if (cleaned.every((t) => t.length === 0)) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'Empty texts',
        'All texts are empty after cleaning.',
        'EMBEDDINGS_EMPTY_INPUT',
      );
    }

    const resp = await this.openai.embeddings.create({
      model,
      input: cleaned,
    });

    if (!resp.data || resp.data.length !== cleaned.length) {
      throwError(
        HttpStatus.INTERNAL_SERVER_ERROR,
        'invalid Embeddings Response',
        'Embeddings response has unexpected length.',
        'INVALID_EMBEDDINGS_RESPONSE',
      );
    }

    let totalTokens = 0;

    if (resp.usage?.total_tokens != null) {
      totalTokens = resp.usage?.total_tokens;
      await this.plansService.calculateCredits(
        userId,
        model as AiModel,
        resp.usage?.total_tokens,
        0,
      );
    } else {
      const tkModel = this.mapToTiktokenModel(model as AiModel);
      const enc = encoding_for_model(tkModel);

      const inputTokens = cleaned.reduce(
        (sum, s) => sum + enc.encode(s).length,
        0,
      );
      totalTokens = inputTokens;
      await this.plansService.calculateCredits(
        userId,
        model as AiModel,
        inputTokens,
        0,
      );
    }

    await this.tokensService.addTokenUserHistory(
      userId,
      TokenType.EMBEDDING,
      model as AiModel,
      totalTokens,
      0,
    );

    const vectors: number[][] = resp.data.map((d) => d.embedding);

    return { tokens: totalTokens, vectors };
  }

  async extractUserMemoryFromText(
    userId: number,
    text: string,
    maxLength: number = 10,
    maxTextChars: number = 20000,
  ): Promise<ProposedMemoryItem[]> {
    const cleaned = text
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .trim();

    if (!cleaned) {
      return [];
    }

    const MAX_TEXT_CHARS = maxTextChars;
    const sliced =
      cleaned.length > MAX_TEXT_CHARS
        ? cleaned.slice(0, MAX_TEXT_CHARS)
        : cleaned;

    const kinds =
      ' "fact", "preference", "goal", "pattern", "value", "strength", "vulnerability", "trigger", "coping_strategy", "boundary", "meta", "other" ';

    const topics =
      ' "self", "work", "study", "relationships", "family", "health", "mental_health", "sleep", "habits", "productivity", "money", "creativity", "lifestyle", "values", "goals", "other" ';

    const systemMsg = {
      role: 'system' as const,
      content: `
You help build long-term memory about the user for a personal AI-powered journal.

Analyze the provided user text and extract only long-term insights about the user.

Types of insights (the "kind" field):

- "fact": a stable fact about the user (circumstances, role, persistent characteristics).
- "preference": preferences, style, what they like or dislike (for example, preferred advice format, communication style).
- "goal": long-term goals or directions of development.
- "pattern": a stable pattern of behavior or thinking. USE "pattern" ONLY if the text EXPLICITLY describes repetitiveness (words like: "always", "constantly", "every time", "regularly", "usually"). If you are not sure — use "fact" instead.
- "value": deep values and principles (what is truly important for the user).
- "strength": strengths, resources, sources of support (things they can rely on).
- "vulnerability": weak points, sensitivities, typical difficulties.
- "trigger": situations or factors that often trigger strong emotional or behavioral reactions.
- "coping_strategy": ways the user deals with stress or emotions (both helpful and harmful).
- "boundary": boundaries the user wants to maintain (in relationships, work, topics of conversation, etc.).
- "meta": settings for interaction with the assistant (how to talk to them, what to avoid in replies).
- "other": an important insight that does not fit any of the categories above.

The "topic" field is the main life area the insight belongs to. POSSIBLE VALUES:
${topics}

Use "other" only if the insight clearly does not fit any of the other topics.

The "importance" field is an integer from 1 to 5:
- 5 — a key point that strongly characterizes the user and is important for most replies.
- 4 — very important, strongly influences advice.
- 3 — useful to know, but not critical for every reply.
- 2 — a weak or local insight.
- 1 — an almost insignificant detail (such insights are better not to include without a good reason).

The "content" field is a short, concrete description of the insight (1–2 sentences, without unnecessary fluff).

REQUIRED RULES FOR "content":
- It is always a description of the user, not their direct speech.
- Do NOT use "I", "me", "my", "mine", "we", etc.
- Do not phrase it as the user’s answer or desire in the first person.
  ❌ "I want to have a lot of money"
  ✅ "Wants to have a lot of money"
  ❌ "I love my car"
  ✅ "Loves their car"
- Do not use the word "User" or similar references in the third person.
- Do not start the sentence with "User ..." or "The user ...".
- Do not put a period at the end.
- Formulate it neutrally, like a line from a personal dossier.

LANGUAGE RULE (CRITICAL):
- You MUST write every "content" value in the SAME LANGUAGE as the user text you are analyzing.
- Do NOT translate the content into any other language.
- Do NOT mix several languages inside one "content" string.
- Ignore the language of these instructions and any examples: they are ONLY about the format and logic, not about the output language.
- Look at the user text and:
  - Identify the main language (the language used in the majority of full sentences).
  - If the text is strongly mixed and you cannot clearly decide, use the language of the FIRST full sentence of the user text.
- Keep the same writing system (script) as in the user text:
  - If the user text is written in a Cyrillic alphabet, your "content" must also be in Cyrillic.
  - If the user text is written in a Latin alphabet, your "content" must also be in Latin.
- NEVER switch to English just because these instructions are in English.

ADDITIONAL RULES:
- Do not invent insights that are not present in the text.
- If the text does not provide enough information — return fewer insights.

Return ONE JSON object in the following format (no Markdown, no comments):

{
  "items": [
    {
      "kind": ${kinds},
      "topic": ${topics},
      "content": "Short description of the insight",
      "importance": 1 | 2 | 3 | 4 | 5
    }
  ]
}

Maximum ${maxLength} items in the "items" array.

Here is the user’s text for analysis:
"""${sliced}"""
      `.trim(),
    };

    const messages = [systemMsg];
    const model =
      this.configService.get<AiModel>('AI_MODEL_FOR_MEMORY') ??
      AiModel.GPT_5_MINI;

    const requestParams: OpenAI.Chat.ChatCompletionCreateParams = {
      model,
      messages,
      store: false,
      max_completion_tokens: 10048,
    } as const;

    const resp = await this.openai.chat.completions.create(requestParams);

    const choice = resp.choices?.[0];
    const aiResp = resp.choices[0].message.content?.trim() ?? '';
    const finishReason = choice?.finish_reason ?? null;

    if (!aiResp) {
      return [];
    }

    let inputTokens: number;
    let outputTokens: number;
    let estimated = false;

    if (
      resp.usage?.prompt_tokens != null &&
      resp.usage?.completion_tokens != null
    ) {
      inputTokens = resp.usage.prompt_tokens;
      outputTokens = resp.usage.completion_tokens;
      estimated = false;
    } else {
      const tkModel = this.mapToTiktokenModel(model);
      const enc = encoding_for_model(tkModel);

      outputTokens = enc.encode(aiResp).length;
      inputTokens = this.countOpenAiTokens(messages, model);

      estimated = true;
    }

    await this.tokensService.addTokenUserHistory(
      userId,
      TokenType.USER_MEMORY,
      model,
      inputTokens,
      outputTokens,
      finishReason,
      estimated,
    );

    await this.plansService.calculateCredits(
      userId,
      model,
      inputTokens,
      outputTokens,
    );

    let parsed: ExtractMemoryResponse;

    try {
      parsed = JSON.parse(aiResp) as ExtractMemoryResponse;

      if (!parsed || !Array.isArray(parsed.items)) {
        throw new Error('Invalid memory JSON shape');
      }
    } catch (err) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'Extract User Memory From Text failed',
        'Extract User Memory From Text.',
        err,
      );
    }

    const items = parsed.items.filter((item) => this.isValidMemoryItem(item));

    for (const item of items) {
      if (item.importance < 1) item.importance = 1;
      if (item.importance > 5) item.importance = 5;
    }

    return items;
  }

  async extractAssistantMemoryFromText(
    userId: number,
    text: string,
    maxLongTerm: number = 10,
    maxCommitments: number = 10,
    maxTextChars: number = 20000,
  ): Promise<ExtractAssistantMemoryResponse> {
    const cleaned = text
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .trim();

    if (!cleaned) {
      return { assistant_long_term: [], assistant_commitments: [] };
    }

    const MAX_TEXT_CHARS = maxTextChars;
    const sliced =
      cleaned.length > MAX_TEXT_CHARS
        ? cleaned.slice(0, MAX_TEXT_CHARS)
        : cleaned;

    const topics =
      ' "self", "work", "study", "relationships", "family", "health", "mental_health", "sleep", "habits", "productivity", "money", "creativity", "lifestyle", "values", "goals", "other" ';

    const longTermKinds =
      ' "insight", "focus_area", "agreed_direction", "strategy", "style_rule", "meta", "other" ';

    const commitmentKinds =
      ' "promise", "ritual", "plan", "follow_up", "reminder", "monitoring", "style_rule", "other" ';

    const systemMsg = {
      role: 'system' as const,
      content: `
You help build long-term memory about the interaction between the AI assistant and the user for a personal AI-powered journal.

As input you receive ONE assistant (AI) message — its reply / comment / utterance in a dialog with the user.

Your task is to extract from THIS text TWO types of summaries:

1) "assistant_long_term" — the model’s long-term memory:
   - key conclusions or realizations that the assistant helped to reach;
   - important themes that the assistant suggests keeping as a long-term focus;
   - the overall direction of change that the assistant proposes as a course of action;
   - agreed working strategies (for example, working in small steps, first sleep then productivity);
   - stable interaction style rules (how the assistant responds specifically to this user).
   This is what will be useful to remember in future conversations so you don’t have to start from scratch.

2) "assistant_commitments" — the assistant’s promises and agreements:
   - everything the assistant EXPLICITLY promises to do in the future (regular summaries, reminders, support for specific goals);
   - rituals that the assistant proposes to make regular (weekly/monthly summaries, regular check-ins);
   - multi-step plans that the assistant proposes to carry out together;
   - agreements to return to a topic later (follow-up);
   - promises about reminders or tracking progress (monitoring, reminder);
   - important style rules (“not to pressure, but gently nudge”, etc.) if they are presented as obligations.

Important:
- Focus specifically on what the assistant DOES or PROMISES TO DO, as well as on shared long-term conclusions.
- If something sounds like both a style rule and a promise, classify it either as a long_term "style_rule" or as a commitment "style_rule", but not in both lists at the same time.
- Do NOT duplicate personal facts about the user — that belongs to a different memory.
- Do NOT invent anything that does not directly follow from the assistant’s reply text.

Formats:

assistant_long_term[].kind POSSIBLE VALUES:
${longTermKinds}

assistant_commitments[].kind POSSIBLE VALUES:
${commitmentKinds}

topic — one of the topics:
${topics}

importance — an integer from 1 to 5:
- 5 — a very important point that should strongly influence future replies.
- 4 — important and often useful.
- 3 — useful, but not critical.
- 1–2 — weak or local (if you are unsure — better not include it).

The "content" field is a short, concrete description (1–2 sentences) in the third person:
- Do not use "I", "you", "we".
- Do not use the words "User" or "Assistant" in the text itself.
- Do not start the sentence with "User ..." or "Assistant ...".
- Do not put a period at the end.
- Describe it neutrally, like a line from a dossier.

Examples for commitments:
  ❌ "I will summarize the dynamics every week"
  ✅ "Promised to summarize mood dynamics and important events every week"

  ❌ "We agreed that I will remind you about your goals"
  ✅ "Agreed to remind about progress on the main goal once a week"

Examples for long_term:
  ✅ "Together concluded that the main problem now is chronic exhaustion due to work"
  ✅ "Focuses on gradual changes instead of radical decisions"

LANGUAGE RULE (CRITICAL):
- You MUST write every "content" value in the SAME LANGUAGE as the user text you are analyzing.
- Do NOT translate the content into any other language.
- Do NOT mix several languages inside one "content" string.
- Ignore the language of these instructions and any examples: they are ONLY about the format and logic, not about the output language.
- Look at the user text and:
  - Identify the main language (the language used in the majority of full sentences).
  - If the text is strongly mixed and you cannot clearly decide, use the language of the FIRST full sentence of the user text.
- Keep the same writing system (script) as in the user text:
  - If the user text is written in a Cyrillic alphabet, your "content" must also be in Cyrillic.
  - If the user text is written in a Latin alphabet, your "content" must also be in Latin.
- NEVER switch to English just because these instructions are in English.

ADDITIONAL RULES:
- If this message contains no explicit promises — "assistant_commitments" may be empty.
- If there are no important long-term conclusions — "assistant_long_term" may be empty.
- It is better to return fewer, but higher-quality items.

Return ONE JSON object without Markdown:

{
  "assistant_long_term": [
    {
      "kind": ${longTermKinds},
      "topic": ${topics},
      "content": "Short description of the conclusion/focus/rule",
      "importance": 1 | 2 | 3 | 4 | 5
    }
  ],
  "assistant_commitments": [
    {
      "kind": ${commitmentKinds},
      "topic": ${topics},
      "content": "Short description of the promise/ritual/plan",
      "importance": 1 | 2 | 3 | 4 | 5
    }
  ]
}

Maximum ${maxLongTerm} items in "assistant_long_term"
and maximum ${maxCommitments} items in "assistant_commitments".

Here is the assistant’s reply text for analysis:
"""${sliced}"""
  `.trim(),
    };

    const messages = [systemMsg];
    const model =
      this.configService.get<AiModel>('AI_MODEL_FOR_MEMORY') ||
      AiModel.GPT_5_MINI;

    const requestParams: OpenAI.Chat.ChatCompletionCreateParams = {
      model,
      messages,
      store: false,
      max_completion_tokens: 10048,
    } as const;

    const resp = await this.openai.chat.completions.create(requestParams);

    const choice = resp.choices?.[0];
    const aiResp = resp.choices[0].message.content?.trim() ?? '';
    const finishReason = choice?.finish_reason ?? null;

    if (!aiResp) {
      return { assistant_long_term: [], assistant_commitments: [] };
    }

    let inputTokens: number;
    let outputTokens: number;
    let estimated = false;

    if (
      resp.usage?.prompt_tokens != null &&
      resp.usage?.completion_tokens != null
    ) {
      inputTokens = resp.usage.prompt_tokens;
      outputTokens = resp.usage.completion_tokens;
      estimated = false;
    } else {
      const tkModel = this.mapToTiktokenModel(model);
      const enc = encoding_for_model(tkModel);

      outputTokens = enc.encode(aiResp).length;
      inputTokens = this.countOpenAiTokens(messages, model);

      estimated = true;
    }

    await this.tokensService.addTokenUserHistory(
      userId,
      TokenType.USER_MEMORY,
      model,
      inputTokens,
      outputTokens,
      finishReason,
      estimated,
    );

    await this.plansService.calculateCredits(
      userId,
      model,
      inputTokens,
      outputTokens,
    );

    let parsed: ExtractAssistantMemoryResponse;

    try {
      parsed = JSON.parse(aiResp) as ExtractAssistantMemoryResponse;

      if (
        !parsed ||
        !Array.isArray(parsed.assistant_long_term) ||
        !Array.isArray(parsed.assistant_commitments)
      ) {
        throw new Error('Invalid assistant memory JSON shape');
      }
    } catch (err) {
      return { assistant_long_term: [], assistant_commitments: [] };
    }

    for (const item of parsed.assistant_long_term) {
      if (item.importance < 1) item.importance = 1;
      if (item.importance > 5) item.importance = 5;
    }
    for (const item of parsed.assistant_commitments) {
      if (item.importance < 1) item.importance = 1;
      if (item.importance > 5) item.importance = 5;
    }

    return parsed;
  }

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

  private isValidMemoryItem(
    item: ProposedMemoryItem,
  ): item is ProposedMemoryItem {
    if (!item || typeof item !== 'object') return false;
    if (typeof item.content !== 'string' || !item.content.trim()) return false;

    const validKinds: MemoryKind[] = [
      'fact',
      'preference',
      'goal',
      'pattern',
      'value',
      'strength',
      'vulnerability',
      'trigger',
      'coping_strategy',
      'boundary',
      'meta',
      'other',
    ];

    const validTopics: MemoryTopic[] = [
      'self',
      'work',
      'study',
      'relationships',
      'family',
      'health',
      'mental_health',
      'sleep',
      'habits',
      'productivity',
      'money',
      'creativity',
      'lifestyle',
      'values',
      'goals',
      'other',
    ];

    if (!validKinds.includes(item.kind)) return false;
    if (!validTopics.includes(item.topic)) return false;

    const importance = Number(item.importance);
    if (!Number.isFinite(importance)) return false;

    return true;
  }

  countOpenAiTokens(messages: OpenAiMessage[], aiModel: AiModel): number {
    const tkModel = this.mapToTiktokenModel(aiModel);
    const enc = encoding_for_model(tkModel);
    let totalTokens = 0;

    const tokensPerMessage = 3;

    for (const message of messages) {
      totalTokens += tokensPerMessage;
      totalTokens += enc.encode(message.content).length;
    }

    totalTokens += 3;
    return totalTokens;
  }

  countStringTokens(texts: string[], aiModel: AiModel): number {
    const tkModel = this.mapToTiktokenModel(aiModel);
    const enc = encoding_for_model(tkModel);
    let totalTokens = 0;

    for (const text of texts) {
      totalTokens += enc.encode(text).length;
    }

    return totalTokens;
  }
}
