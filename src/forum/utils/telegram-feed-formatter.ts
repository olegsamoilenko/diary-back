import { ForumReportTargetType } from '../types/forum-report-target-type.enum';

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

export function formatForumTopicActionTelegram(params: {
  actionType: 'new' | 'update';
  title: string;
  content: string;
  topicId: string;
  authorId: number;
  authorNickname: string;
}) {
  return [
    `🟢 <b>${params.actionType.toUpperCase()} NEW FORUM TOPIC</b>`,
    '',
    `<b>Title:</b> ${tgEscape(params.title)}`,
    '',
    '<b>Content:</b>',
    `<blockquote>${tgEscape(tgCut(params.content))}</blockquote>`,
    '',
    `<b>Topic ID:</b> <code>${tgEscape(params.topicId)}</code>`,
    `<b>Author ID:</b> <code>${params.authorId}</code>`,
    `<b>Author Nickname:</b> <code>${params.authorNickname}</code>`,
  ].join('\n');
}

export function formatForumCommentActionTelegram(params: {
  actionType: 'new' | 'update';
  content: string;
  commentId: string;
  topicId: string;
  authorId: number;
  topicTitle: string;
  authorNickname: string;
}) {
  return [
    `💬 <b>${params.actionType.toUpperCase()} NEW FORUM COMMENT</b>`,
    '',
    `<b>Topic:</b> ${tgEscape(params.topicTitle)}`,
    '',
    '<b>Comment:</b>',
    `<blockquote>${tgEscape(tgCut(params.content))}</blockquote>`,
    '',
    `<b>Comment ID:</b> <code>${tgEscape(params.commentId)}</code>`,
    `<b>Topic ID:</b> <code>${tgEscape(params.topicId)}</code>`,
    `<b>Author ID:</b> <code>${params.authorId}</code>`,
    `<b>Author Nickname:</b> <code>${params.authorNickname}</code>`,
  ].join('\n');
}

export function formatForumReportTelegram(params: {
  reportId: string;
  targetType: ForumReportTargetType;
  targetId: string;
  reason: string;
  details?: string | null;

  reporterId: number;
  reporterNickname: string;

  topicId?: string | null;
  topicTitle?: string | null;
  topicContent?: string | null;

  commentId?: string | null;
  commentContent?: string | null;

  targetAuthorId?: number | null;
  targetAuthorNickname?: string | null;
}) {
  return [
    `🚨 <b>NEW FORUM REPORT</b>`,
    '',
    `<b>Reason:</b> ${tgEscape(params.reason)}`,
    '',
    params.details
      ? [
          '<b>Details:</b>',
          `<blockquote>${tgEscape(tgCut(params.details))}</blockquote>`,
          '',
        ].join('\n')
      : `<b>Details:</b> —`,
    '',
    params.topicTitle
      ? `<b>Reported Title:</b> ${tgEscape(params.topicTitle)}`
      : null,
    params.topicContent
      ? [
          '<b>Reported comment:</b>',
          `<blockquote>${tgEscape(tgCut(params.topicContent))}</blockquote>`,
          '',
        ].join('\n')
      : null,
    params.commentContent
      ? [
          '<b>Reported comment:</b>',
          `<blockquote>${tgEscape(tgCut(params.commentContent))}</blockquote>`,
          '',
        ].join('\n')
      : null,
    `<b>Target Type:</b> <code>${tgEscape(params.targetType)}</code>`,
    `<b>Target ID:</b> <code>${tgEscape(params.targetId)}</code>`,
    params.topicId
      ? `<b>Topic ID:</b> <code>${tgEscape(params.topicId)}</code>`
      : null,
    params.commentId
      ? `<b>Comment ID:</b> <code>${tgEscape(params.commentId)}</code>`
      : null,
    '',
    `<b>Reporter ID:</b> <code>${params.reporterId}</code>`,
    `<b>Reporter Nickname:</b> <code>${tgEscape(params.reporterNickname)}</code>`,
    '',
    params.targetAuthorId
      ? `<b>Target Author ID:</b> <code>${params.targetAuthorId}</code>`
      : null,
    params.targetAuthorNickname
      ? `<b>Target Author Nickname:</b> <code>${tgEscape(params.targetAuthorNickname)}</code>`
      : null,
    '',
    `<b>Report ID:</b> <code>${tgEscape(params.reportId)}</code>`,
  ]
    .filter(Boolean)
    .join('\n');
}
