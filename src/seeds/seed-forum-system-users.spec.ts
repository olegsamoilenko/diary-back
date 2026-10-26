import { afterEach, describe, expect, it, jest } from '@jest/globals';
import fs from 'fs';
import { DataSource } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { SYSTEM_USERS, upsertSystemUser } from './seed-forum-system-users';

jest.mock('../../data-source', () => ({ __esModule: true, default: {} }));

describe('System profile avatar seed', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each([
    '/uploads/forum/avatars/custom.png',
    '/uploads/forum/avatars/nemory.webp',
  ])(
    'preserves an existing avatar %s without copying the old seed',
    async (avatarUrl) => {
      const copy = jest
        .spyOn(fs, 'copyFileSync')
        .mockImplementation(() => undefined);
      const users = { findOne: async () => ({ id: 7 }), update: jest.fn() };
      const profiles = {
        findOne: async () => ({ id: 'profile', avatarUrl }),
        update: jest.fn(),
      };
      const source = {
        getRepository: (entity: unknown) =>
          entity === User ? users : profiles,
      };
      await upsertSystemUser(source as unknown as DataSource, SYSTEM_USERS[0]);
      expect(copy).not.toHaveBeenCalled();
      expect(profiles.update).toHaveBeenCalledWith(
        'profile',
        expect.objectContaining({ avatarUrl }),
      );
    },
  );

  it('uses the current Nemory PNG for a profile without an avatar', async () => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    const copy = jest
      .spyOn(fs, 'copyFileSync')
      .mockImplementation(() => undefined);
    const users = { findOne: async () => ({ id: 7 }), update: jest.fn() };
    const profiles = {
      findOne: async () => ({ id: 'profile', avatarUrl: null }),
      update: jest.fn(),
    };
    const source = {
      getRepository: (entity: unknown) => (entity === User ? users : profiles),
    };
    await upsertSystemUser(source as unknown as DataSource, SYSTEM_USERS[0]);
    expect(copy).toHaveBeenCalledTimes(1);
    expect(profiles.update).toHaveBeenCalledWith(
      'profile',
      expect.objectContaining({
        avatarUrl: '/uploads/forum/avatars/nemory.png',
      }),
    );
  });
});
