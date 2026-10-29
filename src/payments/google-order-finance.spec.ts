import { describe, expect, it } from '@jest/globals';
import {
  googleOrderDeductions,
  resolveDeveloperRevenue,
} from './google-order-finance';

describe('actual revenue and country-specific tax fallback', () => {
  const input = {
    amount: '120',
    taxAmount: '20',
    developerRevenue: null,
    feePercent: 15,
  };
  it('subtracts the actual included tax before the commission', () => {
    expect(resolveDeveloperRevenue(input)).toEqual({
      net: '85.000000000',
      netEstimated: true,
    });
    expect(resolveDeveloperRevenue({ ...input, taxAmount: '0' }).net).toBe(
      '102.000000000',
    );
    expect(resolveDeveloperRevenue({ ...input, taxAmount: '10' }).net).toBe(
      '93.500000000',
    );
  });
  it('prefers actual revenue including zero to any formula', () => {
    expect(
      resolveDeveloperRevenue({ ...input, developerRevenue: '0' }),
    ).toEqual({ net: '0', netEstimated: false });
    expect(
      resolveDeveloperRevenue({ ...input, developerRevenue: '80' }).net,
    ).toBe('80');
  });
  it.each([
    { taxAmount: null },
    { feePercent: null },
    { testPurchase: true },
    { refunded: true },
    { taxAmount: '121' },
    { amount: null },
  ])('does not guess missing inputs or test/refund economics: %j', (patch) => {
    expect(resolveDeveloperRevenue({ ...input, ...patch }).net).toBeNull();
  });
  it('does not treat absent or mismatched currency tax as zero', () => {
    expect(googleOrderDeductions({}, 'USD')).toEqual({
      taxAmount: null,
      developerRevenue: null,
    });
    expect(
      googleOrderDeductions(
        { tax: { currencyCode: 'UAH', units: '20' } },
        'USD',
      ).taxAmount,
    ).toBeNull();
  });
});
