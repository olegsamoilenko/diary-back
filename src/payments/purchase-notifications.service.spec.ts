import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { Logger } from '@nestjs/common';
import axios from 'axios';
import { sendPurchasesTelegram } from '../telegram/send-telegram';
import {
  formatPurchaseAnnouncement,
  PurchaseAnnouncement,
  PurchaseNotificationsService,
} from './purchase-notifications.service';

jest.mock('axios', () => ({ post: jest.fn() }));
const row: PurchaseAnnouncement = {
  id: 4,
  attempt: '2026-10-30 10:00:00.123456+00',
  userId: 8,
  userName: '<b>Test</b>\nname',
  model: 'Samsung',
  platform: 'android',
  osVersion: '14',
  appVersion: '2.0',
  appBuild: 20,
  productId: 'nemory_credits_20000',
  basePlanId: 'lite-m1',
  credits: 20000,
  orderId: 'GPA.test',
  amount: '479.99',
  currency: 'UAH',
  testPurchase: true,
};
describe('purchase Telegram delivery isolation', () => {
  const env = process.env;
  let warn: any;
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...env,
      TELEGRAM_NEW_SUBSCRIPTIONS_ENABLED: 'true',
      TELEGRAM_NEW_SUBSCRIPTIONS_BOT_TOKEN: 'test-token',
      TELEGRAM_NEW_SUBSCRIPTIONS_CHAT_ID: '-100123',
    };
    warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    (axios.post as jest.Mock<any>).mockResolvedValue({ data: { ok: true } });
  });
  afterEach(() => {
    process.env = env;
    jest.restoreAllMocks();
  });

  it('sends plain text to the dedicated destination with a bounded transport', async () => {
    await sendPurchasesTelegram(formatPurchaseAnnouncement('credits', row));
    expect(axios.post).toHaveBeenCalledWith(
      'https://api.telegram.org/bottest-token/sendMessage',
      {
        chat_id: '-100123',
        text: expect.stringContaining('Кредити: 20000'),
        link_preview_options: { is_disabled: true },
      },
      { timeout: 30000 },
    );
  });
  it('does not fall back to other channels when its destination is missing', async () => {
    delete process.env.TELEGRAM_NEW_SUBSCRIPTIONS_CHAT_ID;
    process.env.TELEGRAM_PLANS_CHAT_ID = 'other';
    await expect(sendPurchasesTelegram('test')).rejects.toThrow(
      'not configured',
    );
    const db = { transaction: jest.fn() };
    await new PurchaseNotificationsService(db as any).deliverPending();
    expect(axios.post).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
  });
  it('does no queue work before explicit enablement', async () => {
    delete process.env.TELEGRAM_NEW_SUBSCRIPTIONS_ENABLED;
    const db = { transaction: jest.fn() };
    await new PurchaseNotificationsService(db as any).deliverPending();
    expect(db.transaction).not.toHaveBeenCalled();
    expect(axios.post).not.toHaveBeenCalled();
  });
  it('rejects an unsuccessful Telegram API body even with successful HTTP', async () => {
    (axios.post as jest.Mock<any>).mockResolvedValue({ data: { ok: false } });
    await expect(sendPurchasesTelegram('test')).rejects.toThrow('rejected');
  });
  it('whitelists fields, marks test purchases and labels last-known device information', () => {
    const text = formatPurchaseAnnouncement('subscription', {
      ...row,
      purchaseToken: 'SECRET',
      email: 'PRIVATE',
      rawStoreData: 'RAW',
    } as any);
    expect(text).toContain('Тестова покупка');
    expect(text).toContain('останні збережені');
    expect(text).toContain('<b>Test</b> name');
    expect(text).toContain('Тариф: lite-m1');
    expect(text).not.toMatch(/SECRET|PRIVATE|RAW/);
  });
  it('handles missing device and amount without inventing values or overflowing Telegram', () => {
    const text = formatPurchaseAnnouncement('credits', {
      ...row,
      userName: 'x'.repeat(10000),
      model: null,
      amount: null,
      testPurchase: false,
    });
    expect(text).toContain('Модель: невідомо');
    expect(text).toContain('Сума: ще уточнюється');
    expect(text).not.toContain('Тестова покупка');
    expect(text.length).toBeLessThan(4096);
  });
  it('prints exact decimals without database scale padding', () => {
    expect(
      formatPurchaseAnnouncement('credits', {
        ...row,
        amount: '479.990000000',
      }),
    ).toContain('Сума: 479.99 UAH');
    expect(
      formatPurchaseAnnouncement('credits', {
        ...row,
        amount: '100.000000000',
      }),
    ).toContain('Сума: 100 UAH');
    expect(
      formatPurchaseAnnouncement('credits', { ...row, amount: '0.000000001' }),
    ).toContain('Сума: 0.000000001 UAH');
  });
  it.each([true, false])(
    'marks delivery only on success (success=%s) and preserves the exact claim timestamp',
    async (success) => {
      if (!success)
        (axios.post as jest.Mock<any>).mockRejectedValue({
          config: { url: 'SECRET' },
          data: 'PRIVATE',
        });
      const db = {
        transaction: jest
          .fn<any>()
          .mockResolvedValueOnce(row)
          .mockResolvedValue(null),
        query: jest.fn<any>().mockResolvedValue([]),
      };
      await expect(
        new PurchaseNotificationsService(db as any).deliverPending(),
      ).resolves.toBeUndefined();
      if (success)
        expect(db.query).toHaveBeenCalledWith(
          expect.stringContaining("='sent'"),
          [row.id, row.attempt],
        );
      else expect(db.query).not.toHaveBeenCalled();
      expect(JSON.stringify(warn.mock.calls)).not.toMatch(/SECRET|PRIVATE/);
    },
  );
  it('catches a queue failure and allows the next run', async () => {
    const db = {
      transaction: jest
        .fn<any>()
        .mockRejectedValueOnce(new Error('DB'))
        .mockResolvedValue(null),
    };
    const service = new PurchaseNotificationsService(db as any);
    await service.deliverPending();
    await service.deliverPending();
    expect(db.transaction).toHaveBeenCalledTimes(3);
    expect(axios.post).not.toHaveBeenCalled();
  });
  it('starts targeted delivery next event-loop turn without waiting for Telegram', async () => {
    let finish!: (value: unknown) => void;
    (axios.post as jest.Mock<any>).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const manager = { query: jest.fn<any>().mockResolvedValue([row]) };
    const db = {
      transaction: jest.fn<any>().mockImplementation((work) => work(manager)),
      query: jest.fn<any>().mockResolvedValue([]),
    };
    const service = new PurchaseNotificationsService(db as any);
    expect(service.requestDelivery('credits', row.id)).toBeUndefined();
    expect(db.transaction).not.toHaveBeenCalled();
    await new Promise(setImmediate);
    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('AND p.id=$1'),
      [row.id],
    );
    expect(db.query).not.toHaveBeenCalled();
    finish({ data: { ok: true } });
    await new Promise(setImmediate);
    expect(db.query).toHaveBeenCalledTimes(1);
  });
  it('catches an immediate queue failure, leaving cron recovery available', async () => {
    const db = {
      transaction: jest
        .fn<any>()
        .mockRejectedValueOnce(new Error('PRIVATE'))
        .mockResolvedValue(null),
    };
    const service = new PurchaseNotificationsService(db as any);
    service.requestDelivery('credits', row.id);
    await new Promise(setImmediate);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('queued for recovery'),
    );
    expect(JSON.stringify(warn.mock.calls)).not.toContain('PRIVATE');
    await service.deliverPending();
    expect(db.transaction).toHaveBeenCalledTimes(3);
  });
});
