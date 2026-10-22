import { JwtService } from '@nestjs/jwt';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AuthService } from './auth.service';
import { verifyGoogleToken } from './utils';

jest.mock('./utils', () => ({ verifyGoogleToken: jest.fn() }));

describe('Registration ownership', () => {
  const jwt = new JwtService({ secret: 'registration-test-only' });
  let service: AuthService;
  let users: any;
  let codes: any;
  let mail: any;
  let sessions: any;
  let guest: any;
  const dto = {
    uuid: 'guest',
    email: 'new@example.com',
    password: 'Password1!',
    lang: 'en',
  };
  const token = (data = { id: 10, uuid: 'guest' }) =>
    `Bearer ${jwt.sign(data)}`;
  const google = (authorization?: string, id = 10) =>
    service.signInWithGoogle(
      id,
      'guest',
      'verified-google-token',
      'device',
      'public-key',
      null,
      null,
      authorization,
    );

  beforeEach(() => {
    jest.resetAllMocks();
    guest = {
      id: 10,
      uuid: 'guest',
      email: null,
      isRegistered: false,
      emailVerified: false,
      oauthProvider: null,
      oauthProviderId: null,
    };
    users = {
      findByUUID: jest.fn(async () => guest),
      findByEmail: jest.fn(async () => null),
      findById: jest.fn(async () => guest),
      updateRegistrationGuest: jest.fn(async (_user: any, data: any) => ({
        ...guest,
        ...data,
      })),
      update: jest.fn(),
      getUserSettings: jest.fn(async () => null),
    };
    codes = {
      send: jest.fn(async () => ({ status: 'SENT', code: '123456' })),
      verify: jest.fn(async () => ({ status: 'OK' })),
    };
    mail = { send: jest.fn() };
    sessions = {
      issueTokens: jest.fn(async () => ({
        accessToken: 'access',
        refreshToken: 'refresh',
      })),
    };
    service = new AuthService(
      {} as any,
      users,
      {} as any,
      mail,
      {} as any,
      jwt,
      {} as any,
      {} as any,
      codes,
      { getActualByUserId: jest.fn(async () => ({ plan: null })) } as any,
      sessions,
      {} as any,
    );
    jest.mocked(verifyGoogleToken).mockResolvedValue({
      iss: 'accounts.google.com',
      aud: 'test-client',
      iat: 0,
      exp: 9999999999,
      email: 'google@example.com',
      sub: 'google-sub',
    });
  });

  it.each([
    undefined,
    'Bearer invalid',
    token({ id: 10, uuid: 'other' }),
    `Bearer ${new JwtService({ secret: 'wrong-secret' }).sign({ id: 10, uuid: 'guest' })}`,
    `Bearer ${jwt.sign({ id: 10, uuid: 'guest' }, { expiresIn: -1 })}`,
  ])(
    'rejects registration without valid ownership proof (%#)',
    async (authorization) => {
      await expect(service.register(dto, authorization)).rejects.toMatchObject({
        response: { code: 'REGISTRATION_SESSION_REQUIRED' },
      });
      expect(users.updateRegistrationGuest).not.toHaveBeenCalled();
      expect(codes.send).not.toHaveBeenCalled();
    },
  );

  it('rejects mismatching id even when UUID matches', async () => {
    await expect(
      service.register(dto, token({ id: 11, uuid: 'guest' })),
    ).rejects.toMatchObject({
      response: { code: 'USER_MISMATCH' },
    });
    expect(users.updateRegistrationGuest).not.toHaveBeenCalled();
  });

  it.each([
    { isRegistered: true },
    { emailVerified: true },
    { oauthProvider: 'google' },
    { oauthProviderId: 'google-sub' },
  ])(
    'cannot rewrite a registered profile through email or Google: %j',
    async (registered) => {
      Object.assign(guest, registered);
      await expect(service.register(dto, token())).rejects.toMatchObject({
        response: { code: 'REGISTRATION_ACCOUNT_ALREADY_REGISTERED' },
      });
      await expect(google(token())).rejects.toMatchObject({
        response: { code: 'REGISTRATION_ACCOUNT_ALREADY_REGISTERED' },
      });
      expect(users.updateRegistrationGuest).not.toHaveBeenCalled();
      expect(users.update).not.toHaveBeenCalled();
      expect(sessions.issueTokens).not.toHaveBeenCalled();
    },
  );

  it('cannot overwrite another unverified email account', async () => {
    users.findByEmail.mockResolvedValue({ id: 20, emailVerified: false });
    await expect(service.register(dto, token())).rejects.toMatchObject({
      response: { code: 'USER_ALREADY_EXISTS' },
    });
    expect(users.updateRegistrationGuest).not.toHaveBeenCalled();
  });

  it('upgrades the owned guest in place, including a retry of its pending email', async () => {
    guest.email = dto.email;
    users.findByEmail.mockResolvedValue(guest);
    const result = await service.register(
      { ...dto, email: ' NEW@example.com ' },
      token(),
    );
    expect(users.updateRegistrationGuest).toHaveBeenCalledWith(guest, {
      email: dto.email,
      password: expect.any(String),
    });
    expect(users.updateRegistrationGuest.mock.calls[0][1].password).not.toBe(
      dto.password,
    );
    expect(codes.send).toHaveBeenCalledWith('register_email', {
      email: dto.email,
    });
    expect(result.user?.id).toBe(10);
    expect(sessions.issueTokens).not.toHaveBeenCalled();
  });

  it('does not send a code if the guest changed during the write', async () => {
    users.updateRegistrationGuest.mockRejectedValue(
      new Error('registration state changed'),
    );
    await expect(service.register(dto, token())).rejects.toThrow(
      'registration state changed',
    );
    expect(codes.send).not.toHaveBeenCalled();
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('requires guest proof only for the Google registration branch', async () => {
    await expect(google()).rejects.toMatchObject({
      response: { code: 'REGISTRATION_SESSION_REQUIRED' },
    });
    expect(users.updateRegistrationGuest).not.toHaveBeenCalled();
    const result = await google(token());
    expect(result.user.id).toBe(10);
    expect(users.updateRegistrationGuest).toHaveBeenCalledWith(
      guest,
      expect.objectContaining({
        oauthProviderId: 'google-sub',
        isRegistered: true,
        emailVerified: true,
      }),
    );
    expect(sessions.issueTokens).toHaveBeenCalledTimes(1);
  });

  it('rejects a Google registration body pointing at a different user id', async () => {
    await expect(google(token(), 20)).rejects.toMatchObject({
      response: { code: 'USER_MISMATCH' },
    });
    expect(users.updateRegistrationGuest).not.toHaveBeenCalled();
  });

  it('rejects Google payload without an email before looking up users', async () => {
    jest.mocked(verifyGoogleToken).mockResolvedValue({
      iss: 'accounts.google.com',
      aud: 'test-client',
      iat: 0,
      exp: 9999999999,
      sub: 'google-sub',
    });
    await expect(google(token())).rejects.toMatchObject({
      response: { code: 'INVALID_GOOGLE_TOKEN' },
    });
    expect(users.findByEmail).not.toHaveBeenCalled();
  });

  it('confirms email through the conditional guest write before issuing credentials', async () => {
    users.findByEmail.mockResolvedValue(guest);
    await service.emailConfirmation(dto.email, '123456');
    expect(users.updateRegistrationGuest).toHaveBeenCalledWith(guest, {
      isRegistered: true,
      emailVerified: true,
      isLogged: true,
    });
    expect(users.update).not.toHaveBeenCalled();
    expect(sessions.issueTokens).toHaveBeenCalledTimes(1);
  });

  it('does not issue credentials for a code if the profile already changed', async () => {
    users.findByEmail.mockResolvedValue(guest);
    users.updateRegistrationGuest.mockRejectedValue(
      new Error('registration state changed'),
    );
    await expect(
      service.emailConfirmation(dto.email, '123456'),
    ).rejects.toThrow('registration state changed');
    expect(sessions.issueTokens).not.toHaveBeenCalled();
  });
});
