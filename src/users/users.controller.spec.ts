import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { HttpException } from '@nestjs/common';
import { UsersController } from './users.controller';
import { AiModel, Lang, Theme } from './types';
import { Platform } from 'src/common/types/platform';
import { BasePlanIds, PlanStatus, SubscriptionIds } from 'src/plans/types';

describe('UsersController subscription entrypoints', () => {
  const usersService = {
    createUserByUUID: jest.fn(),
    syncUser: jest.fn(),
    getOneBy: jest.fn(),
    getUsersWithStats: jest.fn(),
    me: jest.fn(),
  };
  const geoAccessService = {
    getCountryFromRequest: jest.fn(),
    getClientIp: jest.fn(),
  };

  let controller: UsersController;

  const req = {
    clientUa: 'test-agent',
    headers: {},
    ip: '127.0.0.1',
  };

  const planData = {
    platform: Platform.ANDROID,
    regionCode: 'UA',
    subscriptionId: SubscriptionIds.NEMORY,
    basePlanId: BasePlanIds.START,
    startTime: new Date('2026-06-25T15:00:00.000Z'),
    expiryTime: new Date('2026-07-02T15:00:00.000Z'),
    planStatus: PlanStatus.ACTIVE,
    autoRenewEnabled: false,
    purchaseToken: null,
    linkedPurchaseToken: null,
    lastOrderId: null,
    price: 0,
    currency: 'UAH',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new UsersController(usersService as any, geoAccessService as any);
  });

  it('passes geo/device metadata and planData to createUserByUUID', async () => {
    (geoAccessService.getCountryFromRequest as any).mockReturnValueOnce('PL');
    (geoAccessService.getClientIp as any).mockReturnValueOnce('10.0.0.1');
    (usersService.createUserByUUID as any).mockResolvedValueOnce({
      accessToken: 'access',
    });

    const result = await controller.createUserByUUID(
      {
        uuid: 'uuid-1',
        lang: Lang.UK,
        theme: Theme.LIGHT,
        aiModel: AiModel.GPT_5_MINI,
        regionCode: 'UA',
        devicePubKey: 'device-pub-key',
        deviceId: undefined,
        appVersion: '1.0.0',
        appBuild: 100 as any,
        platform: Platform.ANDROID,
        locale: 'uk-UA',
        timezone: 'Europe/Kiev',
        firstDayOfWeek: 1,
        model: 'Pixel',
        osVersion: 'Android 15',
        osBuildId: 'build-1',
        uniqueId: 'unique-1',
        acquisitionSource: 'organic',
        acquisitionMetaJson: { campaign: 'none' } as any,
        planData: planData as any,
      },
      req as any,
    );

    expect(result).toEqual({ accessToken: 'access' });
    expect(usersService.createUserByUUID).toHaveBeenCalledWith(
      'uuid-1',
      Lang.UK,
      Theme.LIGHT,
      AiModel.GPT_5_MINI,
      Platform.ANDROID,
      'PL',
      'device-pub-key',
      null,
      '1.0.0',
      100,
      'uk-UA',
      'Europe/Kiev',
      1,
      'Pixel',
      'Android 15',
      'build-1',
      'unique-1',
      'organic',
      { campaign: 'none' },
      planData,
      'test-agent',
      '10.0.0.1',
    );
  });

  it('falls back to body regionCode when geo country is missing', async () => {
    (geoAccessService.getCountryFromRequest as any).mockReturnValueOnce(null);
    (geoAccessService.getClientIp as any).mockReturnValueOnce('10.0.0.1');
    (usersService.createUserByUUID as any).mockResolvedValueOnce({
      accessToken: 'access',
    });

    await controller.createUserByUUID(
      {
        uuid: 'uuid-1',
        lang: Lang.UK,
        theme: Theme.LIGHT,
        aiModel: AiModel.GPT_5_MINI,
        regionCode: 'UA',
        devicePubKey: 'device-pub-key',
        appVersion: '1.0.0',
        appBuild: 100 as any,
        platform: Platform.ANDROID,
        locale: 'uk-UA',
        timezone: 'Europe/Kiev',
        firstDayOfWeek: 1,
        model: 'Pixel',
        osVersion: 'Android 15',
        osBuildId: 'build-1',
        uniqueId: null,
        acquisitionSource: null,
        planData: planData as any,
      },
      req as any,
    );

    expect(usersService.createUserByUUID).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      'UA',
      expect.any(String),
      null,
      expect.any(String),
      expect.any(Number),
      expect.any(String),
      expect.any(String),
      expect.any(Number),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      null,
      null,
      undefined,
      planData,
      'test-agent',
      '10.0.0.1',
    );
  });

  it('passes purchase token and device metadata to syncUser', async () => {
    (geoAccessService.getClientIp as any).mockReturnValueOnce('10.0.0.1');
    (usersService.syncUser as any).mockResolvedValueOnce({
      accessToken: 'access',
    });

    const result = await controller.syncUser(
      {
        purchaseToken: 'purchase-token',
        devicePubKey: 'device-pub-key',
        deviceId: undefined,
        appVersion: '1.0.0',
        appBuild: 100 as any,
        platform: Platform.ANDROID,
        model: 'Pixel',
        osVersion: 'Android 15',
        osBuildId: 'build-1',
        uniqueId: 'unique-1',
      },
      req as any,
    );

    expect(result).toEqual({ accessToken: 'access' });
    expect(usersService.syncUser).toHaveBeenCalledWith(
      'purchase-token',
      'device-pub-key',
      null,
      '1.0.0',
      100,
      Platform.ANDROID,
      'Pixel',
      'Android 15',
      'build-1',
      'unique-1',
      'test-agent',
      '10.0.0.1',
    );
  });

  it('throws USER_NOT_FOUND when getOneBy does not find a user', async () => {
    (usersService.getOneBy as any).mockResolvedValueOnce(null);

    await expect(
      controller.getOneBy({ userId: 167, email: undefined, uuid: undefined }),
    ).rejects.toThrow(HttpException);
  });

  it('getMe returns null when there is no active user', async () => {
    await expect(controller.getMe(null as any, { hash: 'hash' })).resolves.toBe(
      null,
    );

    expect(usersService.me).not.toHaveBeenCalled();
  });

  it('getMe delegates uuid and hash to UsersService.me', async () => {
    (usersService.me as any).mockResolvedValueOnce({
      user: { id: 167 },
      plan: { id: 58 },
    });

    const result = await controller.getMe(
      { id: 167, uuid: 'uuid-1' } as any,
      { hash: 'hash-value' },
    );

    expect(result).toEqual({
      user: { id: 167 },
      plan: { id: 58 },
    });
    expect(usersService.me).toHaveBeenCalledWith('uuid-1', 'hash-value');
  });
});
