import { describe, expect, it } from '@jest/globals';
import {
  CreditPackProductId,
  getCreditPackCatalogItem,
} from './credit-pack.catalog';

describe('credit pack catalog', () => {
  it.each([
    [CreditPackProductId.CREDITS_5K, 5_000, '2.49'],
    [CreditPackProductId.CREDITS_20K, 20_000, '8.99'],
    [CreditPackProductId.CREDITS_40K, 40_000, '15.99'],
  ])(
    'maps %s to a server-owned credit amount',
    (productId, credits, fallbackPriceUsd) => {
      expect(getCreditPackCatalogItem(productId)).toEqual({
        productId,
        credits,
        fallbackPriceUsd,
      });
    },
  );

  it('rejects products outside the whitelist', () => {
    expect(getCreditPackCatalogItem('nemory_credits_999999')).toBeNull();
    expect(getCreditPackCatalogItem('__proto__')).toBeNull();
    expect(getCreditPackCatalogItem('constructor')).toBeNull();
  });
});
