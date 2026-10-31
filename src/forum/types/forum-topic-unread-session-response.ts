export type ForumTopicUnreadSessionResponse = {
  topicId: string;
  isTopicUnread: boolean;
  unreadCommentIds: string[];
  unreadReplyCommentIds: string[];
  firstUnreadCommentId: string | null;
  unreadCommentsCount: number;
};
