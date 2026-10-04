import { expect, it, jest } from '@jest/globals';
import { validate } from 'class-validator';
import { TokenUsageHistory } from '../tokens/entities/token-usage-history.entity';
import { CreateDiaryStatDto } from './dto/create-diary-stat.dto';
import {
  createDiaryStat,
  DiaryStatKind,
  refreshDiaryStatAiInput,
} from './diary-stat-ai-input';

function fixture() {
  const history: any[] = [];
  const tables = new Map<unknown, any[]>();
  const matches = (row: any, where: any) =>
    Object.entries(where).every(([key, value]) =>
      key === 'user' ? row.user.id === (value as any).id : row[key] === value,
    );
  const manager: any = {
    query: jest.fn(async () => undefined),
    transaction: jest.fn(async (work: (value: any) => any) => work(manager)),
    getRepository: jest.fn((entity) => {
      if (entity === TokenUsageHistory)
        return {
          find: jest.fn(async ({ where }: any) =>
            history.filter((row) => matches(row, where)),
          ),
        };
      if (!tables.has(entity)) tables.set(entity, []);
      const rows = tables.get(entity)!;
      return {
        findOneBy: async (where) =>
          rows.find((row) => matches(row, where)) ?? null,
        create: (data) => data,
        save: async (data) => {
          const row = { ...data, id: rows.length + 1 };
          rows.push(row);
          return row;
        },
        update: async (where, data) => {
          rows
            .filter((row) => typeof where === 'number' ? row.id === where : matches(row, where))
            .forEach((row) => Object.assign(row, data));
        },
      };
    }),
  };
  const usage = (extra = {}) => ({
    user: { id: 7 },
    traceId: 'cycle',
    operation: 'generate_entry_response',
    input: 12000,
    inputCredits: 36,
    output: 800,
    outputCredits: 96,
    cachedInput: 10000,
    estimated: false,
    ...extra,
  });
  return { manager, history, usage, user: { id: 7 } as any };
}

it.each(['stat-first', 'usage-first'])(
  'records authoritative cached input in either arrival order (%s)',
  async (order) => {
    const { manager, history, usage, user } = fixture();
    let result: any;
    if (order === 'stat-first') {
      result = await createDiaryStat(manager, 'entry', user, {
        aiTraceId: 'cycle',
      });
      expect(result.stat.inputTokens).toBeNull();
    }
    history.push(usage());
    await refreshDiaryStatAiInput(
      manager,
      user.id,
      'cycle',
      'generate_entry_response',
    );
    result ??= await createDiaryStat(manager, 'entry', user, {
      aiTraceId: 'cycle',
    });
    expect(result.stat).toMatchObject({ inputTokens: 12000, inputCredits: 36 });
    expect(manager.query).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      ['diary-stat-input:7:cycle'],
    );
    const replay = await createDiaryStat(manager, 'entry', user, {
      aiTraceId: 'cycle',
    });
    expect(replay.created).toBe(false);
    expect(replay.stat.id).toBe(result.stat.id);
  },
);

it.each([
  ['entry', 'generate_entry_response'],
  ['dialog', 'generate_dialog_response'],
  ['checkin', 'generate_checkin_response'],
  ['checkin-dialog', 'generate_checkin_dialog_response'],
])(
  'keeps %s usage isolated by owner, trace and operation',
  async (kind, operation) => {
    const { manager, history, usage, user } = fixture();
    history.push(
      usage({ operation }),
      usage({ operation, input: 100, inputCredits: 2 }),
      usage({ operation, user: { id: 99 } }),
      usage({ operation, traceId: 'other' }),
      usage({ operation: 'generate_image' }),
      usage({ operation: 'extract_user_memory_v2' }),
      usage({ operation, estimated: true }),
    );
    const { stat } = await createDiaryStat(
      manager,
      kind as DiaryStatKind,
      user,
      { aiTraceId: 'cycle' },
    );
    expect(stat).toMatchObject({ inputTokens: 12100, inputCredits: 38 });
    await refreshDiaryStatAiInput(manager, user.id, 'cycle', operation);
    expect(stat).toMatchObject({ inputTokens: 12100, inputCredits: 38 });
  },
);

it('distinguishes legacy unknown usage from explicitly AI-free creation', async () => {
  const { manager, user } = fixture();
  const legacy = await createDiaryStat(manager, 'entry', user);
  expect(legacy.stat).toMatchObject({
    inputTokens: null,
    inputCredits: null,
    aiTraceId: null,
    entryId: null,
  });
  const offline = await createDiaryStat(manager, 'checkin', user, {
    aiRequested: false,
    aiTraceId: 'cycle',
  });
  expect(offline.stat).toMatchObject({ inputTokens: 0, inputCredits: 0 });
});

it('does not convert unobserved usage into zero or refresh unrelated operations', async () => {
  const { manager, history, usage, user } = fixture();
  history.push(usage({ estimated: true }));
  const { stat } = await createDiaryStat(manager, 'entry', user, {
    aiTraceId: 'cycle',
  });
  expect(stat.inputTokens).toBeNull();
  manager.transaction.mockClear();
  await refreshDiaryStatAiInput(manager, user.id, 'cycle', 'generate_image');
  await refreshDiaryStatAiInput(
    manager,
    user.id,
    null,
    'generate_entry_response',
  );
  expect(manager.transaction).not.toHaveBeenCalled();
});

it('validates optional request metadata without accepting client-priced input', async () => {
  expect(await validate(new CreateDiaryStatDto())).toHaveLength(0);
  for (const value of ['', ' ', 'x'.repeat(129), 123]) {
    const dto = Object.assign(new CreateDiaryStatDto(), { aiTraceId: value });
    expect((await validate(dto)).length).toBeGreaterThan(0);
    const sourceDto = Object.assign(new CreateDiaryStatDto(), { entryId: value });
    expect((await validate(sourceDto)).length).toBeGreaterThan(0);
  }
  const dto = Object.assign(new CreateDiaryStatDto(), {
    aiTraceId: 'cycle',
    entryId: 'local-entry',
    inputCredits: 1,
    inputTokens: 1,
  });
  await validate(dto, { whitelist: true });
  expect(dto).not.toHaveProperty('inputCredits');
  expect(dto).not.toHaveProperty('inputTokens');
  expect(dto.entryId).toBe('local-entry');
});

it.each<[DiaryStatKind, DiaryStatKind]>([['entry', 'dialog'], ['checkin', 'checkin-dialog']])(
  'links %s and %s by local source ID even when the dialog arrives first',
  async (parentKind, dialogKind) => {
    const { manager, user } = fixture();
    const dialog = await createDiaryStat(manager, dialogKind, user, {
      entryId: 'source-1', aiTraceId: 'dialog-cycle',
    });
    const parent = await createDiaryStat(manager, parentKind, user, {
      entryId: 'source-1', aiTraceId: 'entry-cycle',
    });
    const otherUser = await createDiaryStat(manager, parentKind, { id: 99 } as any, {
      entryId: 'source-1', aiTraceId: 'entry-cycle',
    });
    expect(dialog.stat.entryId).toBe(parent.stat.entryId);
    expect(dialog.stat.user.id).toBe(parent.stat.user.id);
    expect(otherUser.created).toBe(true);
    expect(otherUser.stat.user.id).toBe(99);
  },
);

it('backfills a missing source on replay without duplicating or reassigning it', async () => {
  const { manager, user } = fixture();
  const first = await createDiaryStat(manager, 'dialog', user, { aiTraceId: 'cycle' });
  expect(first.stat.entryId).toBeNull();
  const replay = await createDiaryStat(manager, 'dialog', user, {
    aiTraceId: 'cycle', entryId: 'source-1',
  });
  expect(replay.created).toBe(false);
  expect(replay.stat).toMatchObject({ id: first.stat.id, entryId: 'source-1' });
  const changed = await createDiaryStat(manager, 'dialog', user, {
    aiTraceId: 'cycle', entryId: 'source-2',
  });
  expect(changed.stat.entryId).toBe('source-1');
});
