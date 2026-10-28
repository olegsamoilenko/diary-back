import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { HttpException } from '@nestjs/common';
import { IsNull } from 'typeorm';
import { UsersService } from './users.service';
import { Platform } from 'src/common/types/platform';
import {
  AiModel,
  CalendarIconFutureRange,
  DiaryTabVariant,
  Lang,
  Theme,
} from './types';
import { BasePlanIds, PlanStatus, SubscriptionIds } from 'src/plans/types';
import { generateHash } from 'src/common/utils/generateHash';
import { User } from './entities/user.entity';
import { UserSettings } from './entities/user-settings.entity';

describe('UsersService subscription sync flow', () => {
  const usersRepository = {
    manager: { transaction: jest.fn() },
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
    manager: { transaction: jest.fn() },
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
  const creationManager = {
    query: jest.fn(async () => []),
    getRepository: (entity: unknown) => entity === User ? usersRepository : entity === UserSettings ? usersSettingsRepository : uniqueIdRepository,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (usersRepository.manager.transaction as any).mockImplementation(async (work: any) => work(creationManager));
    (uniqueIdRepository.manager.transaction as any).mockImplementation(async (work: any) => work({
      query: jest.fn(async () => []),
      getRepository: () => uniqueIdRepository,
    }));
    (
      subscriptionsService.findStoreSubscriptionOwnerByPurchaseToken as any
    ).mockResolvedValue(null);
    (
      subscriptionsService.hasPaidStoreSubscriptionForUser as any
    ).mockResolvedValue(false);
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

  it('preserves a guest with a paid V2 subscription even without a legacy paid plan', async () => {
    (usersRepository.findOne as any).mockResolvedValueOnce({
      id: 167,
      uuid: 'paid-v2-guest',
      isSystem: false,
      isRegistered: false,
      email: null,
      phone: null,
      oauthProvider: null,
      oauthProviderId: null,
      password: null,
    });
    (
      subscriptionsService.hasPaidStoreSubscriptionForUser as any
    ).mockResolvedValueOnce(true);
    const deleteSpy = jest.spyOn(service, 'deleteUser');

    expect(await service.deleteAnonymousUserByUuid('paid-v2-guest')).toBe(false);
    expect(plansService.hasPaidPlanByUserId).toHaveBeenCalledWith(167);
    expect(
      subscriptionsService.hasPaidStoreSubscriptionForUser,
    ).toHaveBeenCalledWith(167);
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

  function mockCreateUserDependencies(userId = 167) {
    (usersRepository.findOne as any).mockReset().mockResolvedValue(null);
    (saltService.generateSalt as any).mockReturnValue('salt-value');
    (usersRepository.create as any).mockImplementation((payload: any) => ({
      id: userId,
      ...payload,
    }));
    (usersRepository.save as any).mockImplementation(async (user: any) => ({
      id: user.id ?? userId,
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
      user: { id: userId },
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
    mockCreateUserDependencies(168);
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

    expect(result).toEqual({ accessToken: 'access', user: { id: 168 } });
    expect(usersSettingsRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        shortAiReflectionEnabled: true,
        aiAnalysisEnabledByDefault: true,
        checkinAiAnalysisEnabledByDefault: false,
        calendarShowEventIcons: true,
        calendarShowGoalIcons: true,
        calendarShowMood: true,
        calendarShowEventIconsPast: false,
        calendarShowGoalIconsPast: false,
        calendarEventIconsFutureRange: CalendarIconFutureRange.ALL,
        calendarGoalIconsFutureRange: CalendarIconFutureRange.ALL,
        diaryTabEnabled: false,
        diaryTabVariant: DiaryTabVariant.CALENDAR_ONLY,
      }),
    );
    expect(uniqueIdRepository.save).toHaveBeenCalledWith({
      uniqueId: 'unique-1',
    });
    expect(saltService.saveSalt).toHaveBeenCalledWith(168, 'salt-value', creationManager);
    expect(
      forumTopicReadStatesService.markAllExistingTopicsAsReadForNewUser,
    ).toHaveBeenCalledWith(168, creationManager);
    expect(plansService.subscribePlan).toHaveBeenCalledWith(168, trialPlanData, creationManager);
    expect(usersRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ usesWithoutSubscription: false }),
    );
    expect(authService.loginByUUID).toHaveBeenCalledWith(
      'uuid-1',
      validDevicePubKey,
      true,
      'device-1',
      'ua-string',
      '127.0.0.1',
      creationManager,
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
    ).toHaveBeenCalledWith(167, creationManager);
    expect(plansService.subscribePlan).not.toHaveBeenCalled();
    expect(usersRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ usesWithoutSubscription: true }),
    );
    expect(authService.loginByUUID).toHaveBeenCalledWith(
      'uuid-1',
      validDevicePubKey,
      false,
      undefined,
      undefined,
      undefined,
      creationManager,
    );
  });

  it.each([null, '', '   '])('does not grant a trial when device identity is missing (%j)', async uniqueId => {
    mockCreateUserDependencies();
    await service.createUserByUUID(
      'new-guest', Lang.UK, Theme.LIGHT, AiModel.GPT_5_MINI, Platform.ANDROID,
      'UA', validDevicePubKey, 'same-device-session', '1.0.0', 100, 'uk-UA',
      'Europe/Kiev', 1, 'Pixel', 'Android 15', 'build-1', uniqueId, null, null, trialPlanData as any,
    );
    expect(uniqueIdRepository.manager.transaction).not.toHaveBeenCalled();
    expect(plansService.subscribePlan).not.toHaveBeenCalled();
    expect(usersRepository.create).toHaveBeenCalledWith(expect.objectContaining({usesWithoutSubscription:true}));
    expect(authService.loginByUUID).toHaveBeenCalledWith('new-guest', validDevicePubKey, false, 'same-device-session', undefined, undefined, creationManager);
  });

  it('serializes same-device registration before reading eligibility and records it only once', async () => {
    let queue = Promise.resolve();
    let registered = false;
    const operations: string[] = [];
    const registry = {
      findOne: jest.fn(async () => { operations.push('read'); return registered ? {id:1} : null; }),
      create: jest.fn(value => value),
      save: jest.fn(async () => { operations.push('save'); registered = true; }),
    };
    (uniqueIdRepository.manager.transaction as any).mockImplementation((work: any) => {
      const request = work({
        query: jest.fn(async (sql: string, args: unknown[]) => {
          expect(sql).toContain('pg_advisory_xact_lock');
          expect(args).toEqual(['same-phone']);
          await queue;
          operations.push('lock');
        }),
        getRepository: () => registry,
      });
      queue = request.then(() => undefined);
      return request;
    });
    const result = await Promise.all([
      (service as any).claimFirstDeviceInstall('same-phone'),
      (service as any).claimFirstDeviceInstall('same-phone'),
    ]);
    expect(result).toEqual([true,false]);
    expect(operations).toEqual(['lock','read','save','lock','read']);
    expect(registry.save).toHaveBeenCalledTimes(1);
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
    ).toHaveBeenCalledWith(167, creationManager);
    expect(authService.loginByUUID).toHaveBeenCalledWith(
      'uuid-1',
      validDevicePubKey,
      true,
      undefined,
      undefined,
      undefined,
      creationManager,
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

  it('normalizes an old AI model without writing a stale onboarding attribution', async () => {
    (usersSettingsRepository.findOne as any).mockResolvedValueOnce({ id: 10, aiModel: 'unknown', onboardingVariant: null });
    await service.getUserSettings(167);
    expect(usersSettingsRepository.save).toHaveBeenCalledWith({ id: 10, aiModel: expect.any(String) });
    expect(usersSettingsRepository.save).not.toHaveBeenCalledWith(expect.objectContaining({ onboardingVariant: null }));
  });

  it('updates portable account theme through the existing settings endpoint without changing legacy theme', async () => {
    const themeSelection = {family:'trail',mode:'dark'} as const;
    (usersSettingsRepository.findOne as any).mockResolvedValueOnce({id:10,theme:'light',themeSelection:null})
      .mockResolvedValueOnce({id:10,theme:'light',themeSelection});
    const result = await service.updateUserSettings(167,{themeSelection});
    expect(usersSettingsRepository.findOne).toHaveBeenCalledWith({where:{user:{id:167}}});
    expect(usersSettingsRepository.update).toHaveBeenCalledWith({id:10},{themeSelection});
    expect(usersSettingsRepository.save).not.toHaveBeenCalled();
    expect(result?.theme).toBe('light');
    expect(result?.themeSelection).toEqual(themeSelection);
  });
  it('initializes a missing theme atomically without overwriting another device choice', async () => {
    const themeSelection = {family:'trail',mode:'light'} as const;
    (usersSettingsRepository.findOne as any).mockResolvedValue({id:10,themeSelection:{family:'orbit',mode:'dark'}});
    const result = await service.updateUserSettings(167,{themeSelection,initializeThemeSelection:true});
    expect(usersSettingsRepository.update).toHaveBeenCalledWith({id:10,themeSelection:IsNull()},{themeSelection});
    expect(result?.themeSelection?.family).toBe('orbit');
  });
  it('does not write a stale V2 theme when an older client changes font', async () => {
    (usersSettingsRepository.findOne as any).mockResolvedValue({id:10,themeSelection:{family:'trail',mode:'dark'}});
    await service.updateUserSettings(167,{font:'Montserrat'} as any);
    expect(usersSettingsRepository.save).toHaveBeenCalledWith(expect.objectContaining({id:10,themeSelection:undefined,font:'Montserrat'}));
    expect(usersSettingsRepository.update).not.toHaveBeenCalled();
  });

  it.each(['journal-collage', 'pastel-refined', 'quick-start', 'direct-entry'] as const)('claims first onboarding variant %s only while the column is null', async (variant) => {
    (usersSettingsRepository.findOne as any).mockResolvedValueOnce({ id: 10, onboardingVariant: null })
      .mockResolvedValueOnce({ id: 10, onboardingVariant: variant });
    const result = await service.updateUserSettings(167, { onboardingVariant: variant });
    expect(usersSettingsRepository.update).toHaveBeenCalledWith({ id: 10, onboardingVariant: IsNull() }, { onboardingVariant: variant });
    expect(usersSettingsRepository.save).not.toHaveBeenCalled();
    expect(result?.onboardingVariant).toBe(variant);
  });
  it('returns the original attribution when a different device tries to claim another variant', async () => {
    (usersSettingsRepository.findOne as any).mockResolvedValue({ id: 10, onboardingVariant: 'quick-start' });
    const result = await service.updateUserSettings(167, { onboardingVariant: 'direct-entry' });
    expect(usersSettingsRepository.update).toHaveBeenCalledWith({ id: 10, onboardingVariant: IsNull() }, { onboardingVariant: 'direct-entry' });
    expect(result?.onboardingVariant).toBe('quick-start');
  });
  it('never writes a stale attribution during ordinary settings updates, including explicit null', async () => {
    (usersSettingsRepository.findOne as any).mockResolvedValueOnce({ id: 10, onboardingVariant: 'quick-start' });
    (usersSettingsRepository.save as any).mockImplementationOnce(async (value: any) => value);
    const result = await service.updateUserSettings(167, { onboardingVariant: null, shortAiReflectionEnabled: false });
    expect(usersSettingsRepository.save).toHaveBeenCalledWith({ id: 10, onboardingVariant: undefined, shortAiReflectionEnabled: false });
    expect(usersSettingsRepository.update).not.toHaveBeenCalled();
    expect(result?.onboardingVariant).toBe('quick-start');
  });
  it.each(['', 'unknown', 4, {}])('rejects invalid attribution %j before any mutation', async (value) => {
    (usersSettingsRepository.findOne as any).mockResolvedValueOnce({ id: 10 });
    await expect(service.updateUserSettings(167, { onboardingVariant: value } as any)).rejects.toThrow();
    expect(usersSettingsRepository.save).not.toHaveBeenCalled();
    expect(usersSettingsRepository.update).not.toHaveBeenCalled();
  });

  it.each([
    [{ aiAnalysisEnabledByDefault: true, checkinAiAnalysisEnabledByDefault: false }, { aiAnalysisEnabledByDefault: false }, false, false],
    [{ aiAnalysisEnabledByDefault: false, checkinAiAnalysisEnabledByDefault: false }, { checkinAiAnalysisEnabledByDefault: true }, false, true],
    [{ aiAnalysisEnabledByDefault: true, checkinAiAnalysisEnabledByDefault: null }, { aiAnalysisEnabledByDefault: false }, false, true],
    [{ aiAnalysisEnabledByDefault: false, checkinAiAnalysisEnabledByDefault: null }, { aiAnalysisEnabledByDefault: true }, true, false],
  ])('keeps AI defaults independent when updating %j with %j', async (settings, update, entryExpected, checkinExpected) => {
    (usersSettingsRepository.findOne as any).mockResolvedValueOnce({ id: 10, ...settings });
    (usersSettingsRepository.save as any).mockImplementationOnce(async (value: any) => value);
    const result = await service.updateUserSettings(167, update as any);
    expect(result?.aiAnalysisEnabledByDefault).toBe(entryExpected);
    expect(result?.checkinAiAnalysisEnabledByDefault).toBe(checkinExpected);
  });

  it.each([null, 'false', 1])('rejects invalid check-in preference %s', async (value) => {
    (usersSettingsRepository.findOne as any).mockResolvedValueOnce({ id: 10 });
    await expect(service.updateUserSettings(167, { checkinAiAnalysisEnabledByDefault: value } as any)).rejects.toThrow();
    expect(usersSettingsRepository.save).not.toHaveBeenCalled();
  });

  it.each(['ask', 'always', 'never'] as const)(
    'persists entry media mode %s',
    async (mode) => {
      (usersSettingsRepository.findOne as any).mockResolvedValueOnce({
        id: 10,
        entryMediaAnalysisMode: 'ask',
      });
      (usersSettingsRepository.save as any).mockImplementationOnce(
        async (value: any) => value,
      );
      const result = await service.updateUserSettings(167, {
        entryMediaAnalysisMode: mode,
      });
      expect(result?.entryMediaAnalysisMode).toBe(mode);
    },
  );
  it.each([null, '', 'sometimes', true])(
    'rejects invalid media consent mode %s',
    async (mode) => {
      (usersSettingsRepository.findOne as any).mockResolvedValueOnce({
        id: 10,
        entryMediaAnalysisMode: 'never',
      });
      await expect(
        service.updateUserSettings(167, {
          entryMediaAnalysisMode: mode,
        } as any),
      ).rejects.toThrow();
      expect(usersSettingsRepository.save).not.toHaveBeenCalled();
    },
  );
  it('preserves media consent for older clients updating other settings', async () => {
    (usersSettingsRepository.findOne as any).mockResolvedValueOnce({
      id: 10,
      entryMediaAnalysisMode: 'never',
    });
    (usersSettingsRepository.save as any).mockImplementationOnce(
      async (value: any) => value,
    );
    const result = await service.updateUserSettings(167, {
      shortAiReflectionEnabled: false,
    });
    expect(result?.entryMediaAnalysisMode).toBe('never');
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

  it('updates calendar marker visibility settings independently', async () => {
    const settings = {
      id: 10,
      calendarShowEventIcons: true,
      calendarShowGoalIcons: true,
      calendarShowMood: true,
      calendarShowEventIconsPast: true,
      calendarShowGoalIconsPast: true,
      calendarEventIconsFutureRange: CalendarIconFutureRange.ALL,
      calendarGoalIconsFutureRange: CalendarIconFutureRange.ALL,
    };
    (usersSettingsRepository.findOne as any).mockResolvedValueOnce(settings);
    (usersSettingsRepository.save as any).mockImplementationOnce(
      async (value: any) => value,
    );

    const result = await service.updateUserSettings(167, {
      calendarShowEventIcons: false,
      calendarShowGoalIconsPast: false,
      calendarGoalIconsFutureRange: CalendarIconFutureRange.DAYS_7,
    });

    expect(result).toEqual({
      id: 10,
      calendarShowEventIcons: false,
      calendarShowGoalIcons: true,
      calendarShowMood: true,
      calendarShowEventIconsPast: true,
      calendarShowGoalIconsPast: false,
      calendarEventIconsFutureRange: CalendarIconFutureRange.ALL,
      calendarGoalIconsFutureRange: CalendarIconFutureRange.DAYS_7,
    });
    expect(usersSettingsRepository.save).toHaveBeenCalledWith(result);
  });

  it('keeps GPT-5.2 settings unchanged for older app versions', async () => {
    const settings = { id: 10, aiModel: 'gpt-5.2' };
    (usersSettingsRepository.findOne as any).mockResolvedValueOnce(settings);

    const result = await service.getUserSettings(167);

    expect(result?.aiModel).toBe(AiModel.GPT_5_2);
    expect(usersSettingsRepository.save).not.toHaveBeenCalled();
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
    jest
      .spyOn(service, 'getUserSettings')
      .mockResolvedValueOnce(settings as any);
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

  it('mirrors the legacy flag without activating the V2 runtime early', async () => {
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
    expect(subscriptionsService.useWithoutSubscription).not.toHaveBeenCalled();
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
