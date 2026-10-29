import { describe, expect, it, jest } from '@jest/globals';
import nacl from 'tweetnacl';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { UserSettings } from './entities/user-settings.entity';
import { UniqueId } from './entities/unique-id.entity';
import { Salt } from '../salt/entities/salt.entity';
import { SaltService } from '../salt/salt.service';
import { AiPreferencesService } from '../ai/ai-preferences.service';
import { UserAiPreferences } from '../ai/entities/user-ai-preferences.entity';
import { AuthService } from '../auth/auth.service';
import { SessionsService } from '../auth/sessions.service';
import { UserSession } from '../auth/entities/user-session.entity';
import { ForumTopicReadStatesService } from '../forum/services/forum-topic-read-states.service';
import { ForumTopic } from '../forum/entities/forum-topic.entity';
import { ForumTopicReadState } from '../forum/entities/forum-topic-read-state.entity';
import { Plan } from '../plans/entities/plan.entity';
import { PlansService } from '../plans/plans.service';
import { AiModel, Lang, Theme } from './types';
import { Platform } from '../common/types/platform';
import { BasePlanIds, PlanStatus, SubscriptionIds } from '../plans/types';

jest.mock('../common/utils/bctypto', () => ({
  bcryptHashToken: async (value: string) => `synthetic:${value}`,
}));

// Stateful rollback/serialization model, not a PostgreSQL integration test.
// Real creation, login, salt, preferences, topic initialization and session code.
// No external repository may be used inside the bootstrap transaction.
function harness() {
  let state = new Map<any, any[]>();
  let nextId = 0;
  let queue = Promise.resolve();
  let failure: any = null;
  const queries: string[] = [];
  const rows = (entity: any) => state.get(entity) ?? [];
  const trip = (entity: any) => {
    if (failure === entity) {
      failure = null;
      throw new Error(`failed:${entity.name}`);
    }
  };
  const matches = (row: any, where: any): boolean =>
    Object.entries(where ?? {}).every(([key, value]) =>
      value && typeof value === 'object'
        ? matches(row[key] ?? {}, value)
        : row[key] === value,
    );
  const manager: any = {
    query: async (sql: string) => {
      queries.push(sql);
      return [];
    },
    getRepository: (entity: any) => ({
      create: (value: any) => ({ ...value }),
      findOne: async ({ where }: any) =>
        rows(entity).find((row) => matches(row, where)) ?? null,
      find: async () =>
        entity === ForumTopic
          ? [{ id: 'topic', createdAt: new Date() }]
          : rows(entity),
      save: async (input: any) => {
        trip(entity);
        const row = {
          ...input,
          id: input.id ?? ++nextId,
          updatedAt: new Date(),
          rowVersion: 1,
        };
        // Store relation identifiers, like a relational database, without object cycles.
        if (row.user) row.user = { id: row.user.id };
        delete row.settings;
        delete row.aiPreferences;
        state.set(entity, [
          ...rows(entity).filter((value) => value.id !== row.id),
          row,
        ]);
        return { ...row };
      },
      upsert: async (values: any[]) => {
        trip(entity);
        state.set(entity, [...rows(entity), ...values]);
      },
      createQueryBuilder: () => {
        let userId: number;
        const builder: any = {
          select: () => builder,
          where: (_: any, params: any) => {
            userId = params.userId;
            return builder;
          },
          getOne: async () => rows(entity).find((row) => row.userId === userId),
        };
        return builder;
      },
    }),
  };
  const transaction = async (work: any) => {
    let release!: () => void;
    const previous = queue;
    queue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    const snapshot = new Map(
      [...state].map(([key, value]) => [key, value.map((row) => ({ ...row }))]),
    );
    try {
      return await work(manager);
    } catch (error) {
      state = snapshot;
      throw error;
    } finally {
      release();
    }
  };
  const forbidden: any = new Proxy(
    {},
    {
      get: () => {
        throw new Error('repository escaped transaction');
      },
    },
  );
  const salt = new SaltService(forbidden);
  const preferences = new AiPreferencesService(forbidden);
  const forum = Object.assign(
    Object.create(ForumTopicReadStatesService.prototype),
    { topicsRepo: forbidden, readStatesRepo: forbidden },
  );
  const plans = Object.assign(Object.create(PlansService.prototype), {
    planRepository: forbidden,
    subscribePlan: jest.fn(async (userId: number, data: any, tx: any) => {
      expect(tx).toBe(manager);
      return {
        plan: await tx
          .getRepository(Plan)
          .save({ user: { id: userId }, actual: true, ...data }),
      };
    }),
  });
  const service = Object.assign(Object.create(UsersService.prototype), {
    usersRepository: { manager: { transaction } },
    uniqueIdRepository: forbidden,
    usersSettingsRepository: forbidden,
    saltService: salt,
    aiPreferencesService: preferences,
    plansService: plans,
    forumTopicReadStatesService: forum,
  }) as UsersService;
  const sessions = new SessionsService(
    { signAsync: async () => 'synthetic-access' } as any,
    forbidden,
    { get: () => undefined } as any,
    service,
    salt,
  );
  (service as any).authService = Object.assign(
    Object.create(AuthService.prototype),
    {
      usersService: service,
      plansService: plans,
      aiPreferencesService: preferences,
      sessionsService: sessions,
    },
  );
  const key = nacl.sign.keyPair.fromSeed(new Uint8Array(32).fill(23));
  const publicKey = Buffer.from(key.publicKey).toString('base64');
  const proof = (uuid = 'request-a', ts = Date.now(), signingKey = key) => ({
    ts,
    signature: Buffer.from(
      nacl.sign.detached(
        Buffer.from(
          JSON.stringify({
            purpose: 'create-anonymous-user',
            uuid,
            deviceId: 'device',
            ts,
          }),
        ),
        signingKey.secretKey,
      ),
    ).toString('base64'),
  });
  const create = (
    options: {
      uuid?: string;
      uniqueId?: string | null;
      legacy?: boolean;
      planData?: any;
      proof?: any;
      publicKey?: string;
    } = {},
  ) => {
    const uuid = options.uuid ?? 'request-a';
    return service.createUserByUUID(
      uuid,
      Lang.UK,
      Theme.LIGHT,
      AiModel.GPT_5_MINI,
      Platform.ANDROID,
      'UA',
      options.publicKey ?? publicKey,
      'device',
      'test',
      276,
      'uk-UA',
      'Europe/Kyiv',
      1,
      'synthetic',
      'test',
      'test',
      options.uniqueId === undefined ? 'same-phone' : options.uniqueId,
      null,
      null,
      options.planData ??
        (options.legacy
          ? ({
              basePlanId: BasePlanIds.START,
              planStatus: PlanStatus.ACTIVE,
              subscriptionId: SubscriptionIds.NEMORY,
            } as any)
          : undefined),
      null,
      null,
      options.proof === undefined ? proof(uuid) : options.proof,
    );
  };
  return {
    create,
    rows,
    proof,
    queries,
    plans,
    manager,
    fail: (entity: any) => {
      failure = entity;
    },
  };
}

describe('Anonymous bootstrap atomicity and authenticated retry', () => {
  it.each([BasePlanIds.PRO_M1, BasePlanIds.START])(
    'NA-42: ignores supplied %s entitlement and store fields in legacy bootstrap',
    async (basePlanId) => {
      const h = harness();
      const before = Date.now();
      await h.create({
        planData: {
          basePlanId,
          subscriptionId: SubscriptionIds.NEMORY_AD_FREE,
          planStatus: PlanStatus.ACTIVE,
          startTime: '2000-01-01',
          expiryTime: '2099-01-01',
          purchaseToken: 'unverified-token',
          linkedPurchaseToken: 'another-users-token',
          lastOrderId: 'unverified-order',
          autoRenewEnabled: true,
          price: 999,
          currency: 'USD',
          id: 999,
          user: { id: 999 },
          creditsLimit: 999999,
          usedCredits: -999999,
        },
      });
      const [userId, dto, tx] = h.plans.subscribePlan.mock.calls[0];
      expect(userId).toBe(h.rows(User)[0].id);
      expect(tx).toBe(h.manager);
      expect(dto).toEqual({
        basePlanId: BasePlanIds.START,
        subscriptionId: SubscriptionIds.NEMORY,
        planStatus: PlanStatus.ACTIVE,
        startTime: expect.any(Date),
        expiryTime: expect.any(Date),
        autoRenewEnabled: false,
        price: 0,
        lastOrderId: null,
        platform: Platform.ANDROID,
        regionCode: 'UA',
      });
      expect(dto.startTime.getTime()).toBeGreaterThanOrEqual(before);
      expect(dto.startTime.getTime()).toBeLessThanOrEqual(Date.now());
      expect(dto.expiryTime.getTime() - dto.startTime.getTime()).toBe(
        7 * 24 * 60 * 60 * 1000,
      );
    },
  );

  it('NA-42: keeps current clients eligible for V2 without creating a legacy plan', async () => {
    const h = harness();
    const result = await h.create();
    expect(result).toEqual(expect.objectContaining({ isFirstInstall: true }));
    expect(result.user?.usesWithoutSubscription).toBe(false);
    expect(h.plans.subscribePlan).not.toHaveBeenCalled();
  });

  it('NA-42: cannot obtain another trial through planData on a known device', async () => {
    const h = harness();
    await h.create({ legacy: true });
    const result = await h.create({
      uuid: 'second-account',
      planData: { basePlanId: BasePlanIds.PRO_M1 },
    });
    expect(result).toEqual(expect.objectContaining({ isFirstInstall: false }));
    expect(result.user?.usesWithoutSubscription).toBe(true);
    expect(h.plans.subscribePlan).toHaveBeenCalledTimes(1);
    expect(h.rows(Plan)).toHaveLength(1);
  });

  it('NA-42: authenticated bootstrap retry leaves an existing paid plan untouched', async () => {
    const h = harness();
    await h.create({ legacy: true });
    const paid = Object.assign(h.rows(Plan)[0], {
      basePlanId: BasePlanIds.LITE_M1,
      purchaseToken: 'already-verified-store-token',
      expiryTime: new Date('2030-01-01'),
      usedCredits: 123,
    });
    const snapshot = { ...paid };
    await h.create({ planData: { basePlanId: BasePlanIds.START } });
    expect(h.rows(Plan)).toEqual([snapshot]);
    expect(h.plans.subscribePlan).toHaveBeenCalledTimes(1);
  });

  it.each([
    UniqueId,
    User,
    Salt,
    UserSettings,
    UserAiPreferences,
    ForumTopicReadState,
    UserSession,
  ])(
    'rolls back a failure writing %p and retains trial eligibility on retry',
    async (entity) => {
      const h = harness();
      h.fail(entity);
      await expect(h.create()).rejects.toThrow(`failed:${entity.name}`);
      for (const table of [
        UniqueId,
        User,
        Salt,
        UserSettings,
        UserAiPreferences,
        ForumTopicReadState,
        UserSession,
      ])
        expect(h.rows(table)).toHaveLength(0);
      const result = await h.create();
      expect(result.user?.usesWithoutSubscription).toBe(false);
      expect(h.rows(User)).toHaveLength(1);
      expect(h.rows(UniqueId)).toHaveLength(1);
      expect(h.queries.some((sql) => sql.includes('728491'))).toBe(true);
      expect(h.queries.some((sql) => sql.includes('728492'))).toBe(true);
    },
  );

  it('rolls back legacy trial creation failure with the device claim', async () => {
    const h = harness();
    h.fail(Plan);
    await expect(h.create({ legacy: true })).rejects.toThrow('failed:Plan');
    expect(h.rows(UniqueId)).toHaveLength(0);
    expect(h.rows(User)).toHaveLength(0);
    const result = await h.create({ legacy: true });
    expect(result.user?.usesWithoutSubscription).toBe(false);
    expect(h.rows(Plan)).toHaveLength(1);
  });

  it('returns the same account after a lost successful response, without another legacy trial', async () => {
    const h = harness();
    const first = await h.create({ legacy: true });
    const retry = await h.create({ legacy: true });
    expect(retry.user?.id).toBe(first.user?.id);
    expect(retry.user?.usesWithoutSubscription).toBe(false);
    expect(h.rows(User)).toHaveLength(1);
    expect(h.rows(UserSession)).toHaveLength(1);
    expect(h.plans.subscribePlan).toHaveBeenCalledTimes(1);
  });

  it('serializes two retries of the same creation request', async () => {
    const h = harness();
    const [first, retry] = await Promise.all([h.create(), h.create()]);
    expect(first.user?.id).toBe(retry.user?.id);
    expect(h.rows(User)).toHaveLength(1);
  });

  it('grants device eligibility only once across different request UUIDs', async () => {
    const h = harness();
    const results = await Promise.all([
      h.create(),
      h.create({ uuid: 'request-b' }),
    ]);
    expect(
      results.map((result) => result.user?.usesWithoutSubscription),
    ).toEqual([false, true]);
    expect(h.rows(UniqueId)).toHaveLength(1);
    expect(h.rows(User)).toHaveLength(2);
  });

  it.each([null, '', '   '])(
    'does not grant trial with missing device identity %p',
    async (uniqueId) => {
      const h = harness();
      expect(
        (await h.create({ uniqueId, legacy: true })).user
          ?.usesWithoutSubscription,
      ).toBe(true);
      expect(h.rows(UniqueId)).toHaveLength(0);
      expect(h.plans.subscribePlan).not.toHaveBeenCalled();
    },
  );

  it('preserves legacy clients without proof for fresh requests, but never restores by UUID alone', async () => {
    const h = harness();
    await h.create({ proof: null });
    await expect(h.create({ proof: null })).rejects.toThrow(
      'ANONYMOUS_CREATION_ALREADY_EXISTS',
    );
    expect(h.rows(User)).toHaveLength(1);
  });

  it.each([
    'wrong-key',
    'expired',
    'malformed',
    'wrong-purpose',
    'changed-public-key',
    'missing-session',
  ])('denies retry with %s', async (fault) => {
    const h = harness();
    await h.create();
    const other = nacl.sign.keyPair.fromSeed(new Uint8Array(32).fill(42));
    let proof = h.proof();
    let publicKey: string | undefined;
    if (fault === 'wrong-key') proof = h.proof('request-a', Date.now(), other);
    if (fault === 'expired') proof = h.proof('request-a', Date.now() - 180_000);
    if (fault === 'malformed') proof.signature = 'bad';
    if (fault === 'wrong-purpose') proof = h.proof('another-request');
    if (fault === 'changed-public-key')
      publicKey = Buffer.from(other.publicKey).toString('base64');
    if (fault === 'missing-session') h.rows(UserSession).splice(0);
    await expect(h.create({ proof, publicKey })).rejects.toThrow(
      'INVALID_DEVICE_SIGNATURE',
    );
    expect(h.rows(User)).toHaveLength(1);
  });

  it.each([
    'isRegistered',
    'isSystem',
    'emailVerified',
    'email',
    'phone',
    'password',
    'oauthProvider',
    'oauthProviderId',
  ])('does not restore a non-guest account marked %s', async (field) => {
    const h = harness();
    await h.create();
    h.rows(User)[0][field] = true;
    await expect(h.create()).rejects.toThrow(
      'ANONYMOUS_CREATION_ALREADY_EXISTS',
    );
  });
});
