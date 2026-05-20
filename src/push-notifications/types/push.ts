import { ForumModerationPushType } from './moderation';
import { DiaryPushType } from './diary';

export type AppPushType = ForumModerationPushType | DiaryPushType;

export type SendPushToUsersParams = {
  userIds: number[];
  type: AppPushType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
};
