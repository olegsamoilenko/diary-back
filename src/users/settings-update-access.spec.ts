import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import { GeoAccessService } from '../common/geo-access/geo-access.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { Font, Theme, DateFormat } from './types';

// Exercise real HTTP/JWT/controller/service with two isolated synthetic rows.
// No deployed API, production DB or account mutation.
describe('Settings update ownership', () => {
  const owner = { id: 111, uuid: 'settings-owner' };
  const secret = 'local-settings-regression-secret';
  const jwt = new JwtService({ secret });
  let app: INestApplication;
  let service: UsersService;
  let rows: Map<number, Record<string, unknown>>;
  let foreignBefore: Record<string, unknown>;
  const findOne = jest.fn(
    async (query: { where: { user: { id: number } } }) => {
      const row = [...rows.values()].find(
        (item) => (item.user as { id: number }).id === query.where.user.id,
      );
      return row ? { ...row } : null;
    },
  );
  const save = jest.fn(async (patch: Record<string, unknown>) => {
    const id = patch.id as number;
    const row = rows.get(id) ?? {};
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) row[key] = value;
    }
    rows.set(id, row);
    return { ...row };
  });
  const update = jest.fn(
    async (
      criteria: Record<string, unknown>,
      patch: Record<string, unknown>,
    ) => {
      const row = rows.get(criteria.id as number);
      if (!row) return { affected: 0 };
      for (const field of ['themeSelection', 'onboardingVariant']) {
        if (field in criteria && row[field] !== null) return { affected: 0 };
      }
      Object.assign(row, patch);
      return { affected: 1 };
    },
  );
  const send = (body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post('/users/update-settings')
      .auth(jwt.sign(owner, { expiresIn: 60 }), { type: 'bearer' })
      .send(body);

  beforeAll(async () => {
    const previousSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = secret;
    try {
      service = Object.assign(
        Object.create(UsersService.prototype) as UsersService,
        {
          usersSettingsRepository: { findOne, save, update },
          findById: async (id: number) => (id === owner.id ? owner : null),
        },
      );
      const module = await Test.createTestingModule({
        imports: [PassportModule.register({})],
        controllers: [UsersController],
        providers: [
          JwtStrategy,
          { provide: UsersService, useValue: service },
          { provide: GeoAccessService, useValue: {} },
        ],
      }).compile();
      app = module.createNestApplication();
      app.useGlobalPipes(
        new ValidationPipe({
          whitelist: true,
          forbidNonWhitelisted: false,
          transform: true,
          transformOptions: { enableImplicitConversion: true },
        }),
      );
      await app.listen(0, '127.0.0.1');
    } finally {
      if (previousSecret === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = previousSecret;
    }
  });
  afterAll(async () => app?.close());

  beforeEach(() => {
    jest.clearAllMocks();
    const base = {
      lang: 'uk',
      font: 'Manrope',
      theme: 'light',
      themeSelection: null,
      onboardingVariant: null,
      checkinAiAnalysisEnabledByDefault: true,
      appBuild: 269,
      uniqueId: 'own-device',
      platform: 'android',
    };
    rows = new Map([
      [1111, { ...base, id: 1111, user: { id: owner.id } }],
      [
        2222,
        {
          ...base,
          id: 2222,
          user: { id: 222 },
          lang: 'pl',
          uniqueId: 'other-device',
        },
      ],
    ]);
    foreignBefore = structuredClone(rows.get(2222)!);
  });

  it('requires app authentication before loading or writing settings', async () => {
    await request(app.getHttpServer())
      .post('/users/update-settings')
      .send({ id: 2222, lang: 'en' })
      .expect(401);
    expect(findOne).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it.each([2222, 3333, null, 0, -1, '2222'])(
    'ignores supplied row id %j and preserves the foreign row',
    async (id) => {
      const result = await send({
        id,
        lang: 'en',
        user: { id: 222 },
        userId: 222,
      }).expect(201);
      expect(findOne).toHaveBeenCalledWith({
        where: { user: { id: owner.id } },
      });
      expect(result.body).toMatchObject({
        id: 1111,
        lang: 'en',
        user: { id: owner.id },
      });
      expect(save).toHaveBeenCalledTimes(1);
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1111, user: { id: owner.id } }),
      );
      expect(rows.get(2222)).toEqual(foreignBefore);
      expect(rows.size).toBe(2);
    },
  );

  it.each([
    ['user', { id: 222 }],
    ['user', null],
    ['userId', 222],
    ['uuid', 'other-owner'],
    ['role', 'admin'],
    ['uniqueId', 'other-device'],
    ['platform', 'ios'],
    ['model', 'other-model'],
    ['osVersion', 'other-os'],
    ['osBuildId', 'other-build'],
    ['locale', 'other-locale'],
    ['createdAt', '2020-01-01'],
    ['unknownFutureColumn', true],
  ])('does not write unsupported %s', async (key, value) => {
    await send({ [key]: value }).expect(201);
    expect(save).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(rows.get(2222)).toEqual(foreignBefore);
  });

  it.each([
    ['theme', Theme.SEA_WHISPER],
    ['font', 'Montserrat'],
    ['timeFormat', '24h'],
    ['dateFormat', DateFormat.DMY],
    ['firstDayOfWeek', 0],
    ['lang', 'en'],
    ['conversationLanguage', 'en'],
    ['aiModel', 'gpt-5.2'],
    ['aiAnalysisEnabledByDefault', false],
    ['checkinAiAnalysisEnabledByDefault', false],
    ['shortAiReflectionEnabled', false],
    ['entryMediaAnalysisMode', 'never'],
    ['timezone', 'Europe/Kiev'],
    ['pushNotificationsEnabled', true],
    ['calendarShowEventIcons', false],
    ['calendarShowGoalIcons', false],
    ['calendarShowMood', false],
    ['calendarShowEventIconsPast', true],
    ['calendarShowGoalIconsPast', true],
    ['calendarEventIconsFutureRange', 'all'],
    ['calendarGoalIconsFutureRange', 'all'],
    ['diaryTabEnabled', true],
    ['appVersion', '1.3.39'],
    ['appBuild', 276],
  ])('retains partial preference/build update %s', async (key, value) => {
    await send({ [key]: value }).expect(201);
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1111, [key]: value }),
    );
    expect(rows.get(2222)).toEqual(foreignBefore);
    expect(rows.get(1111)?.uniqueId).toBe('own-device');
  });

  it('preserves combined metric/check-in validation and normalization', async () => {
    const metricTracking = {
      version: 1,
      activeIds: ['energy'],
      customMetrics: [],
    };
    const checkinSettings = {
      version: 1,
      templates: [
        {
          id: 'morning',
          title: null,
          deleted: false,
          metricIds: ['energy'],
          questions: [{ id: 'howFeel', text: null }],
        },
      ],
    };
    await send({ id: 2222, metricTracking, checkinSettings }).expect(201);
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 1111,
        metricTracking: expect.objectContaining(metricTracking),
        checkinSettings,
      }),
    );
    expect(rows.get(2222)).toEqual(foreignBefore);
  });

  it('keeps explicit theme and onboarding writes on the server-selected row', async () => {
    const themeSelection = { family: 'coast', mode: 'dark' };
    await send({
      id: 2222,
      user: { id: 222 },
      lang: 'en',
      themeSelection,
      onboardingVariant: 'quick-start',
    }).expect(201);
    expect(rows.get(1111)).toMatchObject({
      lang: 'en',
      themeSelection,
      onboardingVariant: 'quick-start',
    });
    expect(update.mock.calls.every(([criteria]) => criteria.id === 1111)).toBe(
      true,
    );
    expect(rows.get(2222)).toEqual(foreignBefore);
  });

  it('does not overwrite an existing theme or onboarding choice during initialization', async () => {
    const current = { family: 'sakura', mode: 'dark' };
    Object.assign(rows.get(1111)!, {
      themeSelection: current,
      onboardingVariant: 'quick-start',
    });
    const result = await send({
      id: 2222,
      themeSelection: { family: 'trail', mode: 'light' },
      initializeThemeSelection: true,
      onboardingVariant: 'direct-entry',
    }).expect(201);
    expect(result.body).toMatchObject({
      themeSelection: current,
      onboardingVariant: 'quick-start',
    });
    expect(rows.get(2222)).toEqual(foreignBefore);
  });

  it.each([
    { themeSelection: { family: 'invalid', mode: 'dark' } },
    { metricTracking: { version: 99 } },
    { checkinSettings: { version: 99 } },
    { onboardingVariant: 'invalid' },
    { checkinAiAnalysisEnabledByDefault: 'false' },
    { entryMediaAnalysisMode: 'invalid' },
  ])(
    'rejects invalid structured values before any partial write: %j',
    async (invalid) => {
      await send({ id: 2222, lang: 'en', ...invalid }).expect(400);
      expect(save).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
      expect(rows.get(2222)).toEqual(foreignBefore);
    },
  );

  it('retains the existing ignored legacy diaryTabVariant behavior', async () => {
    await send({ diaryTabVariant: 'unknown', font: 'Montserrat' }).expect(201);
    expect(save.mock.calls[0][0]).not.toHaveProperty('diaryTabVariant');
  });

  it('does not fall back to a supplied id when own settings are absent', async () => {
    rows.delete(1111);
    await send({ id: 2222, lang: 'en' }).expect(404);
    expect(save).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(rows.get(2222)).toEqual(foreignBefore);
  });

  it('propagates persistence errors', async () => {
    save.mockRejectedValueOnce(new Error('synthetic database failure'));
    await send({ lang: 'en' }).expect(500);
    expect(rows.get(1111)?.lang).toBe('uk');
  });

  it('protects direct service calls and excludes inherited properties too', async () => {
    const body = Object.assign(
      Object.create({ lang: 'en', user: { id: 222 } }) as object,
      { id: 2222, font: Font.MONSERRAT },
    );
    await service.updateUserSettings(owner.id, body);
    expect(rows.get(1111)).toMatchObject({
      lang: 'uk',
      font: 'Montserrat',
      user: { id: owner.id },
    });
    expect(rows.get(2222)).toEqual(foreignBefore);
  });
});
