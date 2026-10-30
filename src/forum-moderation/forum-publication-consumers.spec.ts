import {
  beforeAll,
  beforeEach,
  afterAll,
  afterEach,
  describe,
  it,
  expect,
  jest,
} from '@jest/globals';
jest.mock('expo-server-sdk', () => ({ Expo: class {} }));
jest.mock('axios', () => ({ post: jest.fn() }));
import axios from 'axios';
import { ForumTopicsService } from '../forum/services/forum-topics.service';
import { ForumCommentsService } from '../forum/services/forum-comments.service';
import { ForumContentStatus } from '../forum/types/forum-content-status.enum';
import { ForumModerationService } from './forum-moderation.service';
import { ForumUserRestrictionsService } from '../forum/services/forum-user-restrictions.service';
import { ForumModerationDecision as Decision } from './enums/forum-moderation-decision.enum';

describe('Publication lifecycle in the four live forum write paths', () => {
  const cases = [
    'createTopic',
    'updateTopic',
    'createComment',
    'updateComment',
  ] as const;
  let service: any;
  let guard: any;
  let baseline: any;
  let llm: any;
  let logs: any;
  let repo: any;
  let runner: any;
  let receipt: any;
  let restrictionQuery: any;
  let invoke: () => Promise<any>;
  const failure = new Error('isolated DB failure');
  const originalEnv = process.env;
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      TELEGRAM_FORUM_FEED_BOT_TOKEN: 'test-token',
      TELEGRAM_FORUM_FEED_CHAT_ID: 'test-chat',
      TELEGRAM_FORUM_MODERATION_BOT_TOKEN: 'test-token',
      TELEGRAM_FORUM_MODERATION_CHAT_ID: 'test-chat',
    };
    (axios.post as jest.Mock<any>).mockResolvedValue({ data: { ok: true } });
  });
  afterEach(() => {
    process.env = originalEnv;
  });
  function setup(method: (typeof cases)[number]) {
    receipt = {
      key: 'key',
      owner: 'owner',
      rateKey: 'rate',
      windowKey: 'window',
      windowId: 'id',
    };
    guard = {
      checkOrThrow: jest.fn<any>().mockResolvedValue(receipt),
      renew: jest.fn<any>().mockResolvedValue(true),
      finish: jest.fn<any>().mockResolvedValue(undefined),
    };
    baseline = {
      check: jest.fn<any>().mockReturnValue({ decision: Decision.ALLOW }),
    };
    llm = {
      check: jest.fn<any>().mockResolvedValue({
        decision: Decision.BLOCK,
        reason: 'policy',
        signals: [],
      }),
    };
    logs = { createBlockedLog: jest.fn<any>().mockResolvedValue(undefined) };
    const profile = {
      findOne: jest.fn<any>().mockResolvedValue({ username: 'Test' }),
    };
    const moderation = new ForumModerationService(
      guard,
      baseline,
      logs,
      {
        check: jest.fn<any>().mockResolvedValue({ decision: Decision.ALLOW }),
      } as any,
      llm,
      profile as any,
      {} as any,
    );
    const entity = {
      id: 'entity',
      topicId: 'topic',
      authorId: 1,
      status: ForumContentStatus.PUBLISHED,
      title: 'Title',
      content: 'Original',
      deletedAt: null,
      isLocked: false,
    };
    const qb: any = {};
    for (const name of ['leftJoinAndSelect', 'leftJoinAndMapOne', 'where'])
      qb[name] = jest.fn(() => qb);
    qb.getOne = jest.fn<any>().mockResolvedValue(entity);
    repo = {
      findOne: jest.fn<any>().mockResolvedValue(entity),
      exists: jest.fn<any>().mockResolvedValue(true),
      create: jest.fn((data) => data),
      save: jest.fn<any>().mockResolvedValue(entity),
      update: jest.fn<any>().mockResolvedValue({ affected: 1 }),
      softDelete: jest.fn<any>().mockResolvedValue({ affected: 1 }),
      createQueryBuilder: () => qb,
    };
    runner = {
      manager: { getRepository: () => repo },
      isTransactionActive: false,
      connect: jest.fn<any>().mockResolvedValue(undefined),
      startTransaction: jest.fn(async () => {
        runner.isTransactionActive = true;
      }),
      commitTransaction: jest.fn(async () => {
        runner.isTransactionActive = false;
      }),
      rollbackTransaction: jest.fn(async () => {
        runner.isTransactionActive = false;
      }),
      release: jest.fn<any>().mockResolvedValue(undefined),
    };
    const proto = method.endsWith('Topic')
      ? ForumTopicsService.prototype
      : ForumCommentsService.prototype;
    restrictionQuery = { getOne: jest.fn<any>().mockResolvedValue(null) };
    for (const name of ['where', 'andWhere', 'orderBy']) {
      restrictionQuery[name] = jest.fn(() => restrictionQuery);
    }
    const restrictions = new ForumUserRestrictionsService(
      { createQueryBuilder: () => restrictionQuery } as any,
      {} as any,
      {} as any,
      {} as any,
    );
    service = Object.assign(Object.create(proto), {
      forumModerationService: moderation,
      dataSource: {
        createQueryRunner: () => runner,
        transaction: async (work: any) => work(runner.manager),
      },
      topicsRepo: repo,
      commentsRepo: repo,
      categoriesRepo: repo,
      forumPublicProfileRepo: profile,
      forumUserRestrictionsService: restrictions,
      forumAccessService: {
        assertCanCreateTopic: jest.fn<any>(),
        assertCanCreateComment: jest.fn<any>(),
        incrementTopicUsage: jest.fn<any>(),
        incrementCommentUsage: jest.fn<any>(),
      },
      userStatisticsService: {
        incrementTopicStat: jest.fn<any>(),
        incrementCommentStat: jest.fn<any>(),
      },
      communityGateway: { emitCommunityUnreadChanged: jest.fn<any>() },
      sendNewCommentPushNotifications: jest.fn<any>(),
      getTopicById: jest.fn<any>().mockResolvedValue(entity),
    });
    const dto = {
      title: 'New title',
      content: 'New content',
      categoryId: 'category',
    };
    invoke = () =>
      method === 'createTopic'
        ? service[method](1, dto)
        : service[method](1, 'entity', dto);
  }
  it.each(cases)(
    '%s rejects an active posting restriction before moderation or writes',
    async (method) => {
      setup(method);
      restrictionQuery.getOne.mockResolvedValue({ type: 'READ_ONLY' });
      await expect(invoke()).rejects.toMatchObject({
        status: 403,
        response: { code: 'YOUR_COMMUNITY_POSTING_IS_RESTRICTED' },
      });
      expect(guard.checkOrThrow).not.toHaveBeenCalled();
      expect(baseline.check).not.toHaveBeenCalled();
      expect(repo.save).not.toHaveBeenCalled();
      expect(repo.update).not.toHaveBeenCalled();
      expect(axios.post).not.toHaveBeenCalled();
    },
  );
  it.each(['updateTopic', 'updateComment'] as const)(
    '%s permits an immediate retry after restriction removal',
    async (method) => {
      setup(method);
      restrictionQuery.getOne
        .mockResolvedValueOnce({ type: 'READ_ONLY' })
        .mockResolvedValue(null);
      await expect(invoke()).rejects.toMatchObject({ status: 403 });
      await expect(invoke()).resolves.toMatchObject({ id: 'entity' });
      expect(guard.checkOrThrow).toHaveBeenCalledTimes(1);
      expect(repo.update).toHaveBeenCalledTimes(1);
      expect(restrictionQuery.andWhere).toHaveBeenCalledWith(
        'restriction.is_active = true',
      );
      expect(restrictionQuery.andWhere).toHaveBeenCalledWith(
        'restriction.lifted_at IS NULL',
      );
      expect(restrictionQuery.andWhere).toHaveBeenCalledWith(
        'restriction.starts_at <= :now',
        { now: expect.any(Date) },
      );
      expect(restrictionQuery.andWhere).toHaveBeenCalledWith(
        '(restriction.ends_at IS NULL OR restriction.ends_at > :now)',
        { now: expect.any(Date) },
      );
    },
  );
  it.each(['updateTopic', 'updateComment'] as const)(
    '%s still rejects editing another author',
    async (method) => {
      setup(method);
      repo.findOne.mockResolvedValue({
        id: 'entity',
        authorId: 99,
        status: ForumContentStatus.PUBLISHED,
      });
      await expect(invoke()).rejects.toMatchObject({ status: 403 });
      expect(repo.update).not.toHaveBeenCalled();
      expect(guard.checkOrThrow).not.toHaveBeenCalled();
    },
  );
  it.each(['deleteTopic', 'softDeleteComment', 'deleteComment'] as const)(
    '%s remains allowed for a restricted author',
    async (method) => {
      setup(method === 'deleteTopic' ? 'updateTopic' : 'updateComment');
      restrictionQuery.getOne.mockResolvedValue({ type: 'READ_ONLY' });
      await expect(service[method](1, 'entity')).resolves.toBeDefined();
      expect(restrictionQuery.getOne).not.toHaveBeenCalled();
      expect(guard.checkOrThrow).not.toHaveBeenCalled();
      expect(repo.update).toHaveBeenCalled();
    },
  );
  it.each(['deleteTopic', 'softDeleteComment', 'deleteComment'] as const)(
    '%s still rejects deleting another author',
    async (method) => {
      setup(method === 'deleteTopic' ? 'updateTopic' : 'updateComment');
      repo.findOne.mockResolvedValue({ id: 'entity', authorId: 99 });
      await expect(service[method](1, 'entity')).rejects.toThrow();
      expect(repo.update).not.toHaveBeenCalled();
      expect(repo.softDelete).not.toHaveBeenCalled();
    },
  );
  it.each(cases)(
    '%s releases after DB rejection and confirmed rollback',
    async (method) => {
      setup(method);
      repo.save.mockRejectedValue(failure);
      repo.update.mockRejectedValue(failure);
      await expect(invoke()).rejects.toBe(failure);
      expect(runner.rollbackTransaction).toHaveBeenCalled();
      expect(guard.finish).toHaveBeenCalledWith(receipt, false);
    },
  );
  it.each(cases)(
    '%s retains after saving and preserves the result',
    async (method) => {
      setup(method);
      await expect(invoke()).resolves.toMatchObject({ id: 'entity' });
      expect(runner.commitTransaction).toHaveBeenCalledTimes(1);
      expect(guard.finish).toHaveBeenCalledWith(receipt, true);
    },
  );
  it.each(cases)(
    '%s releases after a technical moderation failure',
    async (method) => {
      setup(method);
      baseline.check.mockImplementation(() => {
        throw failure;
      });
      await expect(invoke()).rejects.toBe(failure);
      expect(repo.save).not.toHaveBeenCalled();
      expect(repo.update).not.toHaveBeenCalled();
      expect(guard.finish).toHaveBeenCalledWith(receipt, false);
    },
  );
  it.each(cases)(
    '%s succeeds and retains duplicate protection after Telegram failure',
    async (method) => {
      setup(method);
      (axios.post as jest.Mock<any>).mockRejectedValue(failure);
      await expect(invoke()).resolves.toMatchObject({ id: 'entity' });
      expect(runner.commitTransaction).toHaveBeenCalled();
      expect(runner.commitTransaction.mock.invocationCallOrder[0]).toBeLessThan(
        (axios.post as jest.Mock).mock.invocationCallOrder[0],
      );
      expect(guard.finish).toHaveBeenCalledWith(receipt, true);
    },
  );
  it.each(cases)(
    '%s does not wait for a pending Telegram request',
    async (method) => {
      setup(method);
      let complete!: (value: unknown) => void;
      (axios.post as jest.Mock<any>).mockReturnValue(
        new Promise((resolve) => {
          complete = resolve;
        }),
      );
      try {
        await expect(invoke()).resolves.toMatchObject({ id: 'entity' });
        expect(guard.finish).toHaveBeenCalledWith(receipt, true);
      } finally {
        complete({ data: { ok: true } });
      }
    },
  );
  it.each(cases)(
    '%s sends no publication notification after failed commit',
    async (method) => {
      setup(method);
      runner.commitTransaction.mockRejectedValue(failure);
      await expect(invoke()).rejects.toBe(failure);
      expect(axios.post).not.toHaveBeenCalled();
      expect(
        service.communityGateway.emitCommunityUnreadChanged,
      ).not.toHaveBeenCalled();
    },
  );
  it.each(['createTopic', 'createComment'] as const)(
    '%s emits community refresh only after commit',
    async (method) => {
      setup(method);
      await invoke();
      expect(runner.commitTransaction.mock.invocationCallOrder[0]).toBeLessThan(
        service.communityGateway.emitCommunityUnreadChanged.mock
          .invocationCallOrder[0],
      );
    },
  );
  it('preserves the real moderation BLOCK response despite Telegram failure', async () => {
    setup('createTopic');
    baseline.check.mockReturnValue({ decision: Decision.NEEDS_LLM_REVIEW });
    (axios.post as jest.Mock<any>).mockRejectedValue(failure);
    await expect(invoke()).rejects.toMatchObject({
      response: { code: 'FORUM_CONTENT_BLOCKED_BY_MODERATION' },
    });
    expect(repo.save).not.toHaveBeenCalled();
    expect(guard.finish).toHaveBeenCalledWith(receipt, true);
  });
  it('allows escalation to human review even if its Telegram notification fails', async () => {
    setup('createTopic');
    baseline.check.mockReturnValue({ decision: Decision.NEEDS_LLM_REVIEW });
    llm.check.mockResolvedValue({
      decision: Decision.ESCALATE_HUMAN,
      signals: [],
      reason: 'review',
    });
    (axios.post as jest.Mock<any>).mockRejectedValue(failure);
    await expect(invoke()).resolves.toMatchObject({ id: 'entity' });
  });
  it.each([Decision.ALLOW, Decision.NEEDS_LLM_REVIEW])(
    'retains a real policy BLOCK through the %s branch even if its log fails',
    async (decision) => {
      setup('createTopic');
      baseline.check.mockReturnValue({ decision });
      service.forumModerationService.forumOpenAiModerationService.check.mockResolvedValue(
        {
          decision: Decision.NEEDS_LLM_REVIEW,
        },
      );
      logs.createBlockedLog.mockRejectedValue(failure);
      await expect(invoke()).rejects.toBe(failure);
      expect(receipt.policyRejected).toBe(true);
      expect(guard.finish).toHaveBeenCalledWith(receipt, true);
    },
  );
});
