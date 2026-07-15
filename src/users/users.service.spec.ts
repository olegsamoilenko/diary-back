import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { HttpException } from '@nestjs/common';
import { UsersService } from './users.service';
import { Platform } from 'src/common/types/platform';
import { AiModel, DiaryTabVariant, Lang, Theme } from './types';
import { BasePlanIds, PlanStatus, SubscriptionIds } from 'src/plans/types';
import { generateHash } from 'src/common/utils/generateHash';

describe('UsersService subscription sync flow', () => {
  const usersRepository = {
    findOne: jest.fn(),
    findOneBy: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
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
    hasPaidPlanByUserId: jest.fn(),
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
  const forumTopicReadStatesService = {
    markAllExistingTopicsAsReadForNewUser: jest.fn(),
  };
  const subscriptionsService = {
    findStoreSubscriptionOwnerByPurchaseToken: jest.fn(),
    hasPaidStoreSubscriptionForUser: jest.fn(),
    syncLegacyPlanToUserPlanState: jest.fn(),
    useWithoutSubscription: jest.fn(),
  };

  let service: UsersService;

  const validDevicePubKey = Buffer.alloc(32, 1).toString('base64');

  beforeEach(() => {
    process.env.DIARY_TAB_EXPERIMENT_ENABLED = 'true';
    process.env.DIARY_TAB_EXPERIMENT_MIN_BUILD = '100';
    jest.clearAllMocks();
    (
      subscriptionsService.findStoreSubscriptionOwnerByPurchaseToken as any
    ).mockResolvedValue(null);
    (subscriptionsService.hasPaidStoreSubscriptionForUser as any).mockResolvedValue(
      false,
    );
    (plansService.hasPaidPlanByUserId as any).mockResolvedValue(false);
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
      forumTopicReadStatesService as any,
      subscriptionsService as any,
    );
  });

  it('deletes only anonymous users during guarded uuid cleanup', async () => {
    (usersRepository.findOne as any).mockResolvedValueOnce({
      id: 167,
      uuid: 'anon-uuid',
      isSystem: false,
      isRegistered: false,
      email: null,
      phone: null,
      oauthProvider: null,
      oauthProviderId: null,
      password: null,
    });
    const deleteSpy = jest
      .spyOn(service, 'deleteUser')
      .mockResolvedValueOnce(undefined as any);

    const result = await service.deleteAnonymousUserByUuid('anon-uuid');

    expect(result).toBe(true);
    expect(plansService.hasPaidPlanByUserId).toHaveBeenCalledWith(167);
    expect(
      subscriptionsService.hasPaidStoreSubscriptionForUser,
    ).toHaveBeenCalledWith(167);
    expect(deleteSpy).toHaveBeenCalledWith(167);
  });

  it('does not delete registered users during guarded uuid cleanup', async () => {
    (usersRepository.findOne as any).mockResolvedValueOnce({
      id: 167,
      uuid: 'registered-uuid',
      isSystem: false,
      isRegistered: true,
      email: 'user@example.com',
      phone: null,
      oauthProvider: null,
      oauthProviderId: null,
      password: null,
    });
    const deleteSpy = jest.spyOn(service, 'deleteUser');

    const result = await service.deleteAnonymousUserByUuid('registered-uuid');

    expect(result).toBe(false);
    expect(plansService.hasPaidPlanByUserId).not.toHaveBeenCalled();
    expect(
      subscriptionsService.hasPaidStoreSubscriptionForUser,
    ).not.toHaveBeenCalled();
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it('does not delete anonymous users with paid subscriptions during guarded uuid cleanup', async () => {
    (usersRepository.findOne as any).mockResolvedValueOnce({
      id: 167,
      uuid: 'paid-anon-uuid',
      isSystem: false,
      isRegistered: false,
      email: null,
      phone: null,
      oauthProvider: null,
      oauthProviderId: null,
      password: null,
    });
    (plansService.hasPaidPlanByUserId as any).mockResolvedValueOnce(true);
    const deleteSpy = jest.spyOn(service, 'deleteUser');

    const result = await service.deleteAnonymousUserByUuid('paid-anon-uuid');

    expect(result).toBe(false);
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it('syncs user by V2 store subscription purchase token before legacy plans', async () => {
    (
      subscriptionsService.findStoreSubscriptionOwnerByPurchaseToken as any
    ).mockResolvedValueOnce({
      id: 901,
      userId: 167,
      purchaseToken: 'purchase-token',
      user: { id: 167 },
    });
    jest
      .spyOn(service, 'findById')
      .mockResolvedValueOnce({ id: 167, uuid: 'owner-uuid' } as any);
    (usersSettingsRepository.findOne as any).mockResolvedValueOnce({
      id: 10,
      user: { id: 167 },
    });
    (authService.loginByUUID as any).mockResolvedValueOnce({
      accessToken: 'access',
      user: { id: 167 },
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

    expect(result).toEqual({ accessToken: 'access', user: { id: 167 } });
    expect(
      subscriptionsService.findStoreSubscriptionOwnerByPurchaseToken,
    ).toHaveBeenCalledWith('purchase-token');
    expect(plansService.findExistingPlanForIap).not.toHaveBeenCalled();
    expect(authService.loginByUUID).toHaveBeenCalledWith(
      'owner-uuid',
      validDevicePubKey,
      false,
      'device-1',
      'ua',
      '127.0.0.1',
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
    (
      forumTopicReadStatesService.markAllExistingTopicsAsReadForNewUser as any
    ).mockResolvedValue({ success: true });
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
    expect(usersSettingsRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        diaryTabEnabled: false,
        diaryTabVariant: DiaryTabVariant.CALENDAR_ONLY,
      }),
    );
    expect(uniqueIdRepository.save).toHaveBeenCalledWith({
      uniqueId: 'unique-1',
    });
    expect(saltService.saveSalt).toHaveBeenCalledWith(167, 'salt-value');
    expect(
      forumTopicReadStatesService.markAllExistingTopicsAsReadForNewUser,
    ).toHaveBeenCalledWith(167);
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
    expect(
      forumTopicReadStatesService.markAllExistingTopicsAsReadForNewUser,
    ).toHaveBeenCalledWith(167);
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
    expect(
      forumTopicReadStatesService.markAllExistingTopicsAsReadForNewUser,
    ).toHaveBeenCalledWith(167);
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

  it('updates diary visibility without allowing the experiment variant to change', async () => {
    const settings = {
      id: 10,
      diaryTabEnabled: false,
      diaryTabVariant: DiaryTabVariant.CALENDAR_ONLY,
    };
    (usersSettingsRepository.findOne as any).mockResolvedValueOnce(settings);
    (usersSettingsRepository.save as any).mockImplementationOnce(
      async (value: any) => value,
    );

    const result = await service.updateUserSettings(167, {
      diaryTabEnabled: true,
      diaryTabVariant: DiaryTabVariant.DIARY_AND_CALENDAR,
    } as any);

    expect(result).toEqual({
      id: 10,
      diaryTabEnabled: true,
      diaryTabVariant: DiaryTabVariant.CALENDAR_ONLY,
    });
    expect(usersSettingsRepository.save).toHaveBeenCalledWith(result);
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

  it('syncs new subscription state when legacy user update enables use without subscription', async () => {
    const user = { id: 167, uuid: 'uuid-1' };
    const updatedUser = {
      id: 167,
      uuid: 'uuid-1',
      usesWithoutSubscription: true,
    };
    const plan = {
      id: 58,
      userId: 167,
      basePlanId: BasePlanIds.BASE_M1,
      planStatus: PlanStatus.CANCELED,
      actual: true,
    };
    (usersRepository.findOne as any)
      .mockResolvedValueOnce(user)
      .mockResolvedValueOnce(updatedUser);
    (saltService.getSaltByUserId as any).mockResolvedValueOnce({
      value: 'salt-value',
    });
    (usersRepository.update as any).mockResolvedValueOnce({ affected: 1 });
    (plansService.getActualByUserId as any).mockResolvedValueOnce({ plan });

    const result = await service.update('uuid-1', {
      hash: generateHash('uuid-1', 'salt-value'),
      usesWithoutSubscription: true,
    } as any);

    expect(result).toEqual({ user: updatedUser });
    expect(usersRepository.update).toHaveBeenCalledWith(167, {
      usesWithoutSubscription: true,
    });
    expect(
      subscriptionsService.syncLegacyPlanToUserPlanState,
    ).toHaveBeenCalledWith(167, plan);
    expect(subscriptionsService.useWithoutSubscription).toHaveBeenCalledWith(
      167,
    );
  });

  it('rejects subscription-sensitive fields in updateByIdAndUuid', async () => {
    (usersRepository.findOneBy as any).mockResolvedValueOnce({
      id: 167,
      uuid: 'uuid-1',
    });

    await expect(
      service.updateByIdAndUuid(167, 'uuid-1', {
        usesWithoutSubscription: true,
      } as any),
    ).rejects.toThrow(HttpException);

    expect(usersRepository.update).not.toHaveBeenCalled();
  });
});
