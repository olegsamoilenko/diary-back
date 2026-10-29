import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { androidpublisher_v3 } from 'googleapis';
import { GooglePlaySubscriptionsService } from '../iap/google-play-subscriptions.service';
import {
  googleMoneyDecimal,
  resolveCreditPurchaseFinancialDetails,
} from '../credits/credit-purchase-finance';
import { FxRatesService } from './fx-rates.service';
import {
  configuredCreditFee,
  googleOrderDeductions,
  resolveDeveloperRevenue,
} from '../payments/google-order-finance';
import {
  aggregateFinance,
  FinanceReceipt,
  financeDay,
  financeRange,
  FINANCE_PRODUCTS,
} from './admin-finance-report';

// Active US prices read from Google Play, 2026-10-28. Estimates, never receipts.
const planFallback: Record<string, string> = {
  'ad-free-m1': '2.49',
  'ad-free-y1': '17.99',
  'lite-m1': '5.99',
  'base-m1': '11.99',
  'pro-m1': '23.99',
};
type OrderCandidate = {
  orderId: string;
  product: string;
  observedAt: string;
  test: boolean;
  package: string | null;
};
type PaymentRow = {
  id: number;
  orderId: string | null;
  product: string;
  amount: string | null;
  currency: string;
  createdAt: string;
  developerRevenue: string | null;
  taxAmount: string | null;
  testPurchase: boolean;
  orderState: string | null;
};
type CreditRow = {
  id: number;
  productId: string;
  quantity: number;
  amount: string | null;
  currency: string | null;
  date: string;
  testPurchase: boolean;
  orderId: string | null;
  developerRevenue: string | null;
  taxAmount: string | null;
};

export const FINANCE_ORDER_CANDIDATES_SQL = `WITH sources AS (
  SELECT "lastOrderId" AS "orderId", "basePlanId" AS product,
    COALESCE("startTime", "createdAt") AS "observedAt",
    COALESCE("rawStoreData" ? 'testPurchase', false) AS test, NULL::text AS package
  FROM store_subscriptions WHERE NULLIF("lastOrderId", '') IS NOT NULL
  UNION ALL
  SELECT COALESCE(NULLIF("orderId", ''), "googleOrderId"), COALESCE("basePlanId", "googleBasePlanId"), "createdAt",
    COALESCE(metadata->>'testPurchase' = 'true', false), metadata->>'packageName'
  FROM paid_plan_events WHERE "eventType" IN (
    'SUBSCRIPTIONS_GOOGLE_PLAY_SUBSCRIBED', 'SUBSCRIPTIONS_PUBSUB_UPDATED',
    'SUBSCRIPTIONS_GOOGLE_PLAY_RECONCILED', 'SUBSCRIPTIONS_PUBSUB_RECOVERED_FROM_OBFUSCATED_ACCOUNT',
    'SUBSCRIPTIONS_PUBSUB_STORE_UPDATED_WITHOUT_USER')
)
SELECT "orderId", (array_agg(product ORDER BY "observedAt"))[1] AS product,
  MIN("observedAt") AS "observedAt", bool_or(test) AS test, MAX(package) AS package
FROM sources WHERE NULLIF("orderId", '') IS NOT NULL
GROUP BY "orderId" ORDER BY MIN("observedAt") DESC LIMIT 2001`;

@Injectable()
export class AdminFinanceService {
  private orders = new Map<
    string,
    { expires: number; value: Promise<androidpublisher_v3.Schema$Order | null> }
  >();
  constructor(
    private readonly db: DataSource,
    private readonly google: GooglePlaySubscriptionsService,
    private readonly fx: FxRatesService,
  ) {}

  private order(packageName: string, orderId: string) {
    const key = `${packageName}:${orderId}`;
    const cached = this.orders.get(key);
    if (cached && cached.expires > Date.now()) return cached.value;
    const value = this.google.android.orders
      .get(
        {
          packageName,
          orderId,
          fields:
            'orderId,state,createTime,orderHistory(processedEvent),lineItems(productId,subscriptionDetails(basePlanId)),total,tax,developerRevenueInBuyerCurrency',
        },
        { timeout: 5000, retry: false },
      )
      .then(({ data }) => data)
      .catch(() => null);
    this.orders.set(key, { expires: Date.now() + 60_000, value });
    if (this.orders.size > 2000) {
      const oldest = this.orders.keys().next();
      if (!oldest.done) this.orders.delete(oldest.value);
    }
    return value;
  }

  async report(
    from: string,
    to: string,
    grouping: string,
    includeTest: boolean,
  ) {
    const group = financeRange(from, to, grouping);
    const [creditRows, payments, candidates] = await Promise.all([
      this.db.query<CreditRow[]>(
        `SELECT id, "productId", quantity, amount, currency, "testPurchase", "orderId", "developerRevenue", "taxAmount",
        COALESCE("purchasedAt", "createdAt") AS date FROM credit_purchases
        WHERE status IN ('PURCHASED', 'CONSUMED') AND ($3 OR NOT "testPurchase")
        AND COALESCE("purchasedAt", "createdAt") >= $1::date::timestamp AT TIME ZONE 'Europe/Kyiv'
        AND COALESCE("purchasedAt", "createdAt") < ($2::date + 1)::timestamp AT TIME ZONE 'Europe/Kyiv'
        ORDER BY id LIMIT 50001`,
        [from, to, includeTest],
      ),
      this.db.query<PaymentRow[]>(
        `SELECT p.id, p."orderId", COALESCE(p."basePlanId",pl."basePlanId") AS product, p.amount, p.currency, p."createdAt",
        p."developerRevenue", p."taxAmount", p."testPurchase", p."orderState"
        FROM payments p LEFT JOIN plans pl ON pl.id=p."planId"
        WHERE p."createdAt" >= $1::date::timestamp AT TIME ZONE 'Europe/Kyiv'
        AND p."createdAt" < ($2::date + 1)::timestamp AT TIME ZONE 'Europe/Kyiv' LIMIT 50001`,
        [from, to],
      ),
      this.db.query<OrderCandidate[]>(FINANCE_ORDER_CANDIDATES_SQL),
    ]);
    if (
      creditRows.length > 50000 ||
      payments.length > 50000 ||
      candidates.length > 2000
    )
      throw new BadRequestException(
        'Завеликий обсяг платежів для цього звіту. Потрібне завантаження історії частинами.',
      );
    const receipts = new Map<string, FinanceReceipt>();
    const paymentsByOrder = new Map(
      payments.filter((p) => p.orderId).map((p) => [p.orderId, p]),
    );
    const testOrders = new Set(
      candidates.filter((c) => c.test).map((c) => c.orderId),
    );
    let excludedTests = 0,
      unresolvedOrders = 0,
      excludedRefunds = 0,
      unmapped = 0;
    for (const credit of creditRows) {
      const money = resolveCreditPurchaseFinancialDetails(credit);
      if (!FINANCE_PRODUCTS.some((p) => p.id === credit.productId)) {
        unmapped++;
        continue;
      }
      receipts.set(`credit:${credit.id}`, {
        key: `credit:${credit.id}`,
        product: credit.productId,
        date: financeDay(credit.date),
        amount: money?.amount ?? null,
        currency: money?.currency ?? null,
        ...resolveDeveloperRevenue({
          ...credit,
          feePercent: configuredCreditFee(),
        }),
        estimated: money?.source === 'catalog_estimate',
      });
    }
    for (const payment of payments) {
      if (
        !includeTest &&
        (payment.testPurchase ||
          (payment.orderId && testOrders.has(payment.orderId)))
      )
        continue;
      if (
        ['REFUNDED', 'CANCELED', 'PENDING', 'PENDING_REFUND'].includes(
          payment.orderState ?? '',
        )
      )
        continue;
      if (!FINANCE_PRODUCTS.some((p) => p.id === payment.product)) {
        unmapped++;
        continue;
      }
      if (
        !payment.testPurchase &&
        payment.amount !== null &&
        Number(payment.amount) === 0
      )
        continue;
      const key = payment.orderId ?? `payment:${payment.id}`;
      receipts.set(key, {
        key,
        product: payment.product,
        date: financeDay(payment.createdAt),
        amount: payment.amount ?? planFallback[payment.product] ?? null,
        currency: payment.amount === null ? 'USD' : payment.currency,
        ...resolveDeveloperRevenue({
          ...payment,
          feePercent: 15,
          refunded: payment.orderState === 'PARTIALLY_REFUNDED',
        }),
        estimated: payment.amount === null,
      });
    }
    // Unique order IDs count renewals once each; audit log rows never count as extra payments.
    const work = candidates.filter((c) => {
      if (!includeTest && c.test) {
        excludedTests++;
        return false;
      }
      return true;
    });
    let cursor = 0;
    const deadline = Date.now() + 15_000;
    await Promise.all(
      Array.from({ length: Math.min(work.length, 4) }, async () => {
        while (cursor < work.length) {
          const candidate = work[cursor++];
          const order =
            Date.now() < deadline
              ? await this.order(
                  candidate.package ||
                    process.env.GOOGLE_PLAY_PACKAGE_NAME ||
                    'com.soniac12.nemory',
                  candidate.orderId,
                )
              : null;
          const fallbackDate = financeDay(candidate.observedAt);
          if (!order || order.orderId !== candidate.orderId) {
            if (fallbackDate < from || fallbackDate > to) continue;
            unresolvedOrders++;
            if (!receipts.has(candidate.orderId))
              receipts.set(candidate.orderId, {
                key: candidate.orderId,
                product: candidate.product,
                date: fallbackDate,
                amount: planFallback[candidate.product] ?? null,
                currency: 'USD',
                net: null,
                estimated: true,
                dateEstimated: true,
              });
            continue;
          }
          // Remove any legacy duplicate before applying the authoritative order date/state.
          const persisted = paymentsByOrder.get(candidate.orderId);
          receipts.delete(candidate.orderId);
          const paidAt =
            order.orderHistory?.processedEvent?.eventTime ?? order.createTime;
          if (!paidAt) {
            unresolvedOrders++;
            continue;
          }
          const date = financeDay(paidAt);
          if (date < from || date > to) continue;
          if (
            ['REFUNDED', 'CANCELED', 'PENDING', 'PENDING_REFUND'].includes(
              order.state ?? '',
            )
          ) {
            excludedRefunds++;
            continue;
          }
          if (
            !['PROCESSED', 'PARTIALLY_REFUNDED'].includes(order.state ?? '') ||
            order.lineItems?.length !== 1
          ) {
            unresolvedOrders++;
            continue;
          }
          const product = order.lineItems[0].subscriptionDetails?.basePlanId;
          if (!product || !FINANCE_PRODUCTS.some((p) => p.id === product)) {
            unmapped++;
            continue;
          }
          let amount: string | null = null,
            currency: string | null = null;
          try {
            if (order.total?.currencyCode) {
              amount = googleMoneyDecimal(order.total);
              currency = order.total.currencyCode;
            }
          } catch {
            amount = null;
            currency = null;
          }
          // Free trials are not paid receipts. Test orders remain inspectable locally.
          if (!candidate.test && amount !== null && Number(amount) === 0)
            continue;
          const deductions = googleOrderDeductions(order, currency ?? '');
          receipts.set(candidate.orderId, {
            key: candidate.orderId,
            product,
            date,
            amount: amount ?? planFallback[product] ?? null,
            currency: currency ?? 'USD',
            ...resolveDeveloperRevenue({
              amount,
              ...deductions,
              developerRevenue:
                deductions.developerRevenue ??
                (currency === persisted?.currency
                  ? persisted.developerRevenue
                  : null),
              feePercent: 15,
              testPurchase: candidate.test,
              refunded: order.state === 'PARTIALLY_REFUNDED',
            }),
            estimated: amount === null,
          });
        }
      }),
    );
    const report = await aggregateFinance(
      [...receipts.values()],
      from,
      to,
      group,
      (ccy, date) => this.fx.getUsdRate(ccy, date),
    );
    return {
      ...report,
      includeTest,
      calculatedAt: new Date().toISOString(),
      coverage: { excludedTests, unresolvedOrders, excludedRefunds, unmapped },
      notes: [
        'Підписки: збережені платежі та відомі замовлення Google Play. Історія обмежена замовленнями, зафіксованими бекендом.',
        'Кожне продовження — окрема оплата. Повністю повернені та скасовані замовлення не включено. Часткові повернення враховані в доході, графік показує початкову оплату.',
        'Суми переведено в USD за історичним курсом на дату оплати. Частка доходу відома лише за наявності даних для всіх оплат.',
        'Орієнтовні суми використовують перевірені USD-тарифи від 28.10.2026. За недоступного замовлення дата може бути датою першої фіксації на бекенді.',
        'Дохід: збережена сума Google, інакше оцінка (оплата − фактичний податок замовлення) × (1 − комісія). Для підписок резервна комісія 15%; для кредитів її потрібно підтвердити. Відсутній податок не означає 0%. Оцінки не записуються як фактичний дохід.',
        'Тестові замовлення не підтверджують реальну комісію: Google може повертати нульовий дохід. Цей звіт не враховує ваші власні податки після виплати.',
      ],
    };
  }
}
