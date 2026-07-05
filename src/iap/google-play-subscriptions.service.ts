import { Injectable } from '@nestjs/common';
import { google } from 'googleapis';
import { CreatePlanDto } from 'src/plans/dto';
import { BasePlanIds, PlanStatus, SubscriptionIds } from 'src/plans/types';
import { Platform } from 'src/common/types/platform';
import { GoogleSubResponse } from './types/subscription';
import {
  SubscriptionBasePlanId,
  SubscriptionBillingStatus,
  SubscriptionProductId,
} from 'src/subscriptions/types';

type GoogleSubState =
  | 'SUBSCRIPTION_STATE_ACTIVE'
  | 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD'
  | 'SUBSCRIPTION_STATE_ON_HOLD'
  | 'SUBSCRIPTION_STATE_PAUSED'
  | 'SUBSCRIPTION_STATE_CANCELED'
  | 'SUBSCRIPTION_STATE_EXPIRED';

export type VerifiedAndroidSubscription = {
  planData: CreatePlanDto;
  paymentData: {
    platform: Platform;
    regionCode: string | null;
    orderId: string | undefined;
    amount: number;
    currency: string;
  };
  googleData: GoogleSubResponse;
};

export type VerifiedGooglePlaySubscription = {
  storeData: {
    platform: Platform;
    regionCode: string | null;
    productId: SubscriptionProductId | null;
    basePlanId: SubscriptionBasePlanId;
    purchaseToken: string;
    linkedPurchaseToken: string | null;
    lastOrderId: string | null;
    storeStatus: SubscriptionBillingStatus;
    startTime: Date;
    expiryTime: Date;
    autoRenewEnabled: boolean;
    price: number;
    currency: string;
  };
  paymentData: {
    platform: Platform;
    regionCode: string | null;
    orderId: string | undefined;
    amount: number;
    currency: string;
  };
  googleData: GoogleSubResponse;
};

@Injectable()
export class GooglePlaySubscriptionsService {
  private readonly auth = new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    scopes: ['https://www.googleapis.com/auth/androidpublisher'],
  });

  readonly android = google.androidpublisher({
    version: 'v3',
    auth: this.auth,
  });

  async verifyAndroidSub(
    packageName: string,
    purchaseToken: string,
  ): Promise<VerifiedAndroidSubscription> {
    const verified = await this.verifyAndroidSubscription(
      packageName,
      purchaseToken,
    );
    const { storeData, paymentData, googleData } = verified;

    const planData: CreatePlanDto = {
      subscriptionId:
        (storeData.productId as unknown as SubscriptionIds) ??
        SubscriptionIds.NEMORY,
      basePlanId: storeData.basePlanId as unknown as BasePlanIds,
      startTime: storeData.startTime,
      expiryTime: storeData.expiryTime,
      planStatus: this.toLegacyPlanStatus(storeData.storeStatus),
      autoRenewEnabled: storeData.autoRenewEnabled,
      purchaseToken,
      linkedPurchaseToken: storeData.linkedPurchaseToken,
      platform: storeData.platform,
      regionCode: storeData.regionCode,
      price: storeData.price,
      currency: storeData.currency,
      lastOrderId: storeData.lastOrderId,
    };

    return { planData, paymentData, googleData };
  }

  async verifyAndroidSubscription(
    packageName: string,
    purchaseToken: string,
  ): Promise<VerifiedGooglePlaySubscription> {
    const { data } = await this.android.purchases.subscriptionsv2.get({
      packageName,
      token: purchaseToken,
    });

    const googleData = data as GoogleSubResponse;

    const line = googleData.lineItems?.[0];
    const start =
      typeof googleData.startTime === 'string'
        ? new Date(googleData.startTime)
        : undefined;
    const expires =
      typeof line?.expiryTime === 'string'
        ? new Date(line.expiryTime)
        : undefined;

    const isGoogleSubState = (v: unknown): v is GoogleSubState =>
      typeof v === 'string' &&
      [
        'SUBSCRIPTION_STATE_ACTIVE',
        'SUBSCRIPTION_STATE_IN_GRACE_PERIOD',
        'SUBSCRIPTION_STATE_ON_HOLD',
        'SUBSCRIPTION_STATE_PAUSED',
        'SUBSCRIPTION_STATE_CANCELED',
        'SUBSCRIPTION_STATE_EXPIRED',
      ].includes(v as GoogleSubState);

    const stateMap = {
      SUBSCRIPTION_STATE_ACTIVE: SubscriptionBillingStatus.ACTIVE,
      SUBSCRIPTION_STATE_IN_GRACE_PERIOD: SubscriptionBillingStatus.IN_GRACE,
      SUBSCRIPTION_STATE_ON_HOLD: SubscriptionBillingStatus.ON_HOLD,
      SUBSCRIPTION_STATE_PAUSED: SubscriptionBillingStatus.PAUSED,
      SUBSCRIPTION_STATE_CANCELED: SubscriptionBillingStatus.CANCELED,
      SUBSCRIPTION_STATE_EXPIRED: SubscriptionBillingStatus.EXPIRED,
    } as const satisfies Record<GoogleSubState, SubscriptionBillingStatus>;

    const storeStatus = isGoogleSubState(data.subscriptionState)
      ? stateMap[data.subscriptionState]
      : SubscriptionBillingStatus.EXPIRED;

    const recurringPrice = line?.autoRenewingPlan?.recurringPrice;
    const price =
      recurringPrice && typeof recurringPrice.units === 'string'
        ? parseInt(recurringPrice.units, 10) +
          (recurringPrice.nanos ?? 0) / 1_000_000_000
        : 0;
    const currency =
      recurringPrice && typeof recurringPrice.currencyCode === 'string'
        ? recurringPrice.currencyCode
        : 'USD';

    const regionCode = googleData.regionCode || null;

    const storeData = {
      productId: (line?.productId ?? null) as SubscriptionProductId | null,
      basePlanId: (line?.offerDetails?.basePlanId ??
        '') as SubscriptionBasePlanId,
      startTime: start!,
      expiryTime: expires!,
      autoRenewEnabled: line?.autoRenewingPlan?.autoRenewEnabled ?? false,
      purchaseToken,
      linkedPurchaseToken: googleData.linkedPurchaseToken || null,
      platform: Platform.ANDROID,
      regionCode,
      storeStatus,
      price,
      currency,
      lastOrderId: line?.latestSuccessfulOrderId || null,
    };

    const paymentData = {
      platform: Platform.ANDROID,
      regionCode,
      orderId: line?.latestSuccessfulOrderId,
      amount: price,
      currency,
    };

    return { storeData, paymentData, googleData };
  }

  private toLegacyPlanStatus(
    status: SubscriptionBillingStatus,
  ): PlanStatus {
    const statusMap: Partial<Record<SubscriptionBillingStatus, PlanStatus>> = {
      [SubscriptionBillingStatus.ACTIVE]: PlanStatus.ACTIVE,
      [SubscriptionBillingStatus.IN_GRACE]: PlanStatus.IN_GRACE,
      [SubscriptionBillingStatus.ON_HOLD]: PlanStatus.ON_HOLD,
      [SubscriptionBillingStatus.PAUSED]: PlanStatus.PAUSED,
      [SubscriptionBillingStatus.CANCELED]: PlanStatus.CANCELED,
      [SubscriptionBillingStatus.EXPIRED]: PlanStatus.EXPIRED,
      [SubscriptionBillingStatus.REFUNDED]: PlanStatus.REFUNDED,
      [SubscriptionBillingStatus.PENDING]: PlanStatus.PENDING,
    };

    return statusMap[status] ?? PlanStatus.EXPIRED;
  }
}
