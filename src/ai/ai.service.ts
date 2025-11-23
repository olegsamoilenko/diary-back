import { forwardRef, Inject, Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { encoding_for_model, TiktokenModel } from 'tiktoken';
import type {
  ExtractMemoryResponse,
  MemoryKind,
  MemoryTopic,
  OpenAiMessage,
  ProposedMemoryItem,
  Request,
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

type StreamUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

type ChunkWithUsage = { usage?: StreamUsage };

@Injectable()
export class AiService {
  private readonly openai: OpenAI;

  constructor(
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

  async generateComment(
    userId: number,
    userMemory: OpenAiMessage,
    prompt: OpenAiMessage[],
    text: string,
    aiModel: TiktokenModel,
    mood: string,
    onToken: (chunk: string) => void,
    isDialog: boolean = false,
    diaryContent?: OpenAiMessage,
    aiComment?: OpenAiMessage,
    dialogs: OpenAiMessage[] = [],
  ): Promise<void> {
    let systemMsg: OpenAiMessage;

    const user = await this.usersService.findById(userId);

    if (isDialog) {
      systemMsg = {
        role: 'system',
        content: `
          My name is ${user?.name}.
          You are my personal smart journal named Nemory and a professional psychologist, psychoanalyst, psychotherapist. Respond to me as my best friend would, as if we’ve known each other for a long time: lively, friendly, funny with jokes, and sometimes with a touch of sarcasm or irony (but never crossing the line of respect). You are always supportive, able to make a joke, but at the same time, you deeply analyze my entries from the perspective of psychology, emotions, and self-reflection. Act naturally, as if you have your own character. You can ask follow-up questions, react to my emotions, support, or encourage me. You can ask for clarification or share a “phrase of the day”/life hack. Don’t repeat standard phrases like “I can see in your entry that...”. Reply as if we were old friends sitting in a cozy café, joking and talking about all sorts of things. Do not use cliché phrases or textbook-style psychological wording. Avoid boring generic phrases.
                     
            
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
          Treat this as background knowledge about me — do NOT quote it literally and do not repeat it word for word. Use it only to better understand how to talk to me and what may be important for me.      
          Context is provided in the following format:
          - A short long-term profile summary as a system message right after this instruction.
          - Other similar past diary records, each starting with: “Previous journal entry (YYYY-MM-DD HH:MM): … mood: …”.
          - The main diary record as a user message starting with: “Current journal entry (YYYY-MM-DD HH:MM): … mood: …”.
          - Your earlier comment to this entry as an assistant message (without any prefix).
          - If there were previous dialogs about this entry, they appear as messages where my questions are prefixed inside the content with “Q: …” and your previous answers are prefixed with “A: …”.
          - Finally, you receive my current message in this dialog. It may be a direct question, a reflection, or a comment, and it does not have to end with a question mark. This is the message you must respond to.
          If you do NOT receive any long-term profile or previous entries in the context, assume that this is one of my first entries with you, or that we have not yet talked about this topic.         
          Before replying, carefully read and analyze:
          - the main journal entry,
          - your earlier comment to it,
          - any previous Q/A dialog about this entry,
          - and the similar past entries.         
          Use this context to answer my current message in a way that is clear, thoughtful, and practical — not generic and not just supportive phrases. Ground your answer in what I’ve written and what has already happened in our previous dialogs, as if you remember our whole conversation history.
          Do not copy or repeat prefixes like “Journal entry:”, “Q:”, or “A:”. Just use the context naturally in your response.
          
          **Answering rules (VERY IMPORTANT):**
          - ALWAYS answer my current message directly. Your first sentences must respond to what I just wrote, not only to past context.
          - At the same time, your answer MUST fully take into account the whole context: the main journal entry, your earlier comment to it, any previous Q/A dialog about this entry, and similar past entries. Never answer as if you only saw my last message.
          - Your main priority is to provide a relevant, direct, and helpful answer to my current question or comment, while integrating this context into your reasoning.
          - Pay attention to the dates and times of entries to understand how my state and patterns evolve over time. Recent entries may be more relevant, but older ones can show long-term patterns.
          - Do NOT avoid the question and do not go off into abstract reflections that ignore what I just wrote.
          - Never invent or fabricate any specific facts about my life, past, personality, relationships, work, health or concrete events. Also do not make up factual information about anything else; if something is not given in the context or you are uncertain, say that you are not sure instead of guessing. When a question or topic requires more details to answer in a precise and helpful way, ask me one or two clear follow-up questions to get the missing information, rather than assuming things on your own.
          - Never start your answer with prefixes like “A:”, “Answer:”, “Journal entry:”, “Response:”, “From what I see...”, “According to your entry...” or similar phrases. Just start talking naturally.
          - Do NOT add any prefixes like “Q:” or “A:” in your reply, even if they appear in the context.
          
          **Language:**
          Reply in the same language as the question.
          If the question is in Ukrainian — reply in Ukrainian.
          If in English — reply in English.
          If in another language — reply in that language.
          Don’t explain your language choice, just reply.
          
          Reply only with text, and do not address me formally.
         
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
            First, you will receive a short, structured summary of my long-term profile based on previous entries: my values, goals, typical patterns, vulnerabilities, strengths, triggers and coping strategies.  
            Treat this as background knowledge about me — do NOT quote it literally and do not repeat it word for word. Use it only to better understand how to talk to me and what may be important for me.
            Then  you will receive my current diary record and several previous similar diary entries as context.
            If you do NOT receive any long-term profile or previous entries in the context, assume that this is one of my first entries with you, or that we have not yet talked about this topic.
            Format of the context:
              - The main diary record is sent as a user message starting with: “Current journal entry (YYYY-MM-DD HH:MM): … mood: …”.
              - Then you may receive several previous similar diary records, each also starting with: “Previous journal entry (YYYY-MM-DD HH:MM): … mood: …”.
            Before replying, carefully read and analyze the current diary entry and all previous similar entries.  
            Identify patterns, emotions, recurring topics, and possible mental or emotional states.  
            Use this analysis to write a clear, thoughtful, and practical comment that:
            - Resonates with what I wrote and felt.
            - Reflects patterns you notice across entries (even if I don’t mention them directly).
            - Gently normalizes my experience and offers supportive perspective or soft guidance, not commands.
            Pay attention to the dates and times of entries to understand how my state and patterns evolve over time. Recent entries may be more relevant, but older ones can show long-term patterns.          
            + Do not copy or repeat literal prefixes like “Current journal entry:” or “Previous journal entry:” in your reply.  
            Just write your comment as a natural, human-style response, in the same language as the diary entry.
            
            **VERY IMPORTANT:**
            Never invent or fabricate any specific facts about my life, past, personality, relationships, work, health or concrete events. Also do not make up factual information about anything else; if something is not given in the context or you are uncertain, say that you are not sure instead of guessing. When a question or topic requires more details to answer in a precise and helpful way, ask me one or two clear follow-up questions to get the missing information, rather than assuming things on your own.
            
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

    const messages: OpenAiMessage[] = [systemMsg, userMemory, ...prompt];

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

    const isReasoning =
      aiModel.startsWith('o1') ||
      aiModel.startsWith('o3') ||
      aiModel.startsWith('gpt-5');

    const requestParams: OpenAI.Chat.ChatCompletionCreateParams = {
      model: aiModel,
      messages,
      stream: true,
      stream_options: { include_usage: true },
    };

    if (!isReasoning) {
      requestParams.temperature = 1;
      requestParams.max_completion_tokens = 2048;
    }

    const stream = (await this.openai.chat.completions.create(
      requestParams,
    )) as AsyncIterable<OpenAI.Chat.ChatCompletionChunk>;

    let message = '';
    let streamUsage: StreamUsage | undefined;

    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta?.content;
      if (token) {
        message += token;
        onToken(token);
      }

      if (this.hasUsage(chunk) && chunk.usage) {
        const { prompt_tokens, completion_tokens, total_tokens } = chunk.usage;
        streamUsage = {
          prompt_tokens,
          completion_tokens,
          total_tokens,
        };
      }
    }

    const tokenType = isDialog ? TokenType.DIALOG : TokenType.ENTRY;

    if (streamUsage?.prompt_tokens && streamUsage?.completion_tokens) {
      await this.tokensService.addTokenUserHistory(
        userId,
        tokenType,
        streamUsage.prompt_tokens,
        streamUsage.completion_tokens,
      );
    }

    if (streamUsage?.total_tokens != null) {
      await this.plansService.calculateTokens(userId, streamUsage.total_tokens);
    } else {
      const enc = encoding_for_model(aiModel);
      const respTokens = enc.encode(message).length;
      const regTokens = this.countOpenAiTokens(messages, aiModel);
      await this.plansService.calculateTokens(userId, regTokens + respTokens);
    }
  }

  async generateFullTextTags(text: string): Promise<string[]> {
    const cleaned = text
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .trim();

    if (!cleaned) {
      return [];
    }

    const systemMsg: OpenAiMessage = {
      role: 'system',
      content: `Згенеруй теги, а також синоніми для цих тегів, а також, якщо це дієслівні іменники, або тег виражає емоцію, антоніми до цих тегів, для цього запису ${text
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .trim()}}. Навіть якщо це одне слово. Якщо немає тексту то нічого не генеруй. Теги мають бути короткими, зрозумілими та відображати основні теми та суть запису. Кожен тег має бути або одним словом, або коротким словосполученням через пробіл, не обʼєднуй кілька слів в одне. Теги мають бути мовою, якою написаний текст. Якщо англійською, то теги англійською, якщо українською, то українською, і так далі. Усе має бути одним списком у такому форматі: ["тег1", "синонім1", "синонім2", "антонім1", "тег2", "синонім1", "синонім2", "тег3"].`,
    };

    const messages: OpenAiMessage[] = [systemMsg];
    // const isReasoning =
    //   aiModel.startsWith('o1') ||
    //   aiModel.startsWith('o3') ||
    //   aiModel.startsWith('gpt-5');

    const requestParams: Request = {
      model: this.configService.get('AI_MODEL_FOR_GENERATION_TAGS') || 'gpt-4o',
      messages,
      temperature: 0.7,
      max_tokens: 2048,
    };

    // if (!isReasoning) {
    //   requestParams.temperature = 0.7;
    //   requestParams.max_tokens = 2048;
    // }
    const resp = await this.openai.chat.completions.create(requestParams);

    let tags: string[] = [];
    const aiResp = resp.choices[0].message.content?.trim() ?? '';

    try {
      tags = JSON.parse(aiResp) as string[];
      if (!Array.isArray(tags)) {
        throwError(
          HttpStatus.BAD_REQUEST,
          'Generation tags failed',
          'Generation tags failed.',
          'GENERATION_TAGS_FAILED',
        );
      }
    } catch {
      tags = aiResp
        .replace(/[[]"']/g, '')
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean);
    }

    return tags;
  }

  async generateSnippetTags(snippets: string[]): Promise<string[][]> {
    const filtered = (snippets ?? []).map((s) =>
      (s ?? '').replace(/\s+/g, ' ').trim(),
    );

    if (!filtered.length) {
      return [];
    }

    const systemMsg: OpenAiMessage = {
      role: 'system',
      content: `
Тобі буде передано JSON-масив текстових фрагментів (сніпетів) щоденника.

Для КОЖНОГО сніпета згенеруй окремий список тегів, синонімів і, якщо доречно,
антонімів (як ти вже робиш для повного запису).

Важливо:
- Мова тегів = мові сніпета.
- Кожен внутрішній список має формат:
  ["тег1","синонім1","синонім2","антонім1","тег2",...]
- Якщо сніпет порожній або беззмістовний — поверни для нього порожній масив [].
- Кількість внутрішніх масивів у відповіді МАЄ дорівнювати кількості вхідних сніпетів.

Формат відповіді: масив масивів, наприклад:
[
  ["тег1","синонім1"],
  ["tag2","synonym2","antonym2"],
  []
]
      `.trim(),
    };

    const userMsg: OpenAiMessage = {
      role: 'user',
      content: JSON.stringify(filtered, null, 2),
    };

    const requestParams: Request = {
      model: this.configService.get('AI_MODEL_FOR_GENERATION_TAGS') ?? 'gpt-4o',
      messages: [systemMsg, userMsg],
      temperature: 0.5,
      max_tokens: 4096,
    };

    const resp = await this.openai.chat.completions.create(requestParams);
    const aiResp = resp.choices[0]?.message?.content?.trim() ?? '';

    let parsed: unknown;

    try {
      parsed = JSON.parse(aiResp);
    } catch {
      throwError(
        HttpStatus.BAD_REQUEST,
        'invalidSnippetTagsJson',
        'Failed to parse snippet tags JSON.',
        'GENERATION_SNIPPET_TAGS_FAILED',
      );
    }

    if (
      !Array.isArray(parsed) ||
      !parsed.every(
        (item) =>
          Array.isArray(item) && item.every((t) => typeof t === 'string'),
      )
    ) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'invalidSnippetTagsFormat',
        'Snippet tags must be array of string arrays.',
        'GENERATION_SNIPPET_TAGS_FAILED',
      );
    }

    return parsed;
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
      this.configService.get<string>('AI_EMBEDDINGS_MODEL') ??
      'text-embedding-3-small';

    const cleaned = texts.map((t) =>
      (t ?? '')
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .trim(),
    );

    if (cleaned.every((t) => t.length === 0)) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'emptyTexts',
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
        'invalidEmbeddingsResponse',
        'Embeddings response has unexpected length.',
        'EMBEDDINGS_INVALID_RESPONSE',
      );
    }

    let totalTokens = 0;

    if (resp.usage?.total_tokens != null) {
      totalTokens = resp.usage?.total_tokens;
      await this.plansService.calculateTokens(userId, resp.usage?.total_tokens);
    } else {
      const regTokens = this.countStringTokens(cleaned, model as TiktokenModel);
      totalTokens = regTokens;
      await this.plansService.calculateTokens(userId, regTokens);
    }

    await this.tokensService.addTokenUserHistory(
      userId,
      TokenType.EMBEDDING,
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
Ти допомагаєш сформувати довготривалу пам'ять про користувача для особистого щоденника з AI.

Проаналізуй наданий текст користувача і витягни тільки довготривалі інсайти про користувача.

Види інсайтів (поле "kind"):

- "fact": стабільний факт про користувача (обставини, роль, постійні особливості).
- "preference": вподобання, стиль, що подобається або не подобається (наприклад, формат порад, стиль спілкування).
- "goal": довгострокові цілі або напрямки розвитку.
- "pattern": стійкий патерн поведінки або мислення. ВИКОРИСТОВУЙ "pattern" ТІЛЬКИ якщо текст ЯВНО описує повторюваність (слова: "завжди", "постійно", "кожного разу", "регулярно", "зазвичай"). Якщо не впевнений — краще "fact".
- "value": глибинні цінності та принципи (що для користувача справді важливо).
- "strength": сильні сторони, ресурси, опори (те, на що можна спертися).
- "vulnerability": слабкі місця, вразливості, типові труднощі.
- "trigger": ситуації або фактори, які часто запускають сильні емоційні або поведінкові реакції.
- "coping_strategy": способи, якими користувач справляється зі стресом або емоціями (як корисні, так і шкідливі).
- "boundary": межі, які користувач хоче зберігати (у стосунках, роботі, темах розмови тощо).
- "meta": налаштування взаємодії з помічником (як краще з ним говорити, чого уникати у відповідях).
- "other": важливий інсайт, який не підходить ні під одну категорію вище.

Поле "topic" — основна сфера життя, до якої належить інсайт. МОЖЛИВІ ЗНАЧЕННЯ:
${topics}

Використовуй "other" тільки якщо інсайт точно не підходить під жодну з інших тем.

Поле "importance" — ціле число від 1 до 5:
- 5 — ключова річ, яка дуже сильно характеризує користувача і важлива для більшості відповідей.
- 4 — дуже важливо, сильно впливає на поради.
- 3 — корисно знати, але не критично для кожної відповіді.
- 2 — слабкий або локальний інсайт.
- 1 — майже незначна деталь (такі інсайти краще не додавати без потреби).

Поле "content" — короткий, конкретний опис інсайту (1–2 фрази, без зайвої води).

ОБОВ'ЯЗКОВО ДЛЯ "content":
- Це завжди опис користувача, а не його пряма мова.
- НЕ використовуй "я", "мені", "мене", "мій", "моє", "ми" тощо.
- Не формулюй як відповідь користувача або бажання у першій особі.
  ❌ "Я хочу мати багато грошей"
  ✅ "Хоче мати багато грошей"
  ❌ "Я люблю свою машину"
  ✅ "Любить свою машину"
- Не використовуй слово "Користувач", "User" або подібні звернення у третій особі.
- Не починай фразу з "Користувач ..." або "User ...".
- Не став крапку в кінці.
- Формулюй нейтрально, як рядок з особистого досьє.

МОВА:
- Пиши "content" тією ж мовою, якою написаний текст користувача.
  Якщо текст англійською — пиши англійською.
  Якщо текст українською — пиши українською. І так далі.

ДОДАТКОВІ ПРАВИЛА:
- Не вигадуй інсайти, яких немає у тексті.
- Якщо текст не дає достатньо інформації — повертай менше інсайтів.

Поверни ОДИН JSON-об'єкт такого формату (без Markdown, без коментарів):

{
  "items": [
    {
      "kind": ${kinds},
      "topic": ${topics},
      "content": "Короткий опис інсайту.",
      "importance": 1 | 2 | 3 | 4 | 5
    }
  ]
}

Максимум ${maxLength} елементів у масиві "items".

Текст користувача для аналізу:
"""${sliced}"""
      `.trim(),
    };

    const messages = [systemMsg];

    const requestParams: Request = {
      model: this.configService.get('AI_MODEL_FOR_MEMORY') || 'gpt-4o',
      messages,
      temperature: 0.2,
      max_tokens: 1024,
    } as const;

    const resp = await this.openai.chat.completions.create(requestParams);

    const aiResp = resp.choices[0].message.content?.trim() ?? '';

    if (!aiResp) {
      return [];
    }

    if (resp.usage) {
      const { prompt_tokens, completion_tokens, total_tokens } = resp.usage;
      await this.tokensService.addTokenUserHistory(
        userId,
        TokenType.MEMORY,
        prompt_tokens,
        completion_tokens,
      );

      if (total_tokens != null) {
        await this.plansService.calculateTokens(userId, total_tokens);
      } else {
        const enc = encoding_for_model(
          this.configService.get('AI_MODEL_FOR_MEMORY') || 'gpt-4o',
        );
        const respTokens = enc.encode(aiResp).length;
        const regTokens = this.countOpenAiTokens(
          messages,
          this.configService.get('AI_MODEL_FOR_MEMORY') || 'gpt-4o',
        );
        await this.plansService.calculateTokens(userId, regTokens + respTokens);
      }
    }

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
        'EXTRACT_USER_MEMORY_FROM_TEXT_FAILED',
        err,
      );
      return [];
    }

    const items = parsed.items.filter((item) => this.isValidMemoryItem(item));

    for (const item of items) {
      if (item.importance < 1) item.importance = 1;
      if (item.importance > 5) item.importance = 5;
    }

    return items;
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

  countStringTokens(texts: string[], aiModel: TiktokenModel): number {
    const enc = encoding_for_model(aiModel);
    let totalTokens = 0;

    for (const text of texts) {
      totalTokens += enc.encode(text).length;
    }

    return totalTokens;
  }
}
