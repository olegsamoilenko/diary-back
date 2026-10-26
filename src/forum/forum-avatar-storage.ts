import { join } from 'path';

export const FORUM_AVATAR_URL_PREFIX = '/uploads/forum/avatars/';
export const FORUM_AVATAR_MAX_BYTES = 2 * 1024 * 1024;

export function forumAvatarDirectory() {
  return join(
    process.env.UPLOADS_DIR || '/var/www/nemory-uploads',
    'forum',
    'avatars',
  );
}
