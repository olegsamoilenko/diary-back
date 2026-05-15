export type ForumTopicUnreadSessionResponse = {
  topicId: string;
  isTopicUnread: boolean;
  unreadCommentIds: string[];
  firstUnreadCommentId: string | null;
  unreadCommentsCount: number;
};
