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

export interface PubSubMessage {
  messageId: string;
  publishTime: string;
  data?: string;
  attributes?: Record<string, string>;
}

export interface PubSubPushEnvelope {
  message?: PubSubMessage;
  subscription?: string;
}

export interface RtdnSubscriptionNotification {
  version?: string;
  notificationType?: number;
  purchaseToken?: string;
  subscriptionId?: string;
}

export interface RtdnPayload {
  version?: string;
  packageName?: string;
  eventTimeMillis?: string;
  testNotification?: Record<string, unknown>;
  subscriptionNotification?: RtdnSubscriptionNotification;
}
