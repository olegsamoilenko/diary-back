import { describe, expect, it, jest } from '@jest/globals';
import { SubscriptionsService } from './subscriptions.service';
import { User } from '../users/entities/user.entity';
import { StoreSubscription } from './entities/store-subscription.entity';
import { UserPlanState } from './entities/user-plan-state.entity';
import { IapController } from '../iap/iap.controller';
import { Platform } from '../common/types/platform';
import {
  StoreSubscriptionProvider,
  SubscriptionAccessStatus,
  SubscriptionBasePlanId,
  SubscriptionBillingStatus,
  SubscriptionProductId,
  SubscriptionRuntime,
  SubscriptionSource,
} from './types';

const token = 'na59-synthetic-token';
const packageName = 'test.na59';
type Path = 'app' | 'rtdn';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function verified(
  order = 'GPA.fixture..0',
  expiry = '2030-11-01T00:00:00Z',
  status = SubscriptionBillingStatus.ACTIVE,
) {
  return {
    storeData: {
      platform: Platform.ANDROID,
      regionCode: 'UA',
      productId: SubscriptionProductId.NEMORY,
      basePlanId: SubscriptionBasePlanId.LITE_M1,
      purchaseToken: token,
      linkedPurchaseToken: null,
      lastOrderId: order,
      storeStatus: status,
      startTime: new Date('2030-10-01T00:00:00Z'),
      expiryTime: new Date(expiry),
      autoRenewEnabled: true,
      price: 1,
      currency: 'UAH',
    },
    googleData: {
      subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
      externalAccountIdentifiers: { obfuscatedExternalAccountId: 'na59-user' },
    },
    paymentData: {},
  };
}

// Real service methods and independent instances; this fixture models atomic
// transactions/row revisions. PostgreSQL locking itself has a separate test.
function fixture(missing = false) {
  let revision = 1;
  let inTransaction = false;
  const user = {
    id: 167,
    uuid: 'na59-user',
    subscriptionRuntime: SubscriptionRuntime.V2,
    usesWithoutSubscription: false,
  };
  let store: any = missing
    ? null
    : {
        ...verified().storeData,
        id: 901,
        userId: user.id,
        provider: StoreSubscriptionProvider.GOOGLE_PLAY,
      };
  let state: any = missing
    ? null
    : {
        id: 10,
        userId: user.id,
        currentStoreSubscriptionId: 901,
        source: SubscriptionSource.GOOGLE_PLAY,
        basePlanId: SubscriptionBasePlanId.LITE_M1,
        billingStatus: SubscriptionBillingStatus.ACTIVE,
        accessStatus: SubscriptionAccessStatus.ACTIVE,
        expiryTime: store.expiryTime,
        usedCredits: 50,
        inputUsedCredits: 30,
        outputUsedCredits: 20,
        creditsLimit: 40000,
        metadata: {},
      };
  const revisionRows = () =>
    store ? [{ id: String(store.id), revision: String(revision) }] : [];
  const save = jest.fn(async (entity: unknown, value: any) => {
    if (entity === StoreSubscription) {
      store = structuredClone(value);
      revision++;
    }
    if (entity === UserPlanState) state = structuredClone(value);
    return value;
  });
  const manager = {
    query: jest.fn(async (sql: string) =>
      sql.includes('xmin') ? revisionRows() : [],
    ),
    findOne: jest.fn(async (entity: unknown, options: any) => {
      if (entity === User) return structuredClone(user);
      if (entity === StoreSubscription) return structuredClone(store);
      if (entity === UserPlanState)
        return state?.userId === options.where.userId
          ? structuredClone(state)
          : null;
      throw new Error('Unexpected entity');
    }),
    merge: (_entity: unknown, target: any, value: any) =>
      Object.assign(target, value),
    create: (entity: unknown, value: any) => ({
      id: entity === StoreSubscription ? 901 : 10,
      ...value,
    }),
    save,
    update: jest.fn(async () => ({ affected: 1 })),
  };
  let queue = Promise.resolve();
  const dataSource = {
    query: jest.fn(async () => revisionRows()),
    transaction: jest.fn((work: (m: typeof manager) => Promise<any>) => {
      const result = queue.then(async () => {
        const backup = structuredClone({ store, state, revision });
        inTransaction = true;
        try {
          return await work(manager);
        } catch (error) {
          ({ store, state, revision } = backup);
          throw error;
        } finally {
          inTransaction = false;
        }
      });
      queue = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    }),
  };
  const finance = { enqueue: jest.fn(async () => undefined) };
  function client() {
    const response = jest.fn<() => Promise<ReturnType<typeof verified>>>();
    const google = {
      verifyAndroidSubscription: jest.fn(async () => {
        expect(inTransaction).toBe(false);
        return response();
      }),
    };
    const events = { info: jest.fn(), conflict: jest.fn(), warning: jest.fn() };
    const service = new SubscriptionsService(
      dataSource as any,
      {} as any,
      {} as any,
      { findOne: async () => structuredClone(store) } as any,
      google as any,
      events as any,
      {} as any,
      undefined,
      finance as any,
    );
    const run = (path: Path) =>
      path === 'app'
        ? service.subscribeGooglePlay(user.id, {
            packageName,
            purchaseToken: token,
          } as any)
        : service.handleGooglePlayPubSub(packageName, token, 2);
    return { response, run, service };
  }
  return {
    client,
    save,
    finance,
    manager,
    dataSource,
    get store() {
      return store;
    },
    get state() {
      return state;
    },
    spend() {
      Object.assign(state, {
        usedCredits: 123,
        inputUsedCredits: 80,
        outputUsedCredits: 43,
      });
    },
    transfer() {
      store.userId = 999;
      state.userId = 999;
      revision++;
    },
  };
}

describe('NA-59 Google Play concurrent verification', () => {
  it.each(['legacy', 'v2', 'after-v2-commit'])(
    'NA-13 redelivery after %s failure preserves the renewed cycle and later usage',
    async (failure) => {
      const f = fixture();
      const c = f.client();
      const renewal = verified('GPA.fixture..1', '2030-12-01T00:00:00Z');
      c.response.mockResolvedValue(renewal);
      // Exercise the actual legacy mirror boundary, with stale zero usage.
      const legacy = jest.fn(async () => {
        await c.service.syncLegacyPlanToUserPlanState(
          167,
          {
            id: 58,
            userId: 167,
            actual: true,
            usedCredits: 0,
            lastOrderId: 'GPA.fixture..0',
          } as any,
          new Date(),
          undefined,
          { preserveV2State: true },
        );
      });
      if (failure === 'legacy')
        legacy.mockRejectedValueOnce(new Error('DB unavailable'));
      if (failure === 'v2')
        c.response.mockRejectedValueOnce(new Error('Google unavailable'));
      const v2 = jest.fn(async () => {
        await c.run('rtdn');
      });
      if (failure === 'after-v2-commit')
        v2.mockImplementationOnce(async () => {
          await c.run('rtdn');
          throw new Error('Response lost after commit');
        });
      const controller = new IapController(
        { pubSubAndroid: legacy } as any,
        { handleGooglePlayPubSub: v2 } as any,
      );
      const envelope = {
        message: {
          messageId: 'na13-repeat',
          publishTime: '2026-10-29T12:00:00Z',
          data: Buffer.from(
            JSON.stringify({
              packageName,
              subscriptionNotification: {
                purchaseToken: token,
                notificationType: 2,
              },
            }),
          ).toString('base64'),
        },
      };
      await expect(controller.handle(envelope)).rejects.toMatchObject({
        status: 503,
      });
      expect(legacy).toHaveBeenCalledTimes(1);
      expect(v2).toHaveBeenCalledTimes(1);
      if (failure === 'v2') {
        expect(f.state.usedCredits).toBe(50);
        expect(f.store.lastOrderId).toBe('GPA.fixture..0');
        await expect(controller.handle(envelope)).resolves.toBe('ok');
      }
      expect(f.state.usedCredits).toBe(0);
      const renewedLimit = f.state.creditsLimit;
      f.spend();
      await expect(controller.handle(envelope)).resolves.toBe('ok');
      await expect(controller.handle(envelope)).resolves.toBe('ok');
      expect(f.store.lastOrderId).toBe('GPA.fixture..1');
      expect(f.state).toMatchObject({
        usedCredits: 123,
        inputUsedCredits: 80,
        outputUsedCredits: 43,
        creditsLimit: renewedLimit,
      });
      expect(f.state.currentStoreSubscriptionId).toBe(901);
    },
  );
  const paths: [Path, Path][] = [
    ['rtdn', 'rtdn'],
    ['app', 'app'],
    ['app', 'rtdn'],
    ['rtdn', 'app'],
  ];
  it.each(paths)(
    'delayed %s cannot roll back %s renewal or erase subsequent usage',
    async (slowPath, fastPath) => {
      const f = fixture();
      const slow = f.client();
      const fast = f.client();
      const started = deferred<void>();
      const oldReply = deferred<ReturnType<typeof verified>>();
      const latest = verified('GPA.fixture..1', '2030-12-01T00:00:00Z');
      slow.response
        .mockImplementationOnce(() => {
          started.resolve();
          return oldReply.promise;
        })
        .mockResolvedValue(latest);
      fast.response.mockResolvedValue(latest);
      const pending = slow.run(slowPath);
      await started.promise;
      await fast.run(fastPath);
      expect(f.state.usedCredits).toBe(0);
      f.spend();
      oldReply.resolve(verified());
      await pending;
      expect(f.store.lastOrderId).toBe('GPA.fixture..1');
      expect(f.state.expiryTime).toEqual(latest.storeData.expiryTime);
      expect(f.state).toMatchObject({
        usedCredits: 123,
        inputUsedCredits: 80,
        outputUsedCredits: 43,
      });
      expect(slow.response).toHaveBeenCalledTimes(2);
      expect(fast.response).toHaveBeenCalledTimes(1);
      expect(f.finance.enqueue).toHaveBeenCalledTimes(2);
      expect(
        f.save.mock.calls.filter(([entity]) => entity === StoreSubscription),
      ).toHaveLength(2);
    },
  );

  it.each(paths)(
    'parallel first purchase via %s and %s creates one cycle',
    async (slowPath, fastPath) => {
      const f = fixture(true);
      const slow = f.client();
      const fast = f.client();
      const started = deferred<void>();
      const reply = deferred<ReturnType<typeof verified>>();
      slow.response
        .mockImplementationOnce(() => {
          started.resolve();
          return reply.promise;
        })
        .mockResolvedValue(verified());
      fast.response.mockResolvedValue(verified());
      const pending = slow.run(slowPath);
      await started.promise;
      await fast.run(fastPath);
      f.spend();
      reply.resolve(verified());
      await pending;
      expect(f.state).toMatchObject({
        currentStoreSubscriptionId: 901,
        usedCredits: 123,
      });
      expect(slow.response).toHaveBeenCalledTimes(2);
      expect(f.finance.enqueue).toHaveBeenCalledTimes(2);
    },
  );

  it.each<Path>(['app', 'rtdn'])(
    'ordinary %s recheck keeps usage with one Google call',
    async (path) => {
      const f = fixture();
      f.spend();
      const c = f.client();
      c.response.mockResolvedValue(verified());
      await c.run(path);
      expect(f.state.usedCredits).toBe(123);
      expect(c.response).toHaveBeenCalledTimes(1);
    },
  );

  it.each<Path>(['app', 'rtdn'])(
    'delayed active %s response cannot undo revocation with shorter expiry',
    async (path) => {
      const f = fixture();
      const slow = f.client();
      const fast = f.client();
      const started = deferred<void>();
      const reply = deferred<ReturnType<typeof verified>>();
      const revoked = verified(
        'GPA.fixture..0',
        '2020-01-01T00:00:00Z',
        SubscriptionBillingStatus.EXPIRED,
      );
      slow.response
        .mockImplementationOnce(() => {
          started.resolve();
          return reply.promise;
        })
        .mockResolvedValue(revoked);
      fast.response.mockResolvedValue(revoked);
      const pending = slow.run(path);
      await started.promise;
      await fast.run('rtdn');
      reply.resolve(verified());
      await pending;
      expect(f.store.storeStatus).toBe(SubscriptionBillingStatus.EXPIRED);
      expect(f.state.expiryTime).toEqual(revoked.storeData.expiryTime);
      expect(f.state.accessStatus).not.toBe(SubscriptionAccessStatus.ACTIVE);
      expect(f.state.usedCredits).toBe(50);
    },
  );

  it('fails without overwriting renewed state if Google fails during re-verification', async () => {
    const f = fixture();
    const slow = f.client();
    const fast = f.client();
    const started = deferred<void>();
    const reply = deferred<ReturnType<typeof verified>>();
    slow.response
      .mockImplementationOnce(() => {
        started.resolve();
        return reply.promise;
      })
      .mockRejectedValue(new Error('Google offline'));
    fast.response.mockResolvedValue(
      verified('GPA.fixture..1', '2030-12-01T00:00:00Z'),
    );
    const pending = slow.run('app');
    await started.promise;
    await fast.run('rtdn');
    f.spend();
    reply.resolve(verified());
    await expect(pending).rejects.toThrow('Google offline');
    expect(f.store.lastOrderId).toBe('GPA.fixture..1');
    expect(f.state.usedCredits).toBe(123);
    expect(f.finance.enqueue).toHaveBeenCalledTimes(1);
    expect(slow.response).toHaveBeenCalledTimes(2);
  });

  it('retains ownership checks after a concurrent token transfer', async () => {
    const f = fixture();
    const c = f.client();
    c.response
      .mockImplementationOnce(async () => {
        f.transfer();
        return verified();
      })
      .mockResolvedValue(verified());
    await expect(c.run('app')).rejects.toThrow();
    expect(f.store.userId).toBe(999);
    expect(f.state.userId).toBe(999);
    expect(c.response).toHaveBeenCalledTimes(2);
    expect(f.finance.enqueue).not.toHaveBeenCalled();
  });
});
