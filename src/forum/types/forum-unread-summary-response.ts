export type ForumUnreadSummaryResponse = {
  totalUnreadCount: number;
  watchingUnreadCount: number;
  unreadTopicIds: string[];
  watchingUnreadTopicIds: string[];
  unreadCountsByTopicId: Record<string, number>;
};
