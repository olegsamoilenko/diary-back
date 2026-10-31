import { describe, it, expect, jest } from '@jest/globals';
jest.mock('expo-server-sdk', () => ({ Expo: class {} }));
import { ForumController } from './controllers/forum.controller';
import { ForumUserRestrictionsService } from './services/forum-user-restrictions.service';
import { CommunityGateway } from './gateway/community.gateway';

describe('combined community status and restriction notifications', () => {
  it('reads unread and restriction for the authenticated user in one endpoint', async () => {
    const forum = {
      getUnreadSummary: jest
        .fn<any>()
        .mockResolvedValue({ totalUnreadCount: 2 }),
    };
    const restrictions = {
      isUserRestricted: jest
        .fn<any>()
        .mockResolvedValue({ isRestricted: false, restriction: null }),
    };
    const controller = new ForumController(forum as any, restrictions as any);
    expect(await controller.getUnreadSummary({ id: 7 } as any)).toEqual({
      totalUnreadCount: 2,
      userRestriction: { isRestricted: false, restriction: null },
    });
    expect(forum.getUnreadSummary).toHaveBeenCalledWith(7);
    expect(restrictions.isUserRestricted).toHaveBeenCalledWith(7);
  });

  it('sends only an invalidation signal to the affected user room', () => {
    const gateway = new CommunityGateway({} as any, {} as any);
    const emit = jest.fn();
    gateway.server = { to: jest.fn(() => ({ emit })) } as any;
    gateway.emitUserRestrictionChanged(7);
    expect(gateway.server.to).toHaveBeenCalledWith('community:user:7');
    expect(emit).toHaveBeenCalledWith('community_changed', {
      restrictionChanged: true,
    });
  });

  function setup(active: any = null) {
    const query: any = { getOne: jest.fn<any>().mockResolvedValue(active) };
    for (const key of ['where', 'andWhere', 'orderBy'])
      query[key] = jest.fn(() => query);
    const repo = {
      createQueryBuilder: () => query,
      create: (value: any) => value,
      save: jest.fn(async (value: any) => ({ id: 'r', ...value })),
    };
    const gateway = { emitUserRestrictionChanged: jest.fn() };
    const service = new ForumUserRestrictionsService(
      repo as any,
      { create: jest.fn() } as any,
      {
        findById: jest.fn<any>().mockResolvedValue({ id: 7, settings: {} }),
      } as any,
      {
        sendForumUserRestrictedPush: jest.fn(),
        sendForumUserUnrestrictedPush: jest.fn(),
      } as any,
      gateway as any,
    );
    return { service, repo, gateway };
  }

  it('publishes ban and unban after persistence and retains the reason', async () => {
    const ban = setup();
    await ban.service.restrictUser(7, {
      startsAt: '2026-01-01',
      type: 'temporary',
      reason: ' test reason ',
      createdByAdminId: 1,
    } as any);
    expect(ban.repo.save.mock.calls[0][0].reason).toBe('test reason');
    expect(ban.gateway.emitUserRestrictionChanged).toHaveBeenCalledWith(7);
    expect(ban.repo.save.mock.invocationCallOrder[0]).toBeLessThan(
      ban.gateway.emitUserRestrictionChanged.mock.invocationCallOrder[0],
    );
    const unban = setup({ id: 'r', isActive: true });
    await unban.service.unrestrictUser(7, { createdByAdminId: 1 });
    expect(unban.repo.save.mock.calls[0][0].isActive).toBe(false);
    expect(unban.gateway.emitUserRestrictionChanged).toHaveBeenCalledWith(7);
  });

  it('does not announce a failed write', async () => {
    const { service, repo, gateway } = setup();
    repo.save.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(
      service.restrictUser(7, { startsAt: '2026-01-01' } as any),
    ).rejects.toThrow('database unavailable');
    expect(gateway.emitUserRestrictionChanged).not.toHaveBeenCalled();
  });

  it('returns only public restriction fields and clears an expired or lifted restriction', async () => {
    const { service } = setup({
      type: 'temporary',
      reason: 'reason',
      startsAt: 'start',
      endsAt: 'end',
      createdByAdmin: { hash: 'private' },
      user: { email: 'private' },
    });
    expect(await service.isUserRestricted(7)).toEqual({
      isRestricted: true,
      restriction: {
        type: 'temporary',
        reason: 'reason',
        startsAt: 'start',
        endsAt: 'end',
      },
    });
    expect(await setup().service.isUserRestricted(7)).toEqual({
      isRestricted: false,
      restriction: null,
    });
  });
});
