import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource, EntityManager } from 'typeorm';
import { sendPurchasesTelegram } from '../telegram/send-telegram';

type PurchaseKind = 'subscription' | 'credits';
export type PurchaseAnnouncement = {
  id: number;
  attempt: string;
  userId: number;
  userName: string | null;
  model: string | null;
  platform: string | null;
  osVersion: string | null;
  appVersion: string | null;
  appBuild: number | null;
  productId: string | null;
  basePlanId: string | null;
  credits: number | null;
  orderId: string | null;
  amount: string | null;
  currency: string | null;
  testPurchase: boolean;
};

// Plain text, bounded individual fields; never include raw store/user objects.
const label = (value: string | number | null | undefined): string =>
  value == null || value === ''
    ? 'невідомо'
    : String(value)
        .replace(/\p{Cc}/gu, ' ')
        .slice(0, 255);

export function formatPurchaseAnnouncement(
  kind: PurchaseKind,
  row: PurchaseAnnouncement,
): string {
  return [
    kind === 'credits' ? '💳 Купівля AI-кредитів' : '💳 Оплата підписки',
    ...(row.testPurchase ? ['🧪 Тестова покупка Google Play'] : []),
    `Користувач: ${label(row.userName)} (ID ${row.userId})`,
    'Пристрій — останні збережені дані акаунта:',
    `Модель: ${label(row.model)}`,
    `ОС: ${label(row.platform)} ${label(row.osVersion)}`,
    `Застосунок: ${label(row.appVersion)} (build ${label(row.appBuild)})`,
    kind === 'credits'
      ? `Кредити: ${row.credits}`
      : `Тариф: ${label(row.basePlanId)}`,
    `Продукт: ${label(row.productId)}`,
    `Сума: ${
      row.amount != null && row.currency
        ? `${label(row.amount)
            .replace(/(\.\d*?)0+$/, '$1')
            .replace(/\.$/, '')} ${label(row.currency)}`
        : 'ще уточнюється'
    }`,
    `Замовлення: ${label(row.orderId)}`,
    `Подія: ${kind}:${row.id}`,
  ].join('\n');
}

const tableFor = (kind: PurchaseKind) =>
  kind === 'credits' ? 'credit_purchases' : 'payments';

@Injectable()
export class PurchaseNotificationsService {
  private running = false;
  private readonly logger = new Logger(PurchaseNotificationsService.name);

  constructor(private readonly db: DataSource) {}

  /** Local durable delivery queue only: no Google calls, no entitlement changes. */
  @Cron(CronExpression.EVERY_MINUTE)
  async deliverPending(): Promise<void> {
    if (
      this.running ||
      process.env.TELEGRAM_NEW_SUBSCRIPTIONS_ENABLED !== 'true' ||
      !process.env.TELEGRAM_NEW_SUBSCRIPTIONS_BOT_TOKEN ||
      !process.env.TELEGRAM_NEW_SUBSCRIPTIONS_CHAT_ID
    )
      return;
    this.running = true;
    try {
      for (const kind of ['subscription', 'credits'] as const) {
        for (let batch = 0; batch < 20; batch++) {
          const row = await this.db.transaction((manager) =>
            this.claim(manager, kind),
          );
          if (!row) break;
          try {
            await sendPurchasesTelegram(formatPurchaseAnnouncement(kind, row));
            await this.db.query(
              `UPDATE ${tableFor(kind)} SET "purchaseNotificationState"='sent'
              WHERE id=$1 AND "purchaseNotificationState"='sending'
              AND "purchaseNotificationAttemptAt"=$2::timestamptz`,
              [row.id, row.attempt],
            );
          } catch {
            // Keep a durable retry lease. Never log Axios errors (bot token/text).
            this.logger.warn(
              `Purchase notification pending retry (${kind}:${row.id})`,
            );
          }
        }
      }
    } catch {
      this.logger.warn(
        'Purchase notification queue unavailable; payments unchanged',
      );
    } finally {
      this.running = false;
    }
  }

  private async claim(
    manager: EntityManager,
    kind: PurchaseKind,
  ): Promise<PurchaseAnnouncement | null> {
    const table = tableFor(kind);
    const eligible =
      kind === 'credits'
        ? `p.status IN ('PURCHASED','CONSUMED') AND p."creditsGranted">0 AND p."creditsRevoked"=0`
        : `p."orderState"='PROCESSED' AND p."orderId" IS NOT NULL`;
    const rows = await manager.query<PurchaseAnnouncement[]>(`
      WITH candidate AS (
        SELECT p.id FROM ${table} p
        WHERE p."purchaseNotificationState" IN ('pending','sending')
          AND (p."purchaseNotificationAttemptAt" IS NULL OR p."purchaseNotificationAttemptAt" < now()-interval '5 minutes')
          AND p."userId" IS NOT NULL AND ${eligible}
        ORDER BY p."purchaseNotificationAttemptAt" ASC NULLS FIRST, p.id
        LIMIT 1 FOR UPDATE SKIP LOCKED
      ), claimed AS (
        UPDATE ${table} p SET "purchaseNotificationState"='sending', "purchaseNotificationAttemptAt"=clock_timestamp()
        FROM candidate c WHERE p.id=c.id RETURNING p.*
      )
      SELECT p.id, p."purchaseNotificationAttemptAt"::text AS attempt,
        p."userId", u.name AS "userName", s.model, s.platform, s."osVersion", s."appVersion", s."appBuild",
        p."productId", ${kind === 'credits' ? 'NULL::text' : 'p."basePlanId"'} AS "basePlanId",
        ${kind === 'credits' ? 'p."creditsGranted"' : 'NULL::int'} AS credits,
        p."orderId", p.amount::text, p.currency, p."testPurchase"
      FROM claimed p LEFT JOIN users u ON u.id=p."userId"
        LEFT JOIN user_settings s ON s."userId"=p."userId"`);
    return rows[0] ?? null;
  }
}
