export type ForumModerationPushType =
  | 'forum_topic_removed_by_moderator'
  | 'forum_topic_restored_by_moderator'
  | 'forum_comment_removed_by_moderator'
  | 'forum_comment_restored_by_moderator'
  | 'forum_user_restricted'
  | 'forum_user_unrestricted';

export type ForumTopicModerationPushParams = {
  userId: number;
  topicId: string;
  title: string;
  body: string;
};

export type ForumCommentModerationPushParams = {
  userId: number;
  commentId: string;
  title: string;
  body: string;
};

export type ForumUserRestrictionPushParams = {
  userId: number;
  title: string;
  body: string;
  restrictionId?: string;
  restrictedUntil?: string | null;
};
