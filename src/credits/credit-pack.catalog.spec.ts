import { describe, expect, it } from '@jest/globals';
import {
  CreditPackProductId,
  getCreditPackCatalogItem,
} from './credit-pack.catalog';

describe('credit pack catalog', () => {
  it.each([
    [CreditPackProductId.CREDITS_5K, 5_000],
    [CreditPackProductId.CREDITS_20K, 20_000],
    [CreditPackProductId.CREDITS_40K, 40_000],
  ])('maps %s to a server-owned credit amount', (productId, credits) => {
    expect(getCreditPackCatalogItem(productId)).toEqual({
      productId,
      credits,
    });
  });

  it('rejects products outside the whitelist', () => {
    expect(getCreditPackCatalogItem('nemory_credits_999999')).toBeNull();
  });
});
