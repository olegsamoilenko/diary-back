import 'reflect-metadata';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { DataSource, EntitySchema, getMetadataArgsStorage } from 'typeorm';
import { PlansService } from '../plans/plans.service';
import { Plan } from '../plans/entities/plan.entity';
import { User } from '../users/entities/user.entity';
import { AiModel } from '../users/types';
import {
  BasePlanIds,
  Plans,
  PlanStatus,
  SubscriptionIds,
} from '../plans/types';
import { Platform } from '../common/types/platform';
import { tokensToCredits } from '../plans/utils/tokensToCredits';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionLegacyMapper } from './subscription-legacy.mapper';
import { SubscriptionUsageService } from './subscription-usage.service';
import { StoreSubscription } from './entities/store-subscription.entity';
import { UserPlanState } from './entities/user-plan-state.entity';
import { SubscriptionRuntime } from './types';

const container = process.env.NA34_POSTGRES_CONTAINER;
const pgDescribe = container ? describe : describe.skip;
function gate() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

// Reuse real entity columns with a minimal relation graph, so the real TypeORM
// queries/services run without bootstrapping unrelated application entities.
function schemaFor(
  target: typeof Plan | typeof StoreSubscription | typeof UserPlanState,
) {
  const columns = Object.fromEntries(
    getMetadataArgsStorage()
      .columns.filter((column) => column.target === target)
      .map((column) => [
        column.propertyName,
        {
          ...column.options,
          type:
            column.propertyName === 'userId'
              ? Number
              : (column.options.type ??
                Reflect.getMetadata(
                  'design:type',
                  target.prototype,
                  column.propertyName,
                )),
          ...(column.propertyName === 'id'
            ? { primary: true, generated: 'increment' }
            : {}),
          ...(column.mode === 'createDate' ? { createDate: true } : {}),
          ...(column.mode === 'updateDate' ? { updateDate: true } : {}),
        },
      ]),
  );
  const tableName = getMetadataArgsStorage().tables.find(
    (table) => table.target === target,
  )!.name;
  return new EntitySchema({
    name: target.name,
    target,
    tableName,
    columns,
    ...(target === Plan
      ? {
          relations: {
            user: {
              type: 'many-to-one',
              target: 'User',
              joinColumn: { name: 'userId' },
            },
          },
        }
      : {}),
  } as any);
}

pgDescribe('NA-34 real PostgreSQL + TypeORM legacy debit', () => {
  const schema = `na34_${randomUUID().replace(/-/g, '')}`;
  let admin: Client;
  let dbA: DataSource;
  let dbB: DataSource;
  let onSecondUserLock: (() => void) | undefined;
  let failSaveOf: typeof Plan | typeof UserPlanState | undefined;
  function client(db: DataSource) {
    const subscriptions = new SubscriptionsService(
      db,
      db.getRepository(Plan),
      db.getRepository(UserPlanState),
      db.getRepository(StoreSubscription),
      {} as any,
      {} as any,
      new SubscriptionLegacyMapper(),
    );
    const plans = new PlansService(
      db.getRepository(Plan),
      db,
      {} as any,
      { info: jest.fn(), warning: jest.fn(), conflict: jest.fn() } as any,
      subscriptions,
    );
    const usage = new SubscriptionUsageService(
      db,
      db.getRepository(User),
      plans,
      subscriptions,
    );
    return { subscriptions, plans, usage };
  }
  let a: ReturnType<typeof client>;
  let b: ReturnType<typeof client>;

  beforeAll(async () => {
    if (!/^[a-zA-Z0-9_.-]+$/.test(container!))
      throw new Error('Invalid local test container');
    // Only local maintenance DB, credentials remain in memory; no app .env.
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
    if (!port || !username || !password)
      throw new Error('Local PostgreSQL fixture unavailable');
    admin = new Client({
      host: '127.0.0.1',
      port,
      user: username,
      password,
      database: 'postgres',
    });
    await admin.connect();
    await admin.query(`CREATE SCHEMA "${schema}"`);
    const entities = [
      new EntitySchema({
        name: 'User',
        target: User,
        tableName: 'users',
        columns: {
          id: { type: Number, primary: true },
          subscriptionRuntime: { type: String },
          usesWithoutSubscription: { type: Boolean, default: false },
        },
      }),
      schemaFor(Plan),
      schemaFor(StoreSubscription),
      schemaFor(UserPlanState),
    ];
    const config = {
      type: 'postgres' as const,
      host: '127.0.0.1',
      port,
      username,
      password,
      database: 'postgres',
      schema,
      entities,
      extra: { max: 3, options: '-c statement_timeout=10000' },
    };
    dbA = new DataSource(config);
    dbB = new DataSource({
      ...config,
      logging: ['query'],
      logger: {
        logQuery(sql: string) {
          if (sql.includes('"users"') && sql.includes('FOR UPDATE'))
            onSecondUserLock?.();
        },
        logQueryError() {},
        logQuerySlow() {},
        logSchemaBuild() {},
        logMigration() {},
        log() {},
      },
    });
    await dbA.initialize();
    await dbA.synchronize();
    await dbB.initialize();
    // TypeORM subscriber throws on a real SQL write, exercising actual rollback.
    dbA.subscribers.push({
      beforeUpdate(event) {
        if (event.metadata.target === failSaveOf)
          throw new Error('NA34 injected save failure');
      },
    });
    a = client(dbA);
    b = client(dbB);
  }, 30000);

  afterAll(async () => {
    await Promise.allSettled([
      dbA?.isInitialized ? dbA.destroy() : undefined,
      dbB?.isInitialized ? dbB.destroy() : undefined,
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
    jest.restoreAllMocks();
    failSaveOf = undefined;
    onSecondUserLock = undefined;
    await admin.query(
      `TRUNCATE "${schema}".plans, "${schema}".users, "${schema}".store_subscriptions, "${schema}".user_plan_states RESTART IDENTITY CASCADE`,
    );
    await dbA.getRepository(User).save({
      id: 167,
      subscriptionRuntime: SubscriptionRuntime.LEGACY_COMPAT,
      usesWithoutSubscription: false,
    });
    const plan = await dbA.getRepository(Plan).save({
      userId: 167,
      platform: Platform.ANDROID,
      subscriptionId: SubscriptionIds.NEMORY,
      basePlanId: BasePlanIds.LITE_M1,
      name: 'Lite' as Plans,
      price: 1,
      currency: 'UAH',
      creditsLimit: 40000,
      usedCredits: 100,
      inputUsedCredits: 40,
      outputUsedCredits: 60,
      purchaseToken: 'na34-fixture',
      lastOrderId: 'GPA.fixture',
      actual: true,
      planStatus: PlanStatus.ACTIVE,
      startTime: new Date('2026-01-01'),
      expiryTime: new Date('2030-01-01'),
      autoRenewEnabled: true,
    });
    await a.subscriptions.syncLegacyPlanToUserPlanState(167, plan);
  });

  async function balances() {
    const plan = await dbA.getRepository(Plan).findOneByOrFail({ userId: 167 });
    const state = await dbA
      .getRepository(UserPlanState)
      .findOneByOrFail({ userId: 167 });
    const counters = (value: Plan | UserPlanState) => ({
      used: value.usedCredits,
      input: value.inputUsedCredits,
      output: value.outputUsedCredits,
    });
    return { plan: counters(plan), state: counters(state) };
  }

  it('keeps 100 + 30 + 70 = 200 in both tables when two workers overlap at the mirror', async () => {
    const enteredMirror = gate();
    const releaseMirror = gate();
    const secondLockRequested = gate();
    const original = a.subscriptions.syncLegacyPlanToUserPlanState.bind(
      a.subscriptions,
    );
    jest
      .spyOn(a.subscriptions, 'syncLegacyPlanToUserPlanState')
      .mockImplementationOnce(async (...args) => {
        enteredMirror.resolve();
        await releaseMirror.promise;
        return original(...args);
      });
    // GPT_5_MINI 2,500 input / 20,000 output credits per million tokens.
    expect(tokensToCredits(AiModel.GPT_5_MINI, 4000, 1000)).toEqual({
      inputUsedCredits: 10,
      outputUsedCredits: 20,
    });
    expect(tokensToCredits(AiModel.GPT_5_MINI, 12000, 2000)).toEqual({
      inputUsedCredits: 30,
      outputUsedCredits: 40,
    });
    const first = a.usage.recordAiUsage(167, AiModel.GPT_5_MINI, 4000, 1000);
    await enteredMirror.promise;
    onSecondUserLock = secondLockRequested.resolve;
    const second = b.usage.recordAiUsage(167, AiModel.GPT_5_MINI, 12000, 2000);
    try {
      await secondLockRequested.promise;
      expect(await balances()).toEqual({
        plan: { used: 100, input: 40, output: 60 },
        state: { used: 100, input: 40, output: 60 },
      });
    } finally {
      releaseMirror.resolve();
    }
    const results = await Promise.all([first, second]);
    expect(results.map((r) => r.runtime)).toEqual([
      SubscriptionRuntime.LEGACY_COMPAT,
      SubscriptionRuntime.LEGACY_COMPAT,
    ]);
    expect(await balances()).toEqual({
      plan: { used: 200, input: 80, output: 120 },
      state: { used: 200, input: 80, output: 120 },
    });
  }, 15000);

  it.each([Plan, UserPlanState])(
    'rolls back debit and mirror on %p save failure; later debit succeeds once',
    async (entity) => {
      failSaveOf = entity;
      await expect(
        a.usage.recordAiUsage(167, AiModel.GPT_5_MINI, 4000, 1000),
      ).rejects.toThrow();
      expect(await balances()).toEqual({
        plan: { used: 100, input: 40, output: 60 },
        state: { used: 100, input: 40, output: 60 },
      });
      failSaveOf = undefined;
      await b.usage.recordAiUsage(167, AiModel.GPT_5_MINI, 4000, 1000);
      expect(await balances()).toEqual({
        plan: { used: 130, input: 50, output: 80 },
        state: { used: 130, input: 50, output: 80 },
      });
    },
  );

  it('preserves cache/image pricing and sequential LEGACY -> V2 routing without a second debit', async () => {
    const args = [
      AiModel.GPT_IMAGE_2_5_FLARE,
      10000,
      1000,
      2000,
      1000,
      3000,
    ] as const;
    const cost = tokensToCredits(...args);
    await a.usage.recordAiUsage(
      167,
      args[0],
      args[1],
      args[2],
      args[3],
      args[4],
      undefined,
      args[5],
    );
    const legacy = await balances();
    expect(legacy.plan.used).toBe(
      100 + cost.inputUsedCredits + cost.outputUsedCredits,
    );
    expect(legacy.state).toEqual(legacy.plan);
    await dbA
      .getRepository(User)
      .update(167, { subscriptionRuntime: SubscriptionRuntime.V2 });
    await b.usage.recordAiUsage(167, AiModel.GPT_5_MINI, 4000, 1000);
    const after = await balances();
    expect(after.plan).toEqual(legacy.plan);
    expect(after.state.used).toBe(legacy.state.used + 30);
  });

  it('standalone calculateCredits still serializes concurrent callers', async () => {
    await Promise.all([
      a.plans.calculateCredits(167, AiModel.GPT_5_MINI, 4000, 1000),
      b.plans.calculateCredits(167, AiModel.GPT_5_MINI, 12000, 2000),
    ]);
    expect((await balances()).plan).toEqual({
      used: 200,
      input: 80,
      output: 120,
    });
  });

  it('NA-13 concurrent duplicate renewal preserves the debit after the first delivery', async () => {
    const plan = await dbA.getRepository(Plan).findOneByOrFail({ userId: 167 });
    const options = {
      restoreActual: true,
      resetUsedCredits: true,
      lastOrderId: 'GPA.renewal',
    };
    await a.plans.updatePlanFromGooglePubSub(plan.id, 167, {}, options);
    await a.usage.recordAiUsage(167, AiModel.GPT_5_MINI, 4000, 1000);
    await Promise.all([
      a.plans.updatePlanFromGooglePubSub(plan.id, 167, {}, options),
      b.plans.updatePlanFromGooglePubSub(plan.id, 167, {}, options),
    ]);
    expect(await balances()).toEqual({
      plan: { used: 30, input: 10, output: 20 },
      state: { used: 30, input: 10, output: 20 },
    });
  });

  it('NA-13 failed legacy mirror rolls renewal back and redelivery resets only once', async () => {
    const plan = await dbA.getRepository(Plan).findOneByOrFail({ userId: 167 });
    const options = {
      restoreActual: true,
      resetUsedCredits: true,
      lastOrderId: 'GPA.renewal',
    };
    failSaveOf = UserPlanState;
    await expect(
      a.plans.updatePlanFromGooglePubSub(plan.id, 167, {}, options),
    ).rejects.toThrow();
    expect(
      (await dbA.getRepository(Plan).findOneByOrFail({ id: plan.id }))
        .lastOrderId,
    ).toBe('GPA.fixture');
    expect(await balances()).toEqual({
      plan: { used: 100, input: 40, output: 60 },
      state: { used: 100, input: 40, output: 60 },
    });
    failSaveOf = undefined;
    await a.plans.updatePlanFromGooglePubSub(plan.id, 167, {}, options);
    await a.usage.recordAiUsage(167, AiModel.GPT_5_MINI, 4000, 1000);
    await b.plans.updatePlanFromGooglePubSub(plan.id, 167, {}, options);
    expect(await balances()).toEqual({
      plan: { used: 30, input: 10, output: 20 },
      state: { used: 30, input: 10, output: 20 },
    });
  });

  it('NA-13 legacy replay cannot overwrite the live V2 store/counters', async () => {
    const plan = await dbA.getRepository(Plan).findOneByOrFail({ userId: 167 });
    await dbA
      .getRepository(User)
      .update(167, { subscriptionRuntime: SubscriptionRuntime.V2 });
    await dbA
      .getRepository(UserPlanState)
      .update(
        { userId: 167 },
        { usedCredits: 123, inputUsedCredits: 80, outputUsedCredits: 43 },
      );
    await dbA
      .getRepository(StoreSubscription)
      .update({ userId: 167 }, { lastOrderId: 'GPA.v2-renewal' });
    await a.plans.updatePlanFromGooglePubSub(
      plan.id,
      167,
      {},
      {
        restoreActual: true,
        resetUsedCredits: false,
        lastOrderId: 'GPA.fixture',
      },
    );
    expect((await balances()).state).toEqual({
      used: 123,
      input: 80,
      output: 43,
    });
    expect(
      (
        await dbA
          .getRepository(StoreSubscription)
          .findOneByOrFail({ userId: 167 })
      ).lastOrderId,
    ).toBe('GPA.v2-renewal');
  });

  it('uses compatible lock order when an RTDN plan update overlaps a debit', async () => {
    const enteredMirror = gate();
    const releaseMirror = gate();
    const secondLockRequested = gate();
    const original = a.subscriptions.syncLegacyPlanToUserPlanState.bind(
      a.subscriptions,
    );
    jest
      .spyOn(a.subscriptions, 'syncLegacyPlanToUserPlanState')
      .mockImplementationOnce(async (...args) => {
        enteredMirror.resolve();
        await releaseMirror.promise;
        return original(...args);
      });
    const plan = await dbB.getRepository(Plan).findOneByOrFail({ userId: 167 });
    const first = a.usage.recordAiUsage(167, AiModel.GPT_5_MINI, 4000, 1000);
    await enteredMirror.promise;
    onSecondUserLock = secondLockRequested.resolve;
    const second = b.plans.updatePlanFromGooglePubSub(
      plan.id,
      167,
      { autoRenewEnabled: false },
      { restoreActual: true, resetUsedCredits: false },
    );
    try {
      await secondLockRequested.promise;
    } finally {
      releaseMirror.resolve();
    }
    await Promise.all([first, second]);
    expect(await balances()).toEqual({
      plan: { used: 130, input: 50, output: 80 },
      state: { used: 130, input: 50, output: 80 },
    });
  }, 15000);
});
