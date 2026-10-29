import type { androidpublisher_v3 } from 'googleapis';

/** Missing tax is unknown, never zero. Amounts share the buyer's currency. */
export function googleOrderDeductions(
  order: androidpublisher_v3.Schema$Order,
  currency: string,
) {
  const read = (money: androidpublisher_v3.Schema$Money | null | undefined) => {
    if (!money || money.currencyCode !== currency) return null;
    try {
      return googleMoneyDecimal(money);
    } catch {
      return null;
    }
  };
  return {
    developerRevenue: read(order.developerRevenueInBuyerCurrency),
    taxAmount: read(order.tax),
  };
}

/** Display-only estimate; never write this value as Google's actual revenue. */
export function resolveDeveloperRevenue(input: {
  amount: string | number | null;
  developerRevenue?: string | null;
  taxAmount?: string | null;
  feePercent: number | null;
  testPurchase?: boolean;
  refunded?: boolean;
}) {
  if (
    input.developerRevenue != null &&
    Number.isFinite(Number(input.developerRevenue))
  )
    return { net: input.developerRevenue, netEstimated: false };
  const amount = input.amount == null ? NaN : Number(input.amount);
  const tax = input.taxAmount == null ? NaN : Number(input.taxAmount);
  const fee = input.feePercent;
  if (
    input.testPurchase ||
    input.refunded ||
    !Number.isFinite(amount) ||
    !Number.isFinite(tax) ||
    amount < 0 ||
    tax < 0 ||
    tax > amount ||
    fee === null ||
    !Number.isFinite(fee) ||
    fee < 0 ||
    fee > 100
  )
    return { net: null, netEstimated: false };
  return {
    net: ((amount - tax) * (1 - fee / 100)).toFixed(9),
    netEstimated: true,
  };
}

export function configuredCreditFee(): number | null {
  const raw = process.env.GOOGLE_PLAY_CREDIT_FEE_PERCENT?.trim();
  if (!raw) return null;
  const fee = Number(raw);
  return Number.isFinite(fee) && fee >= 0 && fee <= 100 ? fee : null;
}

/** Google Money -> exact decimal; never round through a JS floating point sum. */
export function googleMoneyDecimal(
  money: androidpublisher_v3.Schema$Money,
): string {
  const units = money.units ?? '0';
  const nanos = money.nanos ?? 0;
  if (
    !/^-?\d{1,19}$/.test(units) ||
    !Number.isInteger(nanos) ||
    Math.abs(nanos) > 999_999_999
  ) {
    throw new Error('Invalid Google money');
  }
  const whole = BigInt(units);
  if ((whole > 0n && nanos < 0) || (whole < 0n && nanos > 0)) {
    throw new Error('Invalid Google money sign');
  }
  const value = whole * 1_000_000_000n + BigInt(nanos);
  const magnitude = value < 0n ? -value : value;
  return `${value < 0n ? '-' : ''}${magnitude / 1_000_000_000n}.${String(magnitude % 1_000_000_000n).padStart(9, '0')}`;
}
