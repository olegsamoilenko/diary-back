import { describe, it, expect, jest } from '@jest/globals';
jest.mock('expo-server-sdk', () => ({ Expo: class {} }));
import { ForumCommentsService } from './forum-comments.service';
import { ForumService } from './forum.service';
import { ForumTopicWatcher } from '../entities/forum-topic-watcher.entity';
import { ForumComment } from '../entities/forum-comment.entity';
import { getForumNewCommentPushText } from '../../push-notifications/utils/getForumNewCommentPushText';

function setup(targetAuthor = 2) {
  const send = jest.fn<any>().mockResolvedValue(undefined);
  const targets = {
    findOne: jest.fn<any>().mockResolvedValue({ authorId: targetAuthor }),
  };
  const watchers = {
    find: jest
      .fn<any>()
      .mockResolvedValue([
        { userId: 1 },
        { userId: 2 },
        { userId: 2 },
        { userId: 3 },
      ]),
  };
  const tokens = {
    find: jest.fn<any>().mockResolvedValue([
      { userId: 2, token: 'recipient', locale: 'uk' },
      { userId: 3, token: 'watcher', locale: 'uk' },
    ]),
  };
  const manager = {
    getRepository: (entity: any) =>
      entity === ForumTopicWatcher
        ? watchers
        : entity === ForumComment
          ? targets
          : tokens,
  };
  const service = Object.assign(Object.create(ForumCommentsService.prototype), {
    pushNotificationsService: { sendForumNewCommentPush: send },
  });
  const params = {
    manager,
    topicId: 'topic',
    commentId: 'new',
    actorId: 1,
    authorName: 'Олена',
    topicTitle: 'Тема',
  };
  return { send, targets, watchers, tokens, service, params };
}

describe('personal reply pushes', () => {
  it('uses the direct nested target, sends once per device, and preserves the exact comment link', async () => {
    const x = setup();
    await x.service.sendNewCommentPushNotifications({
      ...x.params,
      parentCommentId: 'root',
      replyToCommentId: 'direct',
    });
    expect(x.targets.findOne).toHaveBeenCalledWith({
      where: { id: 'direct', topicId: 'topic' },
      select: { id: true, authorId: true },
    });
    expect(x.send).toHaveBeenCalledTimes(2);
    expect(x.send).toHaveBeenCalledWith(
      expect.objectContaining({
        tokens: ['recipient'],
        topicId: 'topic',
        commentId: 'new',
        title: 'Відповідь на твій коментар',
      }),
    );
    expect(x.send).toHaveBeenCalledWith(
      expect.objectContaining({
        tokens: ['watcher'],
        title: 'Новий коментар у темі',
      }),
    );
    expect((x.tokens.find.mock.calls[0][0] as any).where.userId.value).toEqual([
      2, 3,
    ]);
  });
  it('classifies root replies and leaves self-replies generic for other watchers', async () => {
    const x = setup(1);
    await x.service.sendNewCommentPushNotifications({
      ...x.params,
      parentCommentId: 'root',
    });
    expect((x.targets.findOne.mock.calls[0][0] as any).where.id).toBe('root');
    expect(
      x.send.mock.calls.every(
        ([p]) => (p as any).title === 'Новий коментар у темі',
      ),
    ).toBe(true);
  });
  it('honors muted/unwatched recipients rather than overriding their preferences', async () => {
    const x = setup();
    x.watchers.find.mockResolvedValue([]);
    await x.service.sendNewCommentPushNotifications({
      ...x.params,
      parentCommentId: 'root',
    });
    expect(x.watchers.find).toHaveBeenCalledWith({
      where: { topicId: 'topic', isMuted: false },
    });
    expect(x.send).not.toHaveBeenCalled();
  });
  it('keeps ordinary comments and removed targets on the generic path', async () => {
    const x = setup();
    await x.service.sendNewCommentPushNotifications(x.params);
    expect(x.targets.findOne).not.toHaveBeenCalled();
    x.targets.findOne.mockResolvedValue(null);
    await x.service.sendNewCommentPushNotifications({
      ...x.params,
      parentCommentId: 'missing',
    });
    expect(
      x.send.mock.calls.every(
        ([p]) => (p as any).title === 'Новий коментар у темі',
      ),
    ).toBe(true);
  });
  it.each(['uk', 'pl', 'de', 'en'])(
    'localizes personal text in %s',
    (locale) => {
      const params = { locale, authorName: 'Alex', topicTitle: 'Topic' };
      const text = getForumNewCommentPushText({
        ...params,
        isReplyToRecipient: true,
      });
      expect(text.title).not.toBe(getForumNewCommentPushText(params).title);
      expect(text.body).toContain('Alex');
      expect(text.body).toContain('Topic');
    },
  );
});

describe('unread reply IDs from the full topic', () => {
  it('returns only replies directed at the authenticated user, keeping chronological order', async () => {
    const qb: any = {};
    for (const method of [
      'leftJoin',
      'where',
      'andWhere',
      'orderBy',
      'addOrderBy',
      'select',
      'addSelect',
    ])
      qb[method] = jest.fn(() => qb);
    qb.getRawMany = jest.fn<any>().mockResolvedValue([
      { commentId: 'a', replyRecipientId: null },
      { commentId: 'b', replyRecipientId: 99 },
      { commentId: 'reply-50', replyRecipientId: 7 },
      { commentId: 'reply-70', replyRecipientId: 7 },
    ]);
    const service = Object.assign(Object.create(ForumService.prototype), {
      topicsRepo: {
        findOne: jest
          .fn<any>()
          .mockResolvedValue({
            id: 't',
            authorId: 99,
            lastActivityAt: new Date(),
          }),
        manager: { getRepository: () => ({ createQueryBuilder: () => qb }) },
      },
      forumTopicReadStateRepo: {
        findOne: jest
          .fn<any>()
          .mockResolvedValue({
            lastReadAt: new Date(0),
            individuallyReadCommentIds: ['seen-reply'],
          }),
      },
    });
    const result = await service.getTopicUnreadSession(7, 't');
    expect(result.unreadCommentIds).toEqual(['a', 'b', 'reply-50', 'reply-70']);
    expect(result.unreadReplyCommentIds).toEqual(['reply-50', 'reply-70']);
    expect(qb.leftJoin.mock.calls.some((call: any[]) => call[2].includes('COALESCE'))).toBe(true);
    expect(qb.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('individually_read_comment_ids'),
    );
    expect(qb.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('commentReadState'),
    );
  });
});
