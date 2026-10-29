import 'reflect-metadata';
import { describe, expect, it, jest } from '@jest/globals';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { DataSource, EntitySchema } from 'typeorm';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { SyncUserDto } from './dto/sync-user.dto';
import { PlansService } from '../plans/plans.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { Platform } from '../common/types/platform';

const invalidTokens: [unknown][] = [
  undefined,
  null,
  '',
  ' \n\t',
  0,
  123,
  true,
  [],
  ['token'],
  {},
  { $ne: null },
].map((token) => [token]);
const payload = {
  purchaseToken: 'synthetic-purchase-token',
  devicePubKey: Buffer.alloc(32, 1).toString('base64'),
  deviceId: 'device-1',
  appVersion: '1.0',
  appBuild: '100', // Released Expo clients send this as a string.
  platform: Platform.ANDROID,
  model: 'test',
  osVersion: '15',
  osBuildId: 'test-build',
  uniqueId: null,
};

describe('NA-22 purchase-token restore validation', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: false,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });
  const metatype = Reflect.getMetadata(
    'design:paramtypes',
    UsersController.prototype,
    'syncUser',
  )[0];

  it('uses a concrete DTO at the live controller boundary', () => {
    expect(metatype).toBe(SyncUserDto);
  });

  it.each(invalidTokens)(
    'rejects malformed wire token %# before dispatch',
    async (token) => {
      const syncUser = jest.fn();
      const controller = new UsersController(
        { syncUser } as any,
        { getClientIp: () => '127.0.0.1' } as any,
      );
      const body: any = { ...payload, purchaseToken: token };
      if (token === undefined) delete body.purchaseToken;
      await expect(
        (async () => {
          const dto = await pipe.transform(body, { type: 'body', metatype });
          return controller.syncUser(dto, {} as any);
        })(),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(syncUser).not.toHaveBeenCalled();
    },
  );

  it.each([true, false])(
    'preserves valid restore metadata (deviceId present: %s)',
    async (withDeviceId) => {
      const body: any = { ...payload };
      if (!withDeviceId) delete body.deviceId;
      const dto = await pipe.transform(body, { type: 'body', metatype });
      const syncUser = jest.fn(async () => ({ accessToken: 'synthetic' }));
      const controller = new UsersController(
        { syncUser } as any,
        { getClientIp: () => '127.0.0.1' } as any,
      );
      await controller.syncUser(dto, { clientUa: 'test' } as any);
      expect(syncUser).toHaveBeenCalledWith(
        payload.purchaseToken,
        payload.devicePubKey,
        withDeviceId ? payload.deviceId : null,
        payload.appVersion,
        100,
        payload.platform,
        payload.model,
        payload.osVersion,
        payload.osBuildId,
        null,
        'test',
        '127.0.0.1',
      );
    },
  );

  it.each(invalidTokens)(
    'rejects malformed service token %# without reads/writes/session',
    async (token) => {
      const effects = jest.fn();
      const service = Object.assign(Object.create(UsersService.prototype), {
        claimFirstDeviceInstall: effects,
        subscriptionsService: {
          findStoreSubscriptionOwnerByPurchaseToken: effects,
        },
        plansService: { findExistingPlanForIap: effects },
        findById: effects,
        usersSettingsRepository: { findOne: effects, update: effects },
        authService: { loginByUUID: effects },
      });
      await expect(
        service.syncUser(
          token,
          payload.devicePubKey,
          payload.deviceId,
          payload.appVersion,
          100,
          payload.platform,
          payload.model,
          payload.osVersion,
          payload.osBuildId,
          'device-install-id',
        ),
      ).rejects.toMatchObject({ status: 400 });
      expect(effects).not.toHaveBeenCalled();
    },
  );
});

describe.each<[string, (token: string) => Promise<unknown>, string]>([
  [
    'V2',
    SubscriptionsService.prototype.findStoreSubscriptionOwnerByPurchaseToken,
    'storeSubscriptionsRepository',
  ],
  ['legacy', PlansService.prototype.findExistingPlanForIap, 'planRepository'],
])('NA-22 %s repository boundary', (_name, lookup, repositoryKey) => {
  it.each(invalidTokens)(
    'never executes an unfiltered lookup for token %#',
    async (token) => {
      const findOne = jest.fn(async () => ({ userId: 999, user: { id: 999 } }));
      await expect(
        lookup.call({ [repositoryKey]: { findOne } }, token),
      ).rejects.toMatchObject({ status: 400 });
      expect(findOne).not.toHaveBeenCalled();
    },
  );

  it('retains the token WHERE filter in the installed TypeORM SQL', async () => {
    const schema = new EntitySchema<{
      id: number;
      purchaseToken: string;
      user: { id: number };
    }>({
      name: 'RestoreLookup',
      columns: {
        id: { type: Number, primary: true },
        purchaseToken: { type: String },
      },
      relations: {
        user: { type: 'many-to-one', target: 'RestoreOwner', joinColumn: true },
      },
    });
    const owner = new EntitySchema({
      name: 'RestoreOwner',
      columns: { id: { type: Number, primary: true } },
    });
    const source = new DataSource({
      type: 'postgres',
      entities: [schema, owner],
    });
    // Metadata/query generation only: no initialize(), DB, network, or real token.
    await (source as any).buildMetadatas();
    let sql = '';
    let parameters: unknown[] = [];
    const findOne = jest.fn(async (options: any) => {
      [sql, parameters] = source
        .getRepository(schema)
        .createQueryBuilder('restore')
        .setFindOptions(options)
        .getQueryAndParameters();
      return null;
    });
    await expect(
      lookup.call({ [repositoryKey]: { findOne } }, payload.purchaseToken),
    ).resolves.toBeNull();
    expect(sql).toMatch(/WHERE.*purchaseToken.*= \$1/s);
    expect(parameters).toEqual([payload.purchaseToken]);
  });
});
