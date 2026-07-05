import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { HttpException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { BasePlanIds, PlanStatus } from 'src/plans/types';
import { verifyGoogleToken } from './utils';

jest.mock('./utils', () => ({
  verifyGoogleToken: jest.fn(),
}));

describe('AuthService subscription login flow', () => {
  const userSessionsRepository = {};
  const usersService = {
    findByUUID: jest.fn(),
    findByEmail: jest.fn(),
    update: jest.fn(),
    deleteUserByUuid: jest.fn(),
    deleteAnonymousUserByUuid: jest.fn(),
    getUserSettings: jest.fn(),
  };
  const plansService = {
    getActualByUserId: jest.fn(),
  };
  const sessionsService = {
    issueTokens: jest.fn(),
  };
  const aiPreferencesService = {
    getForUser: jest.fn(),
  };

  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AuthService(
      userSessionsRepository as any,
      usersService as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      plansService as any,
      sessionsService as any,
      aiPreferencesService as any,
    );
  });

  it('login uses guarded anonymous cleanup when switching from another local uuid', async () => {
    const hashedPassword = await bcrypt.hash('Password1!', 10);
    const loginUser = {
      id: 200,
      uuid: 'target-user-uuid',
      hash: 'target-hash',
      email: 'target@example.com',
      emailVerified: true,
      password: hashedPassword,
      oauthProviderId: null,
    };
    const updatedUser = {
      ...loginUser,
      isLogged: true,
    };
    (usersService.findByEmail as any)
      .mockResolvedValueOnce(loginUser)
      .mockResolvedValueOnce(updatedUser);
    (usersService.update as any).mockResolvedValueOnce({ user: updatedUser });
    (plansService.getActualByUserId as any).mockResolvedValueOnce({
      plan: null,
    });
    (usersService.getUserSettings as any).mockResolvedValueOnce(null);
    (aiPreferencesService.getForUser as any).mockResolvedValueOnce(null);
    (sessionsService.issueTokens as any).mockResolvedValueOnce({
      accessToken: 'access',
      refreshToken: 'refresh',
      deviceId: 'device-1',
    });

    const result = await service.login(
      {
        email: 'target@example.com',
        password: 'Password1!',
        uuid: 'current-user-uuid',
        deviceId: 'device-1',
        devicePubKey: 'device-pub-key',
      },
      'ua',
      '127.0.0.1',
    );

    expect(usersService.deleteUserByUuid).not.toHaveBeenCalled();
    expect(usersService.deleteAnonymousUserByUuid).toHaveBeenCalledWith(
      'current-user-uuid',
    );
    expect(result).toEqual({
      accessToken: 'access',
      refreshToken: 'refresh',
      deviceId: 'device-1',
      user: updatedUser,
      plan: null,
      settings: null,
      aiPreferences: null,
    });
  });

  it('signInWithGoogle uses guarded anonymous cleanup before logging into an existing Google user', async () => {
    const existingGoogleUser = {
      id: 200,
      uuid: 'existing-google-uuid',
      hash: 'existing-hash',
      oauthProviderId: 'google-sub-1',
    };
    const updatedUser = {
      ...existingGoogleUser,
      isLogged: true,
      isRegistered: true,
      emailVerified: true,
    };
    (verifyGoogleToken as any).mockResolvedValueOnce({
      email: 'existing@example.com',
      sub: 'google-sub-1',
    });
    (usersService.findByEmail as any).mockResolvedValueOnce(existingGoogleUser);
    (usersService.update as any).mockResolvedValueOnce({ user: updatedUser });
    (plansService.getActualByUserId as any).mockResolvedValueOnce({
      plan: null,
    });
    (usersService.getUserSettings as any).mockResolvedValueOnce(null);
    (sessionsService.issueTokens as any).mockResolvedValueOnce({
      accessToken: 'access',
      refreshToken: 'refresh',
      deviceId: 'device-1',
    });

    const result = await service.signInWithGoogle(
      100,
      'current-user-uuid',
      'google-id-token',
      'device-1',
      'device-pub-key',
      'ua',
      '127.0.0.1',
    );

    expect(usersService.deleteUserByUuid).not.toHaveBeenCalled();
    expect(usersService.deleteAnonymousUserByUuid).toHaveBeenCalledWith(
      'current-user-uuid',
    );
    expect(usersService.update).toHaveBeenCalledWith('existing-google-uuid', {
      hash: 'existing-hash',
      isLogged: true,
      isRegistered: true,
      emailVerified: true,
    });
    expect(sessionsService.issueTokens).toHaveBeenCalledWith(
      updatedUser,
      'device-1',
      'device-pub-key',
      'ua',
      '127.0.0.1',
    );
    expect(result).toEqual({
      accessToken: 'access',
      refreshToken: 'refresh',
      deviceId: 'device-1',
      user: updatedUser,
      plan: null,
      settings: null,
    });
  });

  it('loginByUUID returns the actual plan, settings, ai preferences, and issued tokens', async () => {
    const user = { id: 167, uuid: 'uuid-1' };
    const plan = {
      id: 58,
      userId: 167,
      basePlanId: BasePlanIds.BASE_M1,
      planStatus: PlanStatus.ACTIVE,
      actual: true,
    };
    const settings = { id: 10, userId: 167 };
    const aiPreferences = { id: 20, userId: 167 };
    (usersService.findByUUID as any).mockResolvedValueOnce(user);
    (plansService.getActualByUserId as any).mockResolvedValueOnce({ plan });
    (usersService.getUserSettings as any).mockResolvedValueOnce(settings);
    (aiPreferencesService.getForUser as any).mockResolvedValueOnce(
      aiPreferences,
    );
    (sessionsService.issueTokens as any).mockResolvedValueOnce({
      accessToken: 'access',
      refreshToken: 'refresh',
      deviceId: 'device-1',
    });

    const result = await service.loginByUUID(
      'uuid-1',
      'device-pub-key',
      true,
      'device-1',
      'ua',
      '127.0.0.1',
    );

    expect(result).toEqual({
      accessToken: 'access',
      refreshToken: 'refresh',
      deviceId: 'device-1',
      user,
      plan,
      settings,
      aiPreferences,
      isFirstInstall: true,
    });
    expect(plansService.getActualByUserId).toHaveBeenCalledWith(167);
    expect(sessionsService.issueTokens).toHaveBeenCalledWith(
      user,
      'device-1',
      'device-pub-key',
      'ua',
      '127.0.0.1',
    );
  });

  it('loginByUUID throws when the user cannot be found and does not issue tokens', async () => {
    (usersService.findByUUID as any).mockResolvedValueOnce(null);

    await expect(
      service.loginByUUID('missing-uuid', 'device-pub-key', false),
    ).rejects.toThrow(HttpException);

    expect(plansService.getActualByUserId).not.toHaveBeenCalled();
    expect(sessionsService.issueTokens).not.toHaveBeenCalled();
  });

  it('loginByUUID normalizes missing user-agent and ip to null when issuing tokens', async () => {
    const user = { id: 167, uuid: 'uuid-1' };
    (usersService.findByUUID as any).mockResolvedValueOnce(user);
    (plansService.getActualByUserId as any).mockResolvedValueOnce({
      plan: null,
    });
    (usersService.getUserSettings as any).mockResolvedValueOnce(null);
    (aiPreferencesService.getForUser as any).mockResolvedValueOnce(null);
    (sessionsService.issueTokens as any).mockResolvedValueOnce({
      accessToken: 'access',
      refreshToken: 'refresh',
      deviceId: 'device-1',
    });

    await service.loginByUUID('uuid-1', 'device-pub-key', false);

    expect(sessionsService.issueTokens).toHaveBeenCalledWith(
      user,
      undefined,
      'device-pub-key',
      null,
      null,
    );
  });
});
