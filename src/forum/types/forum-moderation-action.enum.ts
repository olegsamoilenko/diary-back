export enum ForumModerationAction {
  HIDE_TOPIC = 'hide_topic',
  REMOVE_TOPIC = 'remove_topic',
  RESTORE_TOPIC = 'restore_topic',
  LOCK_TOPIC = 'lock_topic',
  UNLOCK_TOPIC = 'unlock_topic',

  HIDE_COMMENT = 'hide_comment',
  REMOVE_COMMENT = 'remove_comment',
  RESTORE_COMMENT = 'restore_comment',

  BAN_USER = 'ban_user',
  UNBAN_USER = 'unban_user',

  DISMISS_REPORT = 'dismiss_report',
  RESOLVE_REPORT = 'resolve_report',
}
