import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource, EntityManager } from 'typeorm';
import { GooglePlaySubscriptionsService } from '../iap/google-play-subscriptions.service';
import { StoreSubscription } from '../subscriptions/entities/store-subscription.entity';
import { StoreSubscriptionProvider } from '../subscriptions/types';
import {
  googleMoneyDecimal,
  googleOrderDeductions,
} from './google-order-finance';

@Injectable()
export class GooglePlayPaymentFinanceService {
  private running = false;
  private readonly logger = new Logger(GooglePlayPaymentFinanceService.name);
  constructor(
    private readonly db: DataSource,
    private readonly google: GooglePlaySubscriptionsService,
  ) {}

  /** Transactional order registration only; no Google I/O while granting access. */
  async enqueue(
    manager: EntityManager,
    subscription: StoreSubscription,
    packageName: string,
  ) {
    if (
      !subscription.lastOrderId ||
      subscription.provider !== StoreSubscriptionProvider.GOOGLE_PLAY
    )
      return;
    await manager.query(
      `INSERT INTO payments
      (platform, "regionCode", "orderId", amount, currency, "userId", "planId", provider,
       "basePlanId", "productId", "packageName", "testPurchase", "financialDetailsPending")
      VALUES ($1,$2,$3,NULL,$4,$5,$6,'GOOGLE_PLAY',$7,$8,$9,$10,true)
      ON CONFLICT ("orderId") DO UPDATE SET "financialDetailsPending"=true,
        "packageName"=EXCLUDED."packageName", "testPurchase"=EXCLUDED."testPurchase",
        "basePlanId"=COALESCE(payments."basePlanId",EXCLUDED."basePlanId"),
        "productId"=COALESCE(payments."productId",EXCLUDED."productId")`,
      [
        subscription.platform,
        subscription.regionCode,
        subscription.lastOrderId,
        subscription.currency || 'USD',
        subscription.userId,
        subscription.legacyPlanId,
        subscription.basePlanId,
        subscription.productId,
        packageName,
        !!subscription.rawStoreData?.testPurchase,
      ],
    );
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async syncPending(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const rows = await this.db.query<
        {
          id: number;
          orderId: string;
          productId: string | null;
          packageName: string | null;
        }[]
      >(
        `SELECT id, "orderId", "productId", "packageName" FROM payments
         WHERE "financialDetailsPending" AND "orderId" IS NOT NULL
           AND ("financialDetailsLastAttemptAt" IS NULL OR "financialDetailsLastAttemptAt" < now()-interval '10 minutes')
         ORDER BY "financialDetailsLastAttemptAt" ASC NULLS FIRST, id LIMIT 50`,
      );
      let cursor = 0;
      await Promise.all(
        Array.from({ length: Math.min(4, rows.length) }, async () => {
          while (cursor < rows.length) {
            const row = rows[cursor++];
            try {
              const claimed = await this.db.query<{ id: number }[]>(
                `UPDATE payments SET "financialDetailsLastAttemptAt"=now()
              WHERE id=$1 AND "financialDetailsPending"
              AND ("financialDetailsLastAttemptAt" IS NULL OR "financialDetailsLastAttemptAt" < now()-interval '10 minutes') RETURNING id`,
                [row.id],
              );
              if (!claimed.length) continue;
              const { data: order } = await this.google.android.orders.get(
                {
                  packageName:
                    row.packageName ||
                    process.env.GOOGLE_PLAY_PACKAGE_NAME ||
                    'com.soniac12.nemory',
                  orderId: row.orderId,
                  fields:
                    'orderId,state,total,tax,developerRevenueInBuyerCurrency,createTime,orderHistory(processedEvent),lineItems(productId,subscriptionDetails(basePlanId))',
                },
                { timeout: 5000, retry: false },
              );
              if (
                order.orderId !== row.orderId ||
                order.lineItems?.length !== 1 ||
                (row.productId &&
                  order.lineItems[0].productId !== row.productId)
              )
                throw new Error('Order mismatch');
              const line = order.lineItems[0];
              if (!line.subscriptionDetails?.basePlanId)
                throw new Error('Not a subscription payment');
              const state = order.state ?? '';
              if (
                ![
                  'PROCESSED',
                  'PENDING',
                  'PENDING_REFUND',
                  'PARTIALLY_REFUNDED',
                  'REFUNDED',
                  'CANCELED',
                ].includes(state)
              )
                throw new Error('Unknown order state');
              const paidAt =
                order.orderHistory?.processedEvent?.eventTime ??
                order.createTime;
              if (
                !paidAt ||
                !Number.isFinite(Date.parse(paidAt)) ||
                !order.total ||
                !/^[A-Z]{3}$/.test(order.total.currencyCode ?? '')
              )
                throw new Error('Incomplete payment details');
              const amount = googleMoneyDecimal(order.total);
              if (amount.startsWith('-')) throw new Error('Invalid total');
              const details = googleOrderDeductions(
                order,
                order.total.currencyCode!,
              );
              await this.db.query(
                `UPDATE payments SET amount=$2, currency=$3, "developerRevenue"=$4,
              "taxAmount"=$5, "orderState"=$6, "createdAt"=$7, "basePlanId"=$8, "productId"=$9,
              "financialDetailsPending"=$10 WHERE id=$1 AND "financialDetailsPending"`,
                [
                  row.id,
                  amount,
                  order.total.currencyCode,
                  details.developerRevenue,
                  details.taxAmount,
                  state,
                  paidAt,
                  line.subscriptionDetails.basePlanId,
                  line.productId,
                  details.developerRevenue === null ||
                    state === 'PENDING' ||
                    state === 'PENDING_REFUND',
                ],
              );
            } catch {
              this.logger.warn(
                `Payment ${row.id}: financial details pending retry`,
              );
            }
          }
        }),
      );
    } finally {
      this.running = false;
    }
  }
}
