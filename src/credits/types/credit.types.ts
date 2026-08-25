export enum CreditPurchaseProvider {
  GOOGLE_PLAY = 'GOOGLE_PLAY',
}

export enum CreditPurchaseStatus {
  PURCHASED = 'PURCHASED',
  CONSUMED = 'CONSUMED',
  CANCELED = 'CANCELED',
  REFUNDED = 'REFUNDED',
}

export enum CreditLedgerEntryType {
  PURCHASE = 'PURCHASE',
  AI_USAGE = 'AI_USAGE',
  REFUND = 'REFUND',
  ADJUSTMENT = 'ADJUSTMENT',
}

export type PurchasedCreditsSummary = {
  total: number;
  used: number;
  remaining: number;
  debt: number;
};

export enum EffectiveAiAccessSource {
  SUBSCRIPTION = 'SUBSCRIPTION',
  PURCHASED_CREDITS = 'PURCHASED_CREDITS',
  NONE = 'NONE',
}
