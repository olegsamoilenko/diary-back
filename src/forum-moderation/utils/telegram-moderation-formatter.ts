function tgEscape(value: string | number | null | undefined) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function tgCut(value: string, max = 1800) {
  if (!value) return '';
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

export function formatForumModerationBlockedTelegram(params: {
  targetType: 'topic' | 'comment';
  actionType: 'create' | 'update';
  title?: string | null;
  content: string;
  topicId?: string | null;
  commentId?: string | null;
  authorId: number;
  authorNickname: string;
  decision: string;
  ruleCode: string | null;
  riskScore: number;
  reason: string | null;
  signals: string[];
  userMessage?: string | null;
}) {
  return [
    `🔴 <b>${params.actionType.toUpperCase()} FORUM CONTENT BLOCKED</b>`,
    '',
    `<b>Target:</b> <code>${tgEscape(params.targetType)}</code>`,
    params.title ? `<b>Title:</b> ${tgEscape(params.title)}` : null,
    '',
    '<b>Content:</b>',
    `<blockquote>${tgEscape(tgCut(params.content))}</blockquote>`,
    '',
    '<b>Moderation:</b>',
    `<b>Decision:</b> <code>${tgEscape(params.decision)}</code>`,
    `<b>Rule:</b> <code>${tgEscape(params.ruleCode ?? 'unknown')}</code>`,
    `<b>User message:</b> <code>${params.userMessage}</code>`,
    `<b>Risk Score:</b> <code>${params.riskScore}</code>`,
    params.reason ? `<b>Reason:</b> ${tgEscape(params.reason)}` : null,
    params.signals.length
      ? `<b>Signals:</b> <code>${tgEscape(params.signals.join(', '))}</code>`
      : null,
    '',
    params.topicId
      ? `<b>Topic ID:</b> <code>${tgEscape(params.topicId)}</code>`
      : null,
    params.commentId
      ? `<b>Comment ID:</b> <code>${tgEscape(params.commentId)}</code>`
      : null,
    `<b>Author ID:</b> <code>${params.authorId}</code>`,
    `<b>Author Nickname:</b> <code>${tgEscape(params.authorNickname)}</code>`,
  ]
    .filter(Boolean)
    .join('\n');
}

export function formatForumModerationNeedsReviewTelegram(params: {
  targetType: 'topic' | 'comment';
  title?: string | null;
  content: string;
  topicId?: string | null;
  commentId?: string | null;
  authorId: number;
  authorNickname: string;
  decision: string;
  ruleCode: string | null;
  riskScore: number;
  reason: string | null;
  signals: string[];
}) {
  return [
    '🟠 <b>FORUM CONTENT NEEDS REVIEW</b>',
    '',
    '<b>Status:</b> Published, but requires manual review.',
    '',
    `<b>Target:</b> <code>${tgEscape(params.targetType)}</code>`,
    params.title ? `<b>Title:</b> ${tgEscape(params.title)}` : null,
    '',
    '<b>Content:</b>',
    `<blockquote>${tgEscape(tgCut(params.content))}</blockquote>`,
    '',
    '<b>Moderation:</b>',
    `<b>Decision:</b> <code>${tgEscape(params.decision)}</code>`,
    `<b>Rule:</b> <code>${tgEscape(params.ruleCode ?? 'unknown')}</code>`,
    `<b>Risk Score:</b> <code>${params.riskScore}</code>`,
    params.reason ? `<b>Reason:</b> ${tgEscape(params.reason)}` : null,
    params.signals.length
      ? `<b>Signals:</b> <code>${tgEscape(params.signals.join(', '))}</code>`
      : null,
    '',
    params.topicId
      ? `<b>Topic ID:</b> <code>${tgEscape(params.topicId)}</code>`
      : null,
    params.commentId
      ? `<b>Comment ID:</b> <code>${tgEscape(params.commentId)}</code>`
      : null,
    `<b>Author ID:</b> <code>${params.authorId}</code>`,
    `<b>Author Nickname:</b> <code>${tgEscape(params.authorNickname)}</code>`,
  ]
    .filter(Boolean)
    .join('\n');
}
