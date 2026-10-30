import 'reflect-metadata';
import {
  afterAll,
  afterEach,
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
import { DataSource } from 'typeorm';
import { Logger } from '@nestjs/common';
import { AddPurchaseNotifications1793340000000 } from '../migrations/1793340000000-AddPurchaseNotifications';
import { PurchaseNotificationsService } from './purchase-notifications.service';
import { GooglePlayPaymentFinanceService } from './google-play-payment-finance.service';
import { sendPurchasesTelegram } from '../telegram/send-telegram';

jest.mock('../telegram/send-telegram', () => ({
  sendPurchasesTelegram: jest.fn(),
}));
const container = process.env.PURCHASE_NOTIFICATIONS_POSTGRES_CONTAINER;
const pgDescribe = container ? describe : describe.skip;

pgDescribe(
  'purchase delivery with real PostgreSQL claims and transactions',
  () => {
    const schema = `purchase_notifications_${randomUUID().replace(/-/g, '')}`;
    const env = process.env;
    let admin: Client;
    let db: DataSource;
    const sender = sendPurchasesTelegram as jest.Mock<any>;
    const migration = new AddPurchaseNotifications1793340000000();
    beforeAll(async () => {
      if (!/^[a-zA-Z0-9_.-]+$/.test(container!))
        throw new Error('Invalid test container');
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
      if (!username || !password || !port)
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
      db = new DataSource({
        type: 'postgres',
        host: '127.0.0.1',
        port,
        username,
        password,
        database: 'postgres',
        schema,
        extra: {
          max: 5,
          options: `-c search_path=${schema} -c statement_timeout=10000`,
        },
      });
      await db.initialize();
      await db.query(`CREATE TABLE users (id int PRIMARY KEY, name text);
      CREATE TABLE user_settings ("userId" int UNIQUE, model text, platform text, "osVersion" text, "appVersion" text, "appBuild" int);
      INSERT INTO users VALUES (1,'Test person');
      INSERT INTO user_settings VALUES (1,'Test phone','android','14','2.0',20)`);
      for (const table of ['payments', 'credit_purchases']) {
        await db.query(`CREATE TABLE ${table} (id serial PRIMARY KEY, "userId" int DEFAULT 1,
        "orderId" text UNIQUE, "orderState" text, amount numeric(30,9), currency text,
        "productId" text, "basePlanId" text, "testPurchase" boolean DEFAULT false,
        status text, "creditsGranted" int DEFAULT 0, "creditsRevoked" int DEFAULT 0,
        platform text, "regionCode" text, "planId" int, provider text, "packageName" text,
        "financialDetailsPending" boolean DEFAULT false)`);
      }
      // Real rows already present before the migration must remain historical.
      await db.query(
        `INSERT INTO payments ("orderId","orderState") VALUES ('historical','PROCESSED')`,
      );
      const runner = db.createQueryRunner();
      try {
        await migration.up(runner);
        await migration.up(runner);
      } finally {
        await runner.release();
      }
    });
    afterAll(async () => {
      if (db?.isInitialized) await db.destroy();
      if (admin) {
        await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        await admin.end();
      }
    });
    beforeEach(() => {
      jest.clearAllMocks();
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      process.env = {
        ...env,
        TELEGRAM_NEW_SUBSCRIPTIONS_ENABLED: 'true',
        TELEGRAM_NEW_SUBSCRIPTIONS_BOT_TOKEN: 'test',
        TELEGRAM_NEW_SUBSCRIPTIONS_CHAT_ID: 'test',
      };
      sender.mockResolvedValue(undefined);
    });
    afterEach(async () => {
      process.env = env;
      jest.restoreAllMocks();
      await db.query(
        `DELETE FROM payments WHERE "orderId" <> 'historical'; DELETE FROM credit_purchases`,
      );
    });
    async function insertCredit(order: string, state = 'CONSUMED') {
      return (
        await db.query(
          `INSERT INTO credit_purchases ("orderId",status,"creditsGranted","purchaseNotificationState") VALUES ($1,$2,20000,'pending') RETURNING id`,
          [order, state],
        )
      )[0].id;
    }
    const deliver = () => new PurchaseNotificationsService(db).deliverPending();

    it('migration is repeatable and never announces existing payments', async () => {
      await deliver();
      expect(sender).not.toHaveBeenCalled();
      expect(
        (
          await db.query(
            `SELECT "purchaseNotificationState" FROM payments WHERE "orderId"='historical'`,
          )
        )[0].purchaseNotificationState,
      ).toBeNull();
    });
    it('two workers claim each purchase once; a restarted worker does not resend', async () => {
      await insertCredit('paid');
      await Promise.all([deliver(), deliver()]);
      await deliver();
      expect(sender).toHaveBeenCalledTimes(1);
      expect(sender).toHaveBeenCalledWith(
        expect.stringContaining('Модель: Test phone'),
      );
      const [purchase] = await db.query(
        `SELECT "purchaseNotificationState",status,"creditsGranted","creditsRevoked" FROM credit_purchases`,
      );
      expect(purchase).toEqual({
        purchaseNotificationState: 'sent',
        status: 'CONSUMED',
        creditsGranted: 20000,
        creditsRevoked: 0,
      });
    });
    it('failed delivery waits for retry, then succeeds without changing billing', async () => {
      await insertCredit('retry');
      sender.mockRejectedValueOnce(new Error('Telegram unavailable'));
      await deliver();
      await deliver();
      expect(sender).toHaveBeenCalledTimes(1);
      await db.query(
        `UPDATE credit_purchases SET "purchaseNotificationAttemptAt"=now()-interval '6 minutes'`,
      );
      await deliver();
      await deliver();
      expect(sender).toHaveBeenCalledTimes(2);
      expect(
        (
          await db.query(
            `SELECT "purchaseNotificationState" FROM credit_purchases`,
          )
        )[0].purchaseNotificationState,
      ).toBe('sent');
    });
    it('reclaims a stale lease after a crash but ignores current leases', async () => {
      await insertCredit('crashed');
      await db.query(
        `UPDATE credit_purchases SET "purchaseNotificationState"='sending',"purchaseNotificationAttemptAt"=now()`,
      );
      await deliver();
      expect(sender).not.toHaveBeenCalled();
      await db.query(
        `UPDATE credit_purchases SET "purchaseNotificationAttemptAt"=now()-interval '6 minutes'`,
      );
      await deliver();
      expect(sender).toHaveBeenCalledTimes(1);
    });
    it('skips cancelled/refunded/ungranted credits and unpaid subscription orders', async () => {
      await insertCredit('refund', 'REFUNDED');
      await insertCredit('cancel', 'CANCELLED');
      await insertCredit('revoked');
      await insertCredit('zero');
      await db.query(`UPDATE credit_purchases SET "creditsRevoked"=20000 WHERE "orderId"='revoked';
      UPDATE credit_purchases SET "creditsGranted"=0 WHERE "orderId"='zero';
      INSERT INTO payments ("orderId","orderState","purchaseNotificationState") VALUES ('pending','PENDING','pending'),('cancelled','CANCELED','pending')`);
      await deliver();
      expect(sender).not.toHaveBeenCalled();
    });
    it('real subscription enqueue/upsert queues only the first order insertion', async () => {
      const finance = new GooglePlayPaymentFinanceService(db, {} as any);
      const sub = {
        lastOrderId: 'subscription',
        provider: 'GOOGLE_PLAY',
        platform: 'android',
        regionCode: 'UA',
        userId: 1,
        legacyPlanId: null,
        basePlanId: 'lite-m1',
        productId: 'nemory',
        currency: 'UAH',
      } as any;
      await db.transaction((m) => finance.enqueue(m, sub, 'test.package'));
      await deliver();
      expect(sender).not.toHaveBeenCalled();
      await db.query(
        `UPDATE payments SET "orderState"='PROCESSED',amount=10 WHERE "orderId"='subscription'`,
      );
      await deliver();
      expect(sender).toHaveBeenCalledTimes(1);
      await db.transaction((m) => finance.enqueue(m, sub, 'test.package'));
      await deliver();
      expect(sender).toHaveBeenCalledTimes(1);
      await db.transaction((m) =>
        finance.enqueue(
          m,
          { ...sub, lastOrderId: 'historical' },
          'test.package',
        ),
      );
      await deliver();
      expect(sender).toHaveBeenCalledTimes(1);
    });
    it('rolled-back payments cannot produce a notification', async () => {
      const finance = new GooglePlayPaymentFinanceService(db, {} as any);
      await expect(
        db.transaction(async (m) => {
          await finance.enqueue(
            m,
            {
              lastOrderId: 'rollback',
              provider: 'GOOGLE_PLAY',
              userId: 1,
            } as any,
            'test.package',
          );
          throw new Error('grant failed');
        }),
      ).rejects.toThrow('grant failed');
      await deliver();
      expect(sender).not.toHaveBeenCalled();
    });
  },
);
