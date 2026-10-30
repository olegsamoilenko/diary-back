import 'reflect-metadata';
import {
  beforeAll,
  afterAll,
  beforeEach,
  describe,
  it,
  expect,
} from '@jest/globals';
import { execFileSync } from 'child_process';
import { randomUUID } from 'crypto';
import { Client } from 'pg';
import { DataSource, EntitySchema, getMetadataArgsStorage } from 'typeorm';
import nacl from 'tweetnacl';
import { UserSession } from '../auth/entities/user-session.entity';
import { UserPushToken } from './entities/user-push-token.entity';
import { PushDeviceState } from './entities/push-device-state.entity';
import { saveOwnedPushToken, revokePushDevice } from './push-token-ownership';
import { AddPushDeviceOwnership1793280000000 } from '../migrations/1793280000000-AddPushDeviceOwnership';

const container = process.env.NA15_POSTGRES_CONTAINER;
(container ? describe : describe.skip)(
  'NA15 push ownership on isolated PostgreSQL',
  () => {
    const schema = `na15_${randomUUID().replace(/-/g, '')}`;
    let admin: Client, a: DataSource, b: DataSource;
    const key = nacl.sign.keyPair.fromSeed(new Uint8Array(32).fill(15));
    const otherKey = nacl.sign.keyPair.fromSeed(new Uint8Array(32).fill(16));
    const publicKey = Buffer.from(key.publicKey).toString('base64');
    const token = 'ExponentPushToken[na15-local-fixture]';
    const definition = (target: any, tableName: string) =>
      new EntitySchema({
        name: target.name,
        target,
        tableName,
        columns: Object.fromEntries(
          getMetadataArgsStorage()
            .columns.filter((c) => c.target === target)
            .map((c) => [
              c.propertyName,
              {
                name: c.options.name,
                length: c.options.length,
                nullable: c.options.nullable,
                type:
                  c.options.type ??
                  Reflect.getMetadata(
                    'design:type',
                    target.prototype,
                    c.propertyName,
                  ),
                default:
                  target === UserPushToken && c.propertyName === 'id'
                    ? () => 'gen_random_uuid()'
                    : c.options.default,
                ...(c.propertyName === 'id' || c.propertyName === 'keyHash'
                  ? { primary: true }
                  : {}),
                ...(c.mode === 'createDate' ? { createDate: true } : {}),
                ...(c.mode === 'updateDate' ? { updateDate: true } : {}),
              },
            ]),
        ),
      });
    beforeAll(async () => {
      if (!/^[a-zA-Z0-9_.-]+$/.test(container!))
        throw new Error('Invalid local fixture');
      const [username, password] = execFileSync(
        'docker',
        ['exec', container!, 'printenv', 'POSTGRES_USER', 'POSTGRES_PASSWORD'],
        { encoding: 'utf8', timeout: 10000 },
      )
        .trimEnd()
        .split(/\r?\n/);
      const port = Number(
        execFileSync('docker', ['port', container!, '5432/tcp'], {
          encoding: 'utf8',
          timeout: 10000,
        })
          .split(/\r?\n/)[0]
          .split(':')
          .pop(),
      );
      admin = new Client({
        host: '127.0.0.1',
        port,
        user: username,
        password,
        database: 'postgres',
      });
      await admin.connect();
      await admin.query(`CREATE SCHEMA "${schema}"`);
      const config = {
        type: 'postgres' as const,
        host: '127.0.0.1',
        port,
        username,
        password,
        database: 'postgres',
        schema,
        installExtensions: false,
        entities: [
          definition(UserSession, 'user_sessions'),
          definition(UserPushToken, 'user_push_tokens'),
          definition(PushDeviceState, 'push_device_states'),
        ],
        extra: {
          max: 3,
          options: `-c search_path=${schema} -c statement_timeout=10000`,
        },
      };
      a = await new DataSource(config).initialize();
      await a.synchronize();
      b = await new DataSource(config).initialize();
    }, 30000);
    afterAll(async () => {
      await Promise.allSettled([
        a?.isInitialized ? a.destroy() : null,
        b?.isInitialized ? b.destroy() : null,
      ]);
      if (admin) {
        try {
          await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        } finally {
          await admin.end();
        }
      }
    });
    beforeEach(async () => {
      await a.query(
        'TRUNCATE user_push_tokens, push_device_states, user_sessions',
      );
      for (const userId of [1, 2])
        await a.getRepository(UserSession).save({
          id: userId,
          userId,
          deviceId: 'installation',
          refreshTokenHash: 'unused-fixture',
          devicePubKey: publicKey,
          deviceKeyAlg: 'ed25519',
          refreshTokenHistory: [],
        });
    });
    function registration(
      userId: number,
      revision: number,
      tokenValue = token,
      signingKey = key,
      deviceId = 'installation',
    ) {
      const payload = [
        'push-register-v1',
        userId,
        deviceId,
        revision,
        tokenValue,
        'android',
        'app',
        'uk',
      ];
      return {
        token: tokenValue,
        platform: 'android' as const,
        scope: 'app',
        locale: 'uk',
        ownership: {
          userId,
          deviceId,
          revision,
          publicKey: Buffer.from(signingKey.publicKey).toString('base64'),
          signature: Buffer.from(
            nacl.sign.detached(
              Buffer.from(JSON.stringify(payload)),
              signingKey.secretKey,
            ),
          ).toString('base64'),
        },
      };
    }
    function revocation(userId: number, revision: number, signingKey = key) {
      const payload = [
        'push-revoke-v1',
        userId,
        'installation',
        revision,
        token,
      ];
      return {
        token,
        ownership: {
          userId,
          deviceId: 'installation',
          revision,
          publicKey: Buffer.from(signingKey.publicKey).toString('base64'),
          signature: Buffer.from(
            nacl.sign.detached(
              Buffer.from(JSON.stringify(payload)),
              signingKey.secretKey,
            ),
          ).toString('base64'),
        },
      };
    }
    const register = (
      userId: number,
      dto: ReturnType<typeof registration>,
      db = a,
    ) => db.transaction((m) => saveOwnedPushToken(m, userId, dto));
    const revoke = (dto: ReturnType<typeof revocation>, db = a) =>
      db.transaction((m) => revokePushDevice(m, dto));
    const active = () =>
      a.getRepository(UserPushToken).findBy({ isActive: true });

    it('transfers one token A to B and leaves the other device active', async () => {
      await a.getRepository(UserSession).save({
        id: 3,
        userId: 1,
        deviceId: 'other',
        refreshTokenHash: 'unused',
        devicePubKey: Buffer.from(otherKey.publicKey).toString('base64'),
      });
      await register(1, registration(1, 1));
      await register(
        1,
        registration(1, 1, 'ExponentPushToken[other]', otherKey, 'other'),
      );
      await register(2, registration(2, 2));
      expect((await active()).map((row) => [row.userId, row.token])).toEqual(
        expect.arrayContaining([
          [2, token],
          [1, 'ExponentPushToken[other]'],
        ]),
      );
      expect(await active()).toHaveLength(2);
    });
    it('serializes concurrent requests on separate connections; newest revision wins', async () => {
      await Promise.all([
        register(2, registration(2, 10)),
        register(1, registration(1, 9), b),
      ]);
      expect((await active()).map((row) => row.userId)).toEqual([2]);
    });
    it('logout before a delayed first registration blocks that registration', async () => {
      await revoke(revocation(1, 2));
      expect(await register(1, registration(1, 1))).toEqual({
        success: false,
        stale: true,
      });
      expect(await active()).toHaveLength(0);
    });
    it('late old revoke cannot disable the new account', async () => {
      await register(1, registration(1, 1));
      await register(2, registration(2, 3));
      expect(await revoke(revocation(1, 2))).toEqual({
        success: false,
        stale: true,
      });
      expect((await active()).map((row) => row.userId)).toEqual([2]);
    });
    it('offline revoke still works after session deletion; replay is idempotent', async () => {
      await register(1, registration(1, 1));
      await a.getRepository(UserSession).delete({ userId: 1 });
      expect(await revoke(revocation(1, 2))).toEqual({ success: true });
      expect((await revoke(revocation(1, 2))).success).toBe(true);
      expect(await active()).toHaveLength(0);
    });
    it('rejects signature forgery, unknown key and JWT owner substitution', async () => {
      const invalid = registration(1, 1);
      invalid.ownership.signature = Buffer.alloc(64).toString('base64');
      await expect(register(1, invalid)).rejects.toThrow(
        'Invalid push ownership',
      );
      await expect(
        register(1, registration(1, 1, token, otherKey)),
      ).rejects.toThrow('Unknown push device');
      await expect(register(2, registration(1, 1))).rejects.toThrow(
        'Push owner mismatch',
      );
      expect((await revoke(revocation(1, 99, otherKey))).success).toBe(true);
      expect(await a.getRepository(PushDeviceState).count()).toBe(0);
    });
    it('a first revoke after session removal is a harmless no-op and cannot block the new login', async () => {
      await a.getRepository(UserSession).delete({ userId: 1 });
      expect((await revoke(revocation(1, 2))).success).toBe(true);
      expect(await a.getRepository(PushDeviceState).count()).toBe(0);
      await expect(register(1, registration(1, 1))).rejects.toThrow(
        'Unknown push device',
      );
      await register(2, registration(2, 3));
      expect((await active()).map((row) => row.userId)).toEqual([2]);
    });
    it('rejects token tampering and same-revision different payload, permits exact retry', async () => {
      const dto = registration(1, 1);
      dto.token = 'ExponentPushToken[tampered]';
      await expect(register(1, dto)).rejects.toThrow('Invalid push ownership');
      await register(1, registration(1, 1));
      expect((await register(1, registration(1, 1))).success).toBe(true);
      expect((await revoke(revocation(1, 1))).success).toBe(false);
      expect(await active()).toHaveLength(1);
    });
    it('rotating Expo token deactivates old token for the installation', async () => {
      await register(1, registration(1, 1));
      await register(1, registration(1, 2, 'ExponentPushToken[rotated]'));
      expect((await active()).map((row) => row.token)).toEqual([
        'ExponentPushToken[rotated]',
      ]);
    });
    it('legacy contract remains valid and concurrent legacy transfer leaves one active owner', async () => {
      const dto = { token, platform: 'android' as const };
      await Promise.all([
        a.transaction((m) => saveOwnedPushToken(m, 1, dto)),
        b.transaction((m) => saveOwnedPushToken(m, 2, dto)),
      ]);
      expect(await active()).toHaveLength(1);
    });
    it('upgrade revoke detaches only the old owner of a legacy token', async () => {
      await a.transaction((m) =>
        saveOwnedPushToken(m, 1, { token, platform: 'android' }),
      );
      await revoke(revocation(1, 1));
      expect(await active()).toHaveLength(0);
    });
    it('a device with a saved state cannot revoke another users legacy token', async () => {
      await register(1, registration(1, 1, 'ExponentPushToken[own]'));
      await a.transaction((m) =>
        saveOwnedPushToken(m, 99, { token, platform: 'android' }),
      );
      await revoke(revocation(99, 2));
      expect((await active()).map((row) => row.userId)).toEqual([99]);
    });
    it('migration disables ambiguous historic owners and preserves unambiguous devices', async () => {
      await a.getRepository(UserPushToken).save([
        { userId: 1, token, platform: 'android' },
        { userId: 2, token, platform: 'android' },
        { userId: 1, token: 'other', platform: 'android' },
      ]);
      const runner = a.createQueryRunner();
      try {
        await new AddPushDeviceOwnership1793280000000().up(runner);
      } finally {
        await runner.release();
      }
      expect((await active()).map((row) => row.token)).toEqual(['other']);
    });
  },
);
