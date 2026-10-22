import { UsersService } from './users.service';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

describe('Atomic registration write', () => {
  let service: UsersService;
  let query: any;
  const guest = { id: 10, uuid: 'owned-guest', email: null } as any;
  beforeEach(() => {
    query = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn(async () => ({ affected: 1 })),
    };
    service = Object.assign(Object.create(UsersService.prototype), {
      usersRepository: { createQueryBuilder: () => query },
      findById: jest.fn(async () => guest),
    });
  });
  it('only updates the same still-unregistered guest, preserving its id', async () => {
    await expect(
      service.updateRegistrationGuest(guest, { email: 'new@example.com' }),
    ).resolves.toBe(guest);
    expect(query.where).toHaveBeenCalledWith('id = :id AND uuid = :uuid', {
      id: 10,
      uuid: 'owned-guest',
    });
    expect(query.andWhere).toHaveBeenCalledWith(
      '"isRegistered" = false AND "emailVerified" = false',
    );
    expect(query.andWhere).toHaveBeenCalledWith(
      '"oauthProvider" IS NULL AND "oauthProviderId" IS NULL',
    );
    expect(query.andWhere).toHaveBeenCalledWith(
      'email IS NOT DISTINCT FROM :email',
      { email: null },
    );
    expect(query.set).toHaveBeenCalledWith({ email: 'new@example.com' });
  });
  it('rejects a concurrently registered or replaced profile', async () => {
    query.execute.mockResolvedValue({ affected: 0 });
    await expect(
      service.updateRegistrationGuest(guest, { email: 'new@example.com' }),
    ).rejects.toMatchObject({
      response: { code: 'REGISTRATION_ACCOUNT_ALREADY_REGISTERED' },
    });
    expect(service.findById).not.toHaveBeenCalled();
  });
});
