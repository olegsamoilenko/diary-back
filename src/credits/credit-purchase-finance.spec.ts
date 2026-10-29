import { describe, expect, it } from '@jest/globals';
import {
  creditOrderFinancialDetails,
  googleMoneyDecimal,
  resolveCreditPurchaseFinancialDetails,
} from './credit-purchase-finance';

const expected = {
  orderId: 'order-1',
  purchaseToken: 'token-1',
  productId: 'nemory_credits_5000',
};
const order = {
  ...expected,
  state: 'PROCESSED',
  lineItems: [{ productId: expected.productId }],
  total: { currencyCode: 'UAH', units: '104', nanos: 990_000_000 },
  developerRevenueInBuyerCurrency: {
    currencyCode: 'UAH',
    units: '74',
    nanos: 375_000_000,
  },
};

describe('credit purchase financial details', () => {
  it('stores the paid total and actual developer revenue', () => {
    expect(creditOrderFinancialDetails(order, expected)).toEqual({
      amount: '104.990000000',
      currency: 'UAH',
      developerRevenue: '74.375000000',
      taxAmount: null,
    });
  });

  it('preserves sub-cent precision, large integer amounts and genuine zero', () => {
    expect(googleMoneyDecimal({ units: '9007199254740993', nanos: 1 })).toBe(
      '9007199254740993.000000001',
    );
    expect(googleMoneyDecimal({ nanos: -1 })).toBe('-0.000000001');
    expect(googleMoneyDecimal({ currencyCode: 'USD' })).toBe('0.000000000');
  });

  it.each([
    { orderId: 'wrong' },
    { purchaseToken: 'wrong' },
    { lineItems: [{ productId: 'wrong' }] },
    { lineItems: [...order.lineItems, ...order.lineItems] },
    { state: 'PENDING' },
    { total: undefined },
    { total: { currencyCode: 'USD', units: '-1' } },
    { total: { currencyCode: 'USD', units: '1', nanos: -1 } },
    { total: { currencyCode: 'USD', nanos: 1_000_000_000 } },
    { total: { currencyCode: 'USD', units: 'NaN' } },
  ])('rejects mismatched or invalid order data: %j', (patch) => {
    expect(() =>
      creditOrderFinancialDetails({ ...order, ...patch }, expected),
    ).toThrow();
  });

  it('keeps missing revenue unknown', () => {
    expect(
      creditOrderFinancialDetails(
        { ...order, developerRevenueInBuyerCurrency: undefined },
        expected,
      ).developerRevenue,
    ).toBeNull();
  });

  const purchase = {
    productId: expected.productId,
    quantity: 1,
    amount: null,
    currency: null,
  };

  it('labels catalog fallback and never mutates a missing receipt or invents revenue', () => {
    expect(resolveCreditPurchaseFinancialDetails(purchase)).toEqual({
      amount: '2.49',
      currency: 'USD',
      source: 'catalog_estimate',
    });
    expect(purchase.amount).toBeNull();
    expect(
      resolveCreditPurchaseFinancialDetails({ ...purchase, quantity: 3 })
        ?.amount,
    ).toBe('7.47');
  });

  it('prefers actual receipts including zero and manually populated old records', () => {
    expect(
      resolveCreditPurchaseFinancialDetails({
        ...purchase,
        amount: '0.000000000',
        currency: 'USD',
      }),
    ).toEqual({
      amount: '0.000000000',
      currency: 'USD',
      source: 'payment',
    });
    expect(
      resolveCreditPurchaseFinancialDetails({
        ...purchase,
        amount: '99.99',
        currency: 'UAH',
      })?.currency,
    ).toBe('UAH');
  });

  it('does not invent prices for unknown products or invalid quantities', () => {
    expect(
      resolveCreditPurchaseFinancialDetails({
        ...purchase,
        productId: 'unknown',
      }),
    ).toBeNull();
    expect(
      resolveCreditPurchaseFinancialDetails({ ...purchase, quantity: 0 }),
    ).toBeNull();
  });
});
