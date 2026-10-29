import type { androidpublisher_v3 } from 'googleapis';
import { getCreditPackCatalogItem } from './credit-pack.catalog';
import {
  googleMoneyDecimal,
  googleOrderDeductions,
} from '../payments/google-order-finance';

export type CreditPurchaseFinancialDetails = {
  amount: string;
  currency: string;
  developerRevenue: string | null;
  taxAmount: string | null;
};

/** Read-side fallback only: never persist catalog prices as actual receipts. */
export function resolveCreditPurchaseFinancialDetails(purchase: {
  productId: string;
  quantity: number;
  amount: string | null;
  currency: string | null;
}) {
  if (
    purchase.amount !== null &&
    /^\d+(\.\d{1,9})?$/.test(purchase.amount) &&
    /^[A-Z]{3}$/.test(purchase.currency ?? '')
  ) {
    return {
      amount: purchase.amount,
      currency: purchase.currency!,
      source: 'payment' as const,
    };
  }
  const pack = getCreditPackCatalogItem(purchase.productId);
  if (
    !pack ||
    !Number.isSafeInteger(purchase.quantity) ||
    purchase.quantity < 1
  )
    return null;
  const cents =
    BigInt(pack.fallbackPriceUsd.replace('.', '')) * BigInt(purchase.quantity);
  return {
    amount: `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`,
    currency: 'USD',
    source: 'catalog_estimate' as const,
  };
}

export function creditOrderFinancialDetails(
  order: androidpublisher_v3.Schema$Order,
  expected: { orderId: string; purchaseToken: string; productId: string },
): CreditPurchaseFinancialDetails {
  if (
    order.orderId !== expected.orderId ||
    (order.purchaseToken && order.purchaseToken !== expected.purchaseToken) ||
    order.lineItems?.length !== 1 ||
    order.lineItems[0].productId !== expected.productId ||
    !['PROCESSED', 'PENDING_REFUND', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(
      order.state ?? '',
    )
  ) {
    throw new Error('Google order does not match the verified purchase');
  }
  const total = order.total;
  if (!total || !/^[A-Z]{3}$/.test(total.currencyCode ?? '')) {
    throw new Error('Google order payment amount unavailable');
  }
  const amount = googleMoneyDecimal(total);
  if (amount.startsWith('-')) throw new Error('Negative payment amount');
  return {
    amount,
    currency: total.currencyCode!,
    ...googleOrderDeductions(order, total.currencyCode!),
  };
}

export { googleMoneyDecimal } from '../payments/google-order-finance';
