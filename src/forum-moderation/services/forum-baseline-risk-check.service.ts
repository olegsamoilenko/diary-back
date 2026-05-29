import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { ForumModerationDecision } from '../enums/forum-moderation-decision.enum';
import { ForumModerationRuleCode } from '../enums/forum-moderation-rule-code.enum';
import { BASELINE_RISK_PATTERNS } from '../dictionaries/baseline-risk-patterns';

export type BaselineRiskCheckResult = {
  decision: ForumModerationDecision;
  riskScore: number;
  reason: string | null;
  ruleCode: ForumModerationRuleCode | null;
  signals: string[];
  contentHash: string;
  metadataJson?: Record<string, any> | null;
};

@Injectable()
export class ForumBaselineRiskCheckService {
  async check(params: {
    userId: number;
    targetType: 'topic' | 'comment';
    title?: string | null;
    content: string;
  }): Promise<BaselineRiskCheckResult> {
    const text = `${params.title ?? ''}\n${params.content ?? ''}`.trim();

    const normalized = this.normalizeText(text);

    const contentHash = createHash('sha256').update(normalized).digest('hex');

    const signals: string[] = [];
    const matchedPatterns: Record<string, number> = {};

    let riskScore = 0;

    const linksCount = (text.match(/https?:\/\/|www\./gi) ?? []).length;

    if (linksCount >= 1) {
      riskScore += linksCount >= 3 ? 4 : linksCount >= 2 ? 2 : 1;
      signals.push('has_links');
      matchedPatterns.has_links = linksCount;
    }

    const hasRepeatedCharacters = /(.)\1{12,}/.test(text);

    if (hasRepeatedCharacters) {
      riskScore += 2;
      signals.push('repeated_characters');
      matchedPatterns.repeated_characters = 1;
    }

    const lowQualitySignals = this.getLowQualitySignals({
      targetType: params.targetType,
      title: params.title ?? '',
      content: params.content,
    });

    if (lowQualitySignals.length > 0) {
      riskScore += 4;
      signals.push(...lowQualitySignals);

      for (const signal of lowQualitySignals) {
        matchedPatterns[signal] = 1;
      }
    }

    const exclamationCount = (text.match(/!/g) ?? []).length;
    const questionCount = (text.match(/\?/g) ?? []).length;

    if (exclamationCount >= 8) {
      riskScore += 1;
      signals.push('many_exclamation_marks');
      matchedPatterns.many_exclamation_marks = exclamationCount;
    }

    if (questionCount >= 8) {
      riskScore += 1;
      signals.push('many_question_marks');
      matchedPatterns.many_question_marks = questionCount;
    }

    for (const item of BASELINE_RISK_PATTERNS) {
      let matchesCount = 0;

      for (const pattern of item.patterns) {
        pattern.lastIndex = 0;

        if (pattern.test(normalized)) {
          matchesCount += 1;
        }
      }

      if (!matchesCount) continue;

      riskScore += item.score;
      signals.push(item.code);
      matchedPatterns[item.code] = matchesCount;
    }

    const minLength = params.targetType === 'topic' ? 20 : 2;

    if (normalized.length < minLength) {
      riskScore += 1;
      signals.push('too_short');
      matchedPatterns.too_short = normalized.length;
    }

    if (normalized.length > 10_000) {
      riskScore += 4;
      signals.push('too_long');
      matchedPatterns.too_long = normalized.length;
    }

    if (riskScore > 0) {
      return {
        decision: ForumModerationDecision.NEEDS_LLM_REVIEW,
        riskScore,
        reason: 'Content needs additional moderation.',
        ruleCode: null,
        signals: [...new Set(signals)],
        contentHash,
        metadataJson: {
          linksCount,
          length: normalized.length,
          matchedPatterns,
        },
      };
    }

    return {
      decision: ForumModerationDecision.ALLOW,
      riskScore: 0,
      reason: null,
      ruleCode: null,
      signals: [],
      contentHash,
      metadataJson: {
        linksCount,
        length: normalized.length,
      },
    };
  }

  private getLowQualitySignals(params: {
    targetType: 'topic' | 'comment';
    title: string;
    content: string;
  }): string[] {
    const signals: string[] = [];

    const normalizedTitle = this.normalizeText(params.title);
    const normalizedContent = this.normalizeText(params.content);

    if (params.targetType === 'topic') {
      if (/^\d+$/.test(normalizedTitle)) {
        signals.push('title_digits_only');
      }

      if (this.looksLikeMeaninglessText(normalizedTitle)) {
        signals.push('meaningless_title');
      }
    }

    if (this.looksLikeMeaninglessText(normalizedContent)) {
      signals.push('meaningless_content');
    }

    return signals;
  }

  private looksLikeMeaninglessText(text: string): boolean {
    const value = this.normalizeText(text);
    if (!value) return false;

    const compact = value.replace(/\s+/g, '');

    if (compact.length < 3) return false;

    if (/^\d+$/.test(compact)) return true;

    if (/^(.)\1{5,}$/iu.test(compact)) return true;

    const letters = compact.match(/\p{L}/gu) ?? [];
    if (letters.length < 8) return false;

    const uniqueChars = new Set([...compact]).size;
    const uniqueRatio = uniqueChars / compact.length;

    if (compact.length >= 12 && uniqueRatio <= 0.35) return true;

    const vowels =
      compact.match(/[aeiouyаеєиіїоуюяąęóäöüàáâãèéêëìíîïòóôõùúûü]/giu) ?? [];

    const vowelRatio = vowels.length / letters.length;

    if (letters.length >= 10 && vowelRatio < 0.12) return true;

    return false;
  }

  private normalizeText(text: string): string {
    return text.toLowerCase().normalize('NFKC').replace(/\s+/g, ' ').trim();
  }
}
