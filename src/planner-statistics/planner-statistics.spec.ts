import { describe, expect, it, jest } from '@jest/globals';
import { ValidationPipe } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AuthGuard } from '@nestjs/passport';
import { getMetadataArgsStorage, Repository } from 'typeorm';
import { PlannerCreationStat } from './entities/planner-creation-stat.entity';
import {
  CreatePlannerStatDto,
  PlannerEntityStatDto,
  PLANNER_TYPES,
} from './planner-statistics.dto';
import { PlannerStatisticsController } from './planner-statistics.controller';
import { PlannerStatisticsService } from './planner-statistics.service';
import { GoalsStatisticsService } from '../goals-statistics/goals-statistics.service';
import { AddPlannerCreationStats1792195200000 } from '../migrations/1792195200000-AddPlannerCreationStats';

function fixture() {
  const query = jest.fn(async (_sql: string, _params: unknown[]) => [
    { id: 1 },
  ]);
  const repository = { query };
  const service = new PlannerStatisticsService(
    repository as unknown as Repository<PlannerCreationStat>,
  );
  return { query, service, repository };
}

describe('planner creation collection', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });
  const parse = (value: unknown) =>
    pipe.transform(value, { type: 'body', metatype: CreatePlannerStatDto });

  it.each(PLANNER_TYPES)(
    'accepts and records %s with no private content or client-supplied owner/date',
    async (type) => {
      const { service, query } = fixture();
      const body = await parse({
        type,
        entityId: 'local-id',
        userId: 999,
        title: 'private',
        createdAt: '2000-01-01',
      });
      expect(Object.keys(body).sort()).toEqual(['entityId', 'type']);
      const result = await new PlannerStatisticsController(
        service,
      ).recordCreation({ id: 7, uuid: '', email: '', name: '' }, body);
      expect(result).toEqual({ recorded: true });
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT'),
        [7, type, 'local-id'],
      );
    },
  );

  it.each([
    {},
    { type: 'other' },
    { type: 'task', entityId: '' },
    { type: 'note', entityId: [] },
    { type: 'event', entityId: 'a'.repeat(129) },
  ])('rejects invalid input %j', async (body) => {
    await expect(parse(body)).rejects.toThrow();
  });

  it('requires a user JWT for the collection endpoint', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, PlannerStatisticsController),
    ).toContain(AuthGuard('jwt'));
  });

  it('uses an atomic insert with database uniqueness scoped to user, type and local ID', async () => {
    const { service, query } = fixture();
    query.mockResolvedValueOnce([]);
    await expect(service.recordCreation(7, 'task', 'id')).resolves.toEqual({
      recorded: false,
    });
    expect(query.mock.calls[0][0]).toContain(
      'WHERE planner_creation_stats.created_at IS NULL',
    );
    const unique = getMetadataArgsStorage().uniques.find(
      (item) => item.target === PlannerCreationStat,
    );
    expect(unique?.columns).toEqual(['userId', 'type', 'entityId']);
  });

  it('accepts old clients without local IDs without coalescing their separate creations', async () => {
    const { service, query } = fixture();
    expect(await parse({ type: 'goal' })).toMatchObject({ type: 'goal' });
    await service.recordCreation(7, 'goal');
    expect(query).toHaveBeenCalledWith(expect.any(String), [7, 'goal', null]);
  });

  it.each(['goal', 'habit', 'checklist'])(
    'bridges legacy %s creation while preserving deletion semantics',
    async (type) => {
      const row = { id: 1, type };
      const repo = {
        create: jest.fn(() => row),
        save: jest.fn(async () => row),
        findOne: jest.fn(async () => row),
        delete: jest.fn(async () => undefined),
      };
      const activity = { incrementGoalStat: jest.fn(async () => undefined) };
      const statistics = {
        recordCreation: jest.fn(async () => ({ recorded: true })),
        recordDeletion: jest.fn(async () => undefined),
        recordLegacyDeletion: jest.fn(async () => undefined),
      };
      const service = new GoalsStatisticsService(
        repo as any,
        { findById: async () => ({ id: 7 }) } as any,
        {} as any,
        activity as any,
        statistics as any,
      );
      await expect(service.addGoalStat(7, type, 'local')).resolves.toEqual(row);
      expect(statistics.recordCreation).toHaveBeenCalledWith(7, type, 'local');
      await service.deleteGoalStat(7, type, 'local');
      expect(statistics.recordDeletion).toHaveBeenCalledWith(7, type, 'local');
      await service.deleteGoalStat(7, type);
      expect(statistics.recordLegacyDeletion).toHaveBeenCalledWith(7, type);
      expect(repo.delete).toHaveBeenCalledWith(row);
      expect(statistics.recordCreation).toHaveBeenCalledTimes(1);
      expect(activity.incrementGoalStat).toHaveBeenCalledTimes(1);
    },
  );

  it('does not report a legacy save that failed', async () => {
    const statistics = { recordCreation: jest.fn() };
    const service = new GoalsStatisticsService(
      {
        create: () => ({}),
        save: async () => {
          throw new Error('db');
        },
      } as any,
      { findById: async () => ({ id: 7 }) } as any,
      {} as any,
      { incrementGoalStat: async () => undefined } as any,
      statistics as any,
    );
    await expect(service.addGoalStat(7, 'goal')).rejects.toThrow('db');
    expect(statistics.recordCreation).not.toHaveBeenCalled();
  });

  it('migration preserves aggregate history when an account is deleted and does not backfill invented creations', async () => {
    const runner = { query: jest.fn(async (_sql: string) => undefined) };
    await new AddPlannerCreationStats1792195200000().up(runner as any);
    const sql = runner.query.mock.calls.map(([text]) => text).join('\n');
    expect(sql).toContain('ON DELETE SET NULL');
    expect(sql).toContain('UNIQUE ("user_id", "type", "entity_id")');
    expect(sql).toContain('timestamptz NOT NULL DEFAULT now()');
    expect(sql).not.toMatch(/INSERT INTO|UPDATE |DELETE FROM/);
  });
});

describe('planner saved inventory', () => {
  it.each(PLANNER_TYPES)(
    'deletes %s without decrementing or overwriting its creation timestamp',
    async (type) => {
      const { service, query } = fixture();
      await service.recordDeletion(7, type, 'item');
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('COALESCE(planner_creation_stats.deleted_at'),
        [7, type, 'item'],
      );
      const update = query.mock.calls[0][0].split('DO UPDATE')[1];
      expect(update).not.toContain('created_at');
      expect(query.mock.calls[0][0]).toContain('NULL, now()');
    },
  );
  it('keeps deletion intact on delayed creation and ignores delayed presence after deletion', async () => {
    const { service, query } = fixture();
    await service.recordDeletion(7, 'task', 'item');
    await service.recordCreation(7, 'task', 'item');
    const createSql = query.mock.calls[1][0];
    expect(createSql).toContain('SET created_at = EXCLUDED.created_at');
    expect(createSql).not.toContain('deleted_at');
    await service.recordSaved(7, 'task', 'item');
    expect(query.mock.calls[2][0]).toContain('DO NOTHING');
    expect(query.mock.calls[2][0]).toContain('VALUES ($1, $2, $3, NULL)');
  });
  it('matches legacy deletion only to anonymous, live rows of that owner and type', async () => {
    const { service, query } = fixture();
    await service.recordLegacyDeletion(7, 'habit');
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('entity_id IS NULL AND deleted_at IS NULL'),
      [7, 'habit'],
    );
    expect(query.mock.calls[0][0]).toContain('FOR UPDATE SKIP LOCKED');
  });
  it.each([
    {},
    { type: 'task' },
    { type: 'note', entityId: '' },
    { type: 'bad', entityId: 'id' },
  ])(
    'requires a valid exact ID for saved/deleted reports: %j',
    async (value) => {
      await expect(
        new ValidationPipe().transform(value, {
          type: 'body',
          metatype: PlannerEntityStatDto,
        }),
      ).rejects.toThrow();
    },
  );
});
