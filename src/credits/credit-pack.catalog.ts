export enum CreditPackProductId {
  CREDITS_5K = 'nemory_credits_5000',
  CREDITS_20K = 'nemory_credits_20000',
  CREDITS_40K = 'nemory_credits_40000',
}

export type CreditPackCatalogItem = {
  productId: CreditPackProductId;
  credits: number;
};

export const CREDIT_PACK_CATALOG: Readonly<
  Record<CreditPackProductId, CreditPackCatalogItem>
> = Object.freeze({
  [CreditPackProductId.CREDITS_5K]: Object.freeze({
    productId: CreditPackProductId.CREDITS_5K,
    credits: 5_000,
  }),
  [CreditPackProductId.CREDITS_20K]: Object.freeze({
    productId: CreditPackProductId.CREDITS_20K,
    credits: 20_000,
  }),
  [CreditPackProductId.CREDITS_40K]: Object.freeze({
    productId: CreditPackProductId.CREDITS_40K,
    credits: 40_000,
  }),
});

export function getCreditPackCatalogItem(
  productId: string | null | undefined,
): CreditPackCatalogItem | null {
  if (!productId) {
    return null;
  }

  return CREDIT_PACK_CATALOG[productId as CreditPackProductId] ?? null;
}
