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
jest.mock('expo-server-sdk', () => ({ Expo: class {} }));
import { UserReminder } from './entities/user-reminder.entity';
import { UserRemindersService } from './user-reminders.service';

// Opt-in local Docker only. Random schema in maintenance DB, no app .env,
// application tables, real users/tokens, network push, or application cron.
const container = process.env.NA64_POSTGRES_CONTAINER;
const pgDescribe = container ? describe : describe.skip;
pgDescribe('NA-64 real PostgreSQL reminder claims', () => {
  const schema = `na64_${randomUUID().replace(/-/g, '')}`;
  let admin: Client;
  let a: DataSource;
  let b: DataSource;
  const push = {
    sendNemoryReminderPushBatch:
      jest.fn<(rows: any[]) => Promise<Set<string>>>(),
  };
  let worker: UserRemindersService;
  let editor: UserRemindersService;
  const columns = Object.fromEntries(
    getMetadataArgsStorage()
      .columns.filter((column) => column.target === UserReminder)
      .map((column) => [
        column.propertyName,
        {
          name: column.options.name,
          length: column.options.length,
          nullable: column.options.nullable,
          default: column.options.default,
          // Fixture IDs are explicit; do not install a UUID extension.
          generated: undefined,
          type:
            column.options.type ??
            Reflect.getMetadata(
              'design:type',
              UserReminder.prototype,
              column.propertyName,
            ),
          ...(column.propertyName === 'id' ? { primary: true } : {}),
          ...(column.mode === 'createDate' ? { createDate: true } : {}),
          ...(column.mode === 'updateDate' ? { updateDate: true } : {}),
        },
      ]),
  );

  beforeAll(async () => {
    if (!/^[a-zA-Z0-9_.-]+$/.test(container!))
      throw new Error('Invalid local test container');
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
      throw new Error('Local fixture unavailable');
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
        new EntitySchema({
          name: UserReminder.name,
          target: UserReminder,
          tableName: 'user_reminders',
          columns,
        }),
      ],
      extra: {
        max: 2,
        options: `-c search_path=${schema} -c statement_timeout=10000`,
      },
    };
    a = await new DataSource(config).initialize();
    await a.synchronize();
    b = await new DataSource(config).initialize();
    worker = new UserRemindersService(
      a.getRepository(UserReminder),
      a,
      push as any,
    );
    editor = new UserRemindersService(
      b.getRepository(UserReminder),
      b,
      push as any,
    );
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
    await a.query('TRUNCATE user_reminders');
    push.sendNemoryReminderPushBatch.mockReset().mockResolvedValue(new Set());
  });
  async function seed(extra: Partial<UserReminder> = {}) {
    return a.getRepository(UserReminder).save({
      id: randomUUID(),
      userId: 7,
      reminderKey: 'entry:entry-test:reminder.test',
      sourceType: 'entry',
      sourceId: 'entry-test',
      title: 'Synthetic',
      body: 'Test only',
      scheduledAt: new Date(Date.now() - 60000),
      localDate: '2026-10-29',
      localTime: '10:00',
      timezone: 'UTC',
      status: 'pending',
      attempts: 0,
      ...extra,
    });
  }
  const read = (id: string) =>
    b.getRepository(UserReminder).findOneByOrFail({ id });
  function delayedPush() {
    let started!: () => void;
    let finish!: (ids: Set<string>) => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const result = new Promise<Set<string>>((resolve) => {
      finish = resolve;
    });
    push.sendNemoryReminderPushBatch.mockImplementationOnce(async () => {
      started();
      return result;
    });
    return { ready, finish };
  }

  it.each([false, true])(
    'keeps cancellation after old push accepted=%s',
    async (accepted) => {
      const row = await seed();
      const gate = delayedPush();
      const processing = worker.processDueReminders();
      await gate.ready;
      try {
        expect((await editor.cancel(7, row.id))?.status).toBe('cancelled');
      } finally {
        gate.finish(new Set(accepted ? [row.id] : []));
        await processing;
      }
      expect(await read(row.id)).toMatchObject({
        status: 'cancelled',
        attempts: 0,
        lockedAt: null,
        sentAt: null,
      });
      expect(await worker.processDueReminders()).toBe(0);
      expect(push.sendNemoryReminderPushBatch).toHaveBeenCalledTimes(1);
    },
  );

  it.each([false, true])(
    'preserves reschedule after old push accepted=%s',
    async (accepted) => {
      const row = await seed();
      const gate = delayedPush();
      const processing = worker.processDueReminders();
      await gate.ready;
      const future = new Date(Date.now() + 3600000);
      try {
        await editor.applyExtraction(7, {
          sourceType: 'entry',
          sourceId: 'entry-test',
          timezone: 'UTC',
          reminders: [
            {
              reminderKey: 'reminder.test',
              body: 'Rescheduled',
              scheduledAt: future.toISOString(),
              localDate: '2026-10-29',
              localTime: '11:00',
            },
          ],
          updates: [],
        });
      } finally {
        gate.finish(new Set(accepted ? [row.id] : []));
        await processing;
      }
      expect(await read(row.id)).toMatchObject({
        status: 'pending',
        scheduledAt: future,
        body: 'Rescheduled',
        attempts: 0,
        sentAt: null,
      });
      expect(await worker.processDueReminders()).toBe(0);
    },
  );

  it('keeps cancellation from the legacy extraction updates path', async () => {
    const row = await seed();
    const gate = delayedPush();
    const processing = worker.processDueReminders();
    await gate.ready;
    try {
      await editor.applyExtraction(7, {
        sourceType: 'entry',
        sourceId: 'entry-test',
        timezone: 'UTC',
        reminders: [],
        updates: [{ reminderKey: 'reminder.test', status: 'cancelled' }],
      });
    } finally {
      gate.finish(new Set());
      await processing;
    }
    expect((await read(row.id)).status).toBe('cancelled');
  });

  it('does not recreate a reminder transferred to the phone during push', async () => {
    const row = await seed();
    const gate = delayedPush();
    const processing = worker.processDueReminders();
    await gate.ready;
    try {
      await editor.forgetTransferred(7, row.id);
    } finally {
      gate.finish(new Set());
      await processing;
    }
    expect(await a.getRepository(UserReminder).count()).toBe(0);
  });

  it.each([false, true])(
    'ignores old result while a reclaimed attempt is processing, accepted=%s',
    async (accepted) => {
      const row = await seed();
      const oldGate = delayedPush();
      const old = worker.processDueReminders();
      await oldGate.ready;
      // Simulate elapsed lock age, without waiting or changing the production timeout.
      await b.query(
        "UPDATE user_reminders SET locked_at = NOW() - INTERVAL '6 minutes' WHERE id=$1",
        [row.id],
      );
      const newGate = delayedPush();
      const current = editor.processDueReminders();
      await newGate.ready;
      try {
        oldGate.finish(new Set(accepted ? [row.id] : []));
        await old;
        expect((await read(row.id)).status).toBe('processing');
      } finally {
        newGate.finish(new Set([row.id]));
        await current;
      }
      expect(await read(row.id)).toMatchObject({ status: 'sent', attempts: 0 });
    },
  );

  it('retries a transient failure normally and then marks the accepted push sent', async () => {
    const row = await seed();
    await worker.processDueReminders();
    expect(await read(row.id)).toMatchObject({
      status: 'pending',
      attempts: 1,
    });
    push.sendNemoryReminderPushBatch.mockResolvedValue(new Set([row.id]));
    await worker.processDueReminders();
    expect(await read(row.id)).toMatchObject({ status: 'sent', attempts: 1 });
  });

  it('retains the existing retry exhaustion and stops processing failed rows', async () => {
    const row = await seed();
    for (let i = 0; i < 3; i++) await worker.processDueReminders();
    expect(await read(row.id)).toMatchObject({ status: 'failed', attempts: 3 });
    expect(await worker.processDueReminders()).toBe(0);
    expect(push.sendNemoryReminderPushBatch).toHaveBeenCalledTimes(3);
  });

  it('recovers an abandoned lock after a batch exception', async () => {
    const row = await seed();
    push.sendNemoryReminderPushBatch.mockRejectedValueOnce(
      new Error('synthetic batch failure'),
    );
    await expect(worker.processDueReminders()).rejects.toThrow(
      'synthetic batch failure',
    );
    await b.query(
      "UPDATE user_reminders SET locked_at = NOW() - INTERVAL '6 minutes' WHERE id=$1",
      [row.id],
    );
    push.sendNemoryReminderPushBatch.mockResolvedValue(new Set([row.id]));
    await worker.processDueReminders();
    expect((await read(row.id)).status).toBe('sent');
  });
});
