export type VerifyDto =
  | {
      platform: 'android';
      userId?: string;
      packageName: string;
      productId: string;
      purchaseToken: string;
      orderId?: string;
    }
  | {
      platform: 'ios';
      userId?: string;
      productId: string;
      transactionId: string;
      receipt?: string;
      originalTransactionId?: string;
    };

export type StoreState =
  | 'EXPIRED'
  | 'ACTIVE'
  | 'IN_GRACE'
  | 'ON_HOLD'
  | 'PAUSED'
  | 'CANCELED'
  | 'INACTIVE'
  | 'REFUNDED'
  | 'RESTARTED';

export type VerifyResp = {
  planId: string;
  startAt?: string;
  expiresAt?: string;
  storeState: StoreState;
  autoRenewing?: boolean;
};
