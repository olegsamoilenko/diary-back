export interface RecurringPrice {
  currencyCode?: string;
  units?: string;
  nanos?: number;
}

export interface AutoRenewingPlan {
  autoRenewEnabled?: boolean;
  recurringPrice?: RecurringPrice;
}

export interface OfferDetails {
  basePlanId?: string;
}

export interface LineItem {
  productId?: string;
  expiryTime?: string;
  autoRenewingPlan?: AutoRenewingPlan;
  offerDetails?: OfferDetails;
  latestSuccessfulOrderId?: string;
}

export interface GoogleSubResponse {
  kind?: string;
  startTime?: string;
  regionCode?: string;
  subscriptionState?: string;
  latestOrderId?: string;
  acknowledgementState?: string;
  testPurchase?: Record<string, unknown>;
  lineItems?: LineItem[];
  // ...інші поля за потребою
}
