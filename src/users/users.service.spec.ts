import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { HttpException } from '@nestjs/common';
import { UsersService } from './users.service';
import { Platform } from 'src/common/types/platform';
import { AiModel, Lang, Theme } from './types';
import { BasePlanIds, PlanStatus, SubscriptionIds } from 'src/plans/types';
import { generateHash } from 'src/common/utils/generateHash';

describe('UsersService subscription sync flow', () => {
  const usersRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
  const usersSettingsRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
  };
  const uniqueIdRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
  const authService = {
    loginByUUID: jest.fn(),
  };
  const plansService = {
    findExistingPlanForIap: jest.fn(),
    subscribePlan: jest.fn(),
    getActualByUserId: jest.fn(),
  };
  const saltService = {
    generateSalt: jest.fn(),
    saveSalt: jest.fn(),
    getSaltByUserId: jest.fn(),
  };
  const aiPreferencesService = {
    ensureDefaults: jest.fn(),
    getForUser: jest.fn(),
  };

  let service: UsersService;

  const validDevicePubKey = Buffer.alloc(32, 1).toString('base64');

  beforeEach(() => {
    jest.clearAllMocks();
    service = new UsersService(
      usersRepository as any,
      usersSettingsRepository as any,
      uniqueIdRepository as any,
      authService as any,
      {} as any,
      {} as any,
      plansService as any,
      saltService as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      aiPreferencesService as any,
      {} as any,
      {} as any,
    );
  });

  const trialPlanData = {
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

  function mockCreateUserDependencies() {
    (saltService.generateSalt as any).mockReturnValue('salt-value');
    (usersRepository.create as any).mockImplementation((payload: any) => ({
      id: 167,
      ...payload,
    }));
    (usersRepository.save as any).mockImplementation(async (user: any) => ({
      id: user.id ?? 167,
      ...user,
    }));
    (usersSettingsRepository.create as any).mockImplementation(
      (payload: any) => ({
        id: 10,
        ...payload,
      }),
    );
    (usersSettingsRepository.save as any).mockImplementation(
      async (settings: any) => settings,
    );
    (aiPreferencesService.ensureDefaults as any).mockResolvedValue({
      id: 20,
    });
    (authService.loginByUUID as any).mockResolvedValue({
      accessToken: 'access',
      user: { id: 167 },
    });
    (saltService.saveSalt as any).mockResolvedValue(undefined);
    (plansService.subscribePlan as any).mockResolvedValue({
      plan: { id: 1 },
    });
  }

  it('logs in the owner of an existing purchase token without creating a plan', async () => {
    const owner = { id: 167, uuid: 'owner-uuid' };
    (plansService.findExistingPlanForIap as any).mockResolvedValueOnce({
      id: 58,
      purchaseToken: 'purchase-token',
      user: { id: 167 },
    });
    jest.spyOn(service, 'findById').mockResolvedValueOnce(owner as any);
    (usersSettingsRepository.findOne as any).mockResolvedValueOnce({
      id: 10,
      user: { id: 167 },
    });
    (authService.loginByUUID as any).mockResolvedValueOnce({
      accessToken: 'access',
      user: owner,
    });

    const result = await service.syncUser(
      'purchase-token',
      validDevicePubKey,
      'device-1',
      '1.0.0',
      100,
      Platform.ANDROID,
      'Pixel',
      'Android 15',
      'build-1',
      'unique-1',
      'ua',
      '127.0.0.1',
    );

    expect(result).toEqual({ accessToken: 'access', user: owner });
    expect(plansService.findExistingPlanForIap).toHaveBeenCalledWith(
      'purchase-token',
    );
    expect(plansService.subscribePlan).not.toHaveBeenCalled();
    expect(authService.loginByUUID).toHaveBeenCalledWith(
      'owner-uuid',
      validDevicePubKey,
      false,
      'device-1',
      'ua',
      '127.0.0.1',
    );
  });

  it('updates existing device settings during purchase token sync', async () => {
    (plansService.findExistingPlanForIap as any).mockResolvedValueOnce({
      id: 58,
      user: { id: 167 },
    });
    jest
      .spyOn(service, 'findById')
      .mockResolvedValueOnce({ id: 167, uuid: 'owner-uuid' } as any);
    (usersSettingsRepository.findOne as any).mockResolvedValueOnce({
      id: 10,
    });
    (authService.loginByUUID as any).mockResolvedValueOnce({
      accessToken: 'access',
    });

    await service.syncUser(
      'purchase-token',
      validDevicePubKey,
      'device-1',
      '1.0.0',
      100,
      Platform.ANDROID,
      'Pixel',
      'Android 15',
      'build-1',
      'unique-1',
    );

    expect(usersSettingsRepository.update).toHaveBeenCalledWith(10, {
      appVersion: '1.0.0',
      appBuild: 100,
      platform: Platform.ANDROID,
      model: 'Pixel',
      osVersion: 'Android 15',
      osBuildId: 'build-1',
      uniqueId: 'unique-1',
    });
  });

  it('throws PLAN_NOT_FOUND for unknown purchase tokens and does not login', async () => {
    (plansService.findExistingPlanForIap as any).mockResolvedValueOnce(null);

    await expect(
      service.syncUser(
        'unknown-token',
        validDevicePubKey,
        'device-1',
        '1.0.0',
        100,
        Platform.ANDROID,
        'Pixel',
        'Android 15',
        'build-1',
        null,
      ),
    ).rejects.toThrow(HttpException);

    expect(authService.loginByUUID).not.toHaveBeenCalled();
    expect(plansService.subscribePlan).not.toHaveBeenCalled();
  });

  it('stores a new unique id during purchase token sync when it has not been seen before', async () => {
    (uniqueIdRepository.findOne as any).mockResolvedValueOnce(null);
    (uniqueIdRepository.create as any).mockReturnValueOnce({
      uniqueId: 'unique-1',
    });
    (plansService.findExistingPlanForIap as any).mockResolvedValueOnce({
      id: 58,
      user: { id: 167 },
    });
    jest
      .spyOn(service, 'findById')
      .mockResolvedValueOnce({ id: 167, uuid: 'owner-uuid' } as any);
    (usersSettingsRepository.findOne as any).mockResolvedValueOnce(null);
    (authService.loginByUUID as any).mockResolvedValueOnce({
      accessToken: 'access',
    });

    await service.syncUser(
      'purchase-token',
      validDevicePubKey,
      'device-1',
      '1.0.0',
      100,
      Platform.ANDROID,
      'Pixel',
      'Android 15',
      'build-1',
      'unique-1',
    );

    expect(uniqueIdRepository.create).toHaveBeenCalledWith({
      uniqueId: 'unique-1',
    });
    expect(uniqueIdRepository.save).toHaveBeenCalledWith({
      uniqueId: 'unique-1',
    });
  });

  it('creates a trial plan on first install when createUserByUUID receives planData', async () => {
    mockCreateUserDependencies();
    (uniqueIdRepository.findOne as any).mockResolvedValueOnce(null);
    (uniqueIdRepository.create as any).mockReturnValueOnce({
      uniqueId: 'unique-1',
    });

    const result = await service.createUserByUUID(
      'uuid-1',
      Lang.UK,
      Theme.LIGHT,
      AiModel.GPT_5_MINI,
      Platform.ANDROID,
      'ua',
      validDevicePubKey,
      'device-1',
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
      { campaign: 'none' } as any,
      trialPlanData as any,
      'ua-string',
      '127.0.0.1',
    );

    expect(result).toEqual({ accessToken: 'access', user: { id: 167 } });
    expect(uniqueIdRepository.save).toHaveBeenCalledWith({
      uniqueId: 'unique-1',
    });
    expect(saltService.saveSalt).toHaveBeenCalledWith(167, 'salt-value');
    expect(plansService.subscribePlan).toHaveBeenCalledWith(
      167,
      trialPlanData,
    );
    expect(authService.loginByUUID).toHaveBeenCalledWith(
      'uuid-1',
      validDevicePubKey,
      true,
      'device-1',
      'ua-string',
      '127.0.0.1',
    );
  });

  it('does not create a trial plan for returning installs with an existing unique id', async () => {
    mockCreateUserDependencies();
    (uniqueIdRepository.findOne as any).mockResolvedValueOnce({
      id: 1,
      uniqueId: 'unique-1',
    });

    await service.createUserByUUID(
      'uuid-1',
      Lang.UK,
      Theme.LIGHT,
      AiModel.GPT_5_MINI,
      Platform.ANDROID,
      'UA',
      validDevicePubKey,
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
      null,
      null,
      trialPlanData as any,
    );

    expect(uniqueIdRepository.create).not.toHaveBeenCalled();
    expect(plansService.subscribePlan).not.toHaveBeenCalled();
    expect(authService.loginByUUID).toHaveBeenCalledWith(
      'uuid-1',
      validDevicePubKey,
      false,
      undefined,
      undefined,
      undefined,
    );
  });

  it('does not create a trial plan on first install when planData is missing', async () => {
    mockCreateUserDependencies();
    (uniqueIdRepository.findOne as any).mockResolvedValueOnce(null);
    (uniqueIdRepository.create as any).mockReturnValueOnce({
      uniqueId: 'unique-1',
    });

    await service.createUserByUUID(
      'uuid-1',
      Lang.UK,
      Theme.LIGHT,
      AiModel.GPT_5_MINI,
      Platform.ANDROID,
      'UA',
      validDevicePubKey,
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
      null,
      null,
      undefined,
    );

    expect(plansService.subscribePlan).not.toHaveBeenCalled();
    expect(authService.loginByUUID).toHaveBeenCalledWith(
      'uuid-1',
      validDevicePubKey,
      true,
      undefined,
      undefined,
      undefined,
    );
  });

  it('rejects createUserByUUID before creating records when device public key is invalid', async () => {
    await expect(
      service.createUserByUUID(
        'uuid-1',
        Lang.UK,
        Theme.LIGHT,
        AiModel.GPT_5_MINI,
        Platform.ANDROID,
        'UA',
        'bad-key',
        null,
        '1.0.0',
        100,
        'uk-UA',
        'Europe/Kiev',
        1,
        'Pixel',
        'Android 15',
        'build-1',
        null,
        null,
        null,
        trialPlanData as any,
      ),
    ).rejects.toThrow(HttpException);

    expect(usersRepository.create).not.toHaveBeenCalled();
    expect(plansService.subscribePlan).not.toHaveBeenCalled();
    expect(authService.loginByUUID).not.toHaveBeenCalled();
  });

  it('me returns the user actual plan, settings, and ai preferences when hash is valid', async () => {
    const user = { id: 167, uuid: 'uuid-1' };
    const hash = generateHash('uuid-1', 'salt-value');
    const plan = {
      id: 58,
      userId: 167,
      basePlanId: BasePlanIds.BASE_M1,
      planStatus: PlanStatus.ACTIVE,
    };
    const settings = { id: 10, userId: 167 };
    const aiPreferences = { id: 20, userId: 167 };
    (usersRepository.findOne as any).mockResolvedValueOnce(user);
    (saltService.getSaltByUserId as any).mockResolvedValueOnce({
      value: 'salt-value',
    });
    (plansService.getActualByUserId as any).mockResolvedValueOnce({ plan });
    jest.spyOn(service, 'getUserSettings').mockResolvedValueOnce(settings as any);
    (aiPreferencesService.getForUser as any).mockResolvedValueOnce(
      aiPreferences,
    );

    const result = await service.me('uuid-1', hash);

    expect(result).toEqual({
      user,
      plan,
      settings,
      aiPreferences,
    });
    expect(plansService.getActualByUserId).toHaveBeenCalledWith(167);
  });

  it('me throws for an invalid hash and does not fetch the actual plan', async () => {
    const user = { id: 167, uuid: 'uuid-1' };
    (usersRepository.findOne as any).mockResolvedValueOnce(user);
    (saltService.getSaltByUserId as any).mockResolvedValueOnce({
      value: 'salt-value',
    });

    await expect(service.me('uuid-1', 'wrong-hash')).rejects.toThrow(
      HttpException,
    );

    expect(plansService.getActualByUserId).not.toHaveBeenCalled();
    expect(aiPreferencesService.getForUser).not.toHaveBeenCalled();
  });

  it('me throws when the uuid does not belong to a user', async () => {
    (usersRepository.findOne as any).mockResolvedValueOnce(null);

    await expect(service.me('missing-uuid', 'hash')).rejects.toThrow(
      HttpException,
    );

    expect(saltService.getSaltByUserId).not.toHaveBeenCalled();
    expect(plansService.getActualByUserId).not.toHaveBeenCalled();
  });
});
