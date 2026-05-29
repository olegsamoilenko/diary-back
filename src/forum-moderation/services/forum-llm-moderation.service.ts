import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { createHash } from 'crypto';
import { ForumModerationDecision } from '../enums/forum-moderation-decision.enum';
import { ForumModerationRuleCode } from '../enums/forum-moderation-rule-code.enum';
import { ForumModerationAiUsageService } from './forum-moderation-ai-usage.service';

export type ForumLlmModerationInputStage = {
  stage?: string;
  decision: ForumModerationDecision;
  ruleCode: ForumModerationRuleCode | null;
  riskScore: number;
  reason: string | null;
  signals: string[];
  contentHash: string | null;
  metadataJson?: Record<string, any> | null;
};

export type ForumLlmModerationResult = {
  decision: ForumModerationDecision;
  ruleCode: ForumModerationRuleCode | null;
  riskScore: number;
  reason: string;
  signals: string[];
  contentHash: string;
  metadataJson: Record<string, any>;
};

type LlmModerationJson = {
  decision: ForumModerationDecision;
  ruleCode: ForumModerationRuleCode | null;
  riskScore: number;
  confidence: number;
  reason: string;
  userMessage: string;
  signals: string[];
};

@Injectable()
export class ForumLlmModerationService {
  private readonly openai: OpenAI;
  private readonly model: string;

  constructor(
    private readonly config: ConfigService,
    private readonly moderationAiUsageService: ForumModerationAiUsageService,
  ) {
    this.openai = new OpenAI({
      apiKey: this.config.getOrThrow<string>('OPENAI_API_KEY'),
    });

    this.model = this.config.get<string>(
      'FORUM_LLM_MODERATION_MODEL',
      'gpt-5-nano',
    );
  }

  async check(params: {
    userId: number;
    targetType: 'topic' | 'comment';
    title?: string | null;
    content: string;
    previousStageResult: ForumLlmModerationInputStage;
  }): Promise<ForumLlmModerationResult> {
    const text = `${params.title ?? ''}\n${params.content ?? ''}`.trim();

    const normalized = text
      .toLowerCase()
      .normalize('NFKC')
      .replace(/\s+/g, ' ')
      .trim();

    const contentHash = createHash('sha256').update(normalized).digest('hex');

    const response = await this.openai.responses.create({
      model: this.model,
      input: [
        {
          role: 'system',
          content: this.buildSystemPrompt(),
        },
        {
          role: 'user',
          content: JSON.stringify({
            targetType: params.targetType,
            title: params.title ?? null,
            content: params.content,
            previousStageResult: params.previousStageResult,
          }),
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'forum_llm_moderation_result',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            required: [
              'decision',
              'ruleCode',
              'riskScore',
              'confidence',
              'reason',
              'userMessage',
              'signals',
            ],
            properties: {
              decision: {
                type: 'string',
                enum: [
                  ForumModerationDecision.ALLOW,
                  ForumModerationDecision.BLOCK,
                  ForumModerationDecision.ESCALATE_HUMAN,
                ],
              },
              ruleCode: {
                anyOf: [
                  {
                    type: 'string',
                    enum: Object.values(ForumModerationRuleCode),
                  },
                  { type: 'null' },
                ],
              },
              riskScore: {
                type: 'number',
                minimum: 0,
                maximum: 100,
              },
              confidence: {
                type: 'number',
                minimum: 0,
                maximum: 1,
              },
              reason: {
                type: 'string',
              },
              userMessage: {
                type: 'string',
              },
              signals: {
                type: 'array',
                items: {
                  type: 'string',
                },
              },
            },
          },
        },
      },
    });

    await this.moderationAiUsageService.addLlmReviewUsage({
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
      totalTokens: response.usage?.total_tokens ?? 0,
      estimatedCostUsd: this.calculateEstimatedCostUsd({
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
      }),
    });

    const parsed = this.parseLlmResult(response.output_text);

    return {
      decision: parsed.decision,
      ruleCode: parsed.ruleCode,
      riskScore: parsed.riskScore,
      reason: parsed.reason,
      signals: parsed.signals,
      contentHash,
      metadataJson: {
        source: 'llm_moderation',
        model: this.model,
        confidence: parsed.confidence,
        userMessage: parsed.userMessage,
        previousStageResult: params.previousStageResult,
        rawDecision: parsed,
      },
    };
  }

  private calculateEstimatedCostUsd(params: {
    inputTokens: number;
    outputTokens: number;
  }): string {
    const inputPricePer1MTokens = Number(
      this.config.get<string>('FORUM_LLM_MODERATION_INPUT_PRICE_PER_1M') ?? '0',
    );

    const outputPricePer1MTokens = Number(
      this.config.get<string>('FORUM_LLM_MODERATION_OUTPUT_PRICE_PER_1M') ??
        '0',
    );

    const inputCost = (params.inputTokens / 1_000_000) * inputPricePer1MTokens;
    const outputCost =
      (params.outputTokens / 1_000_000) * outputPricePer1MTokens;

    return (inputCost + outputCost).toFixed(6);
  }

  private parseLlmResult(outputText: string): LlmModerationJson {
    try {
      return JSON.parse(outputText) as LlmModerationJson;
    } catch {
      return {
        decision: ForumModerationDecision.ESCALATE_HUMAN,
        ruleCode: ForumModerationRuleCode.LLM_MODERATION_BLOCK,
        riskScore: 100,
        confidence: 0,
        reason: 'LLM moderation returned invalid JSON.',
        userMessage:
          'Your post needs manual review before it can be published.',
        signals: ['llm_invalid_json'],
      };
    }
  }

  private buildSystemPrompt(): string {
    return `
    You are a forum moderation reviewer for Nemory, a self-reflection and mental wellbeing journaling community.
    
    Your job is to decide whether user-generated forum content can be published.
    
    - The content may be written in any language, including English, Ukrainian, Polish, German, Russian, or mixed-language text.
    - If decision is BLOCK, userMessage must be written in the same language as the user's content.
    
    Important context:
    - Users may discuss difficult emotions, trauma, abuse, depression, self-harm thoughts, relationship conflict, fear, shame, grief, or personal struggles.
    - Do NOT block supportive, reflective, recovery-oriented, or help-seeking content just because it mentions sensitive topics.
    - Block content that attacks, threatens, exploits, sexualizes minors, gives harmful instructions, promotes scams, encourages self-harm, encourages violence, or tries to move users to external contact for suspicious purposes.
    - If content is ambiguous and potentially high-risk, choose ESCALATE_HUMAN.
    - If content is safe but emotional, choose ALLOW.
    
    Low-quality / meaningless content rules:
    - If the title contains only digits, choose BLOCK.
    - If the title is mostly digits and has no meaningful words, choose BLOCK.
    - If the title or content is only repeated letters, random characters, keyboard smashing, filler text, or meaningless nonsense, choose ESCALATE_HUMAN.
    - If both title and content are low-effort meaningless text, choose ESCALATE_HUMAN.
    - Examples of meaningless text:
      - "aaaaaaaaaaaa"
      - "Àaaaaaaaaaaaaaaa"
      - "ssssssssssssssss"
      - "123456789"
      - "qwertyuiop"
      - "asdfasdfasdf"
      - "test test test" when it has no real meaning
    - Do not ALLOW content only because it is not harmful. It must also look like a real forum post with understandable intent.
    
    Decision rules:
    - ALLOW: safe, supportive, reflective, personal experience, recovery story, non-abusive discussion, and clearly meaningful human-written content.
    - BLOCK: clear violation, abuse, threat, sexual minors, self-harm instructions/encouragement, scam, spam, illegal harmful instruction, or title made only of digits.
    - ESCALATE_HUMAN: unclear intent, possible grooming, borderline threat, coded harm, ambiguous exploitation, low confidence, repeated/random characters, keyboard smashing, or meaningless low-effort content.
    
    For BLOCK decisions, userMessage must explain the real reason in a safe, user-facing way.
    Examples:
    - "Your post was blocked because it contains a personal threat."
    - "Your post was blocked because it appears to promote spam or suspicious external contact."
    - "Your post was blocked because it includes instructions that could help someone harm themselves."
    
    Do not expose internal policy names, model scores, or technical details.
    For ESCALATE_HUMAN, use:
    "Your post needs manual review before it can be published."
    For ALLOW, userMessage can be an empty string.
    
    Return only valid JSON matching the schema.
`.trim();
  }
}
