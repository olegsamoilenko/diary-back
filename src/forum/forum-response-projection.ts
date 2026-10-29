import type { User } from '../users/entities/user.entity';
import { toAdminUser } from '../users/admin-user-projection';

type Fields = Record<string, unknown>;
type Audience = 'public' | 'admin';
const isObject = (value: unknown): value is Fields =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  !(value instanceof Date);

function pick(value: Fields, fields: readonly string[]): Fields {
  return Object.fromEntries(
    fields
      .filter((key) => Object.hasOwn(value, key))
      .map((key) => [key, value[key]]),
  );
}

export function publicForumProfile(value: unknown): unknown {
  if (!isObject(value)) return value;
  return pick(value, [
    'id',
    'userId',
    'username',
    'displayName',
    'avatarUrl',
    'bio',
    'isForumEnabled',
    'allowDirectMessages',
    'isBanned',
    'createdAt',
    'updatedAt',
  ]);
}

function userIdentity(value: unknown, audience: Audience): unknown {
  if (!isObject(value)) return value;
  if (audience === 'admin') return toAdminUser(value as unknown as User);
  return {
    ...pick(value, ['id', 'role']),
    ...(Object.hasOwn(value, 'forumPublicProfile')
      ? { forumPublicProfile: publicForumProfile(value.forumPublicProfile) }
      : {}),
  };
}

const userRelations = new Set([
  'author',
  'parentAuthor',
  'replyToAuthor',
  'user',
  'userOne',
  'userTwo',
  'sender',
  'recipient',
  'targetUser',
  'blockedUser',
  'actor',
  'mentionedByUser',
  'reporter',
]);
const profileRelations = new Set([
  'authorProfile',
  'parentAuthorProfile',
  'replyToAuthorProfile',
  'forumPublicProfile',
  'reporterProfile',
]);

// HTTP boundary for the connected forum response graph (including nested
// reply previews/context and bookmark topics). Never mutate ORM entities used
// for permission checks or persistence. Both read and mutation responses use it.
export function projectForumResponse(
  value: unknown,
  audience: Audience,
): unknown {
  if (Array.isArray(value))
    return value.map((item) => projectForumResponse(item, audience));
  if (!isObject(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => {
      if (userRelations.has(key)) return [key, userIdentity(child, audience)];
      if (profileRelations.has(key)) return [key, publicForumProfile(child)];
      if (key === 'authorSettings')
        return [
          key,
          isObject(child) ? pick(child, ['id', 'userId', 'lang']) : child,
        ];
      if (key === 'moderator' || key === 'createdByAdmin')
        return [
          key,
          isObject(child)
            ? pick(
                child,
                audience === 'admin' ? ['id', 'name', 'role'] : ['id'],
              )
            : child,
        ];
      return [key, projectForumResponse(child, audience)];
    }),
  );
}
