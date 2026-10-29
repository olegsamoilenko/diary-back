export enum CreditPackProductId {
  CREDITS_5K = 'nemory_credits_5000',
  CREDITS_20K = 'nemory_credits_20000',
  CREDITS_40K = 'nemory_credits_40000',
}

export type CreditPackCatalogItem = {
  productId: CreditPackProductId;
  credits: number;
  /** US catalog price checked in Google Play on 2026-10-28; estimate only. */
  fallbackPriceUsd: string;
};

export const CREDIT_PACK_CATALOG: Readonly<
  Record<CreditPackProductId, CreditPackCatalogItem>
> = Object.freeze({
  [CreditPackProductId.CREDITS_5K]: Object.freeze({
    productId: CreditPackProductId.CREDITS_5K,
    credits: 5_000,
    fallbackPriceUsd: '2.49',
  }),
  [CreditPackProductId.CREDITS_20K]: Object.freeze({
    productId: CreditPackProductId.CREDITS_20K,
    credits: 20_000,
    fallbackPriceUsd: '8.99',
  }),
  [CreditPackProductId.CREDITS_40K]: Object.freeze({
    productId: CreditPackProductId.CREDITS_40K,
    credits: 40_000,
    fallbackPriceUsd: '15.99',
  }),
});

export function getCreditPackCatalogItem(
  productId: string | null | undefined,
): CreditPackCatalogItem | null {
  if (!productId || !Object.hasOwn(CREDIT_PACK_CATALOG, productId)) {
    return null;
  }

  return CREDIT_PACK_CATALOG[productId as CreditPackProductId] ?? null;
}
