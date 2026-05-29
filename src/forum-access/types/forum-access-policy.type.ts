import { ForumAccessMode } from '../enums/forum-access-mode.enum';

export type ForumAccessPolicy = {
  mode: ForumAccessMode;
  isEnabled: boolean;
  limitsStartAt: Date | null;
  grandfatherExistingUsers: boolean;
  freeTopicsPerMonth: number;
  freeCommentsPerMonth: number;
};
