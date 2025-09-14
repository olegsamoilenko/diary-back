import { Injectable } from '@nestjs/common';
// import { google } from 'googleapis';
import type { StoreState } from './dto/iap.dto';

import {
  auth as gAuth,
  androidpublisher_v3,
} from '@googleapis/androidpublisher';

type GoogleSubState =
  | 'SUBSCRIPTION_STATE_ACTIVE'
  | 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD'
  | 'SUBSCRIPTION_STATE_ON_HOLD'
  | 'SUBSCRIPTION_STATE_PAUSED'
  | 'SUBSCRIPTION_STATE_CANCELED'
  | 'SUBSCRIPTION_STATE_EXPIRED';

@Injectable()
export class IapService {
  private readonly googleAuth = new gAuth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/androidpublisher'],
  });

  private readonly android = new androidpublisher_v3.Androidpublisher({
    auth: this.googleAuth,
  });

  async verifyAndroidSub(packageName: string, purchaseToken: string) {
    const { data } = await this.android.purchases.subscriptionsv2.get({
      packageName,
      token: purchaseToken,
    });

    const line = data.lineItems?.[0];
    const start = data.startTime ? new Date(data.startTime) : undefined;
    const expires = line?.expiryTime ? new Date(line.expiryTime) : undefined;

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
      SUBSCRIPTION_STATE_ACTIVE: 'ACTIVE',
      SUBSCRIPTION_STATE_IN_GRACE_PERIOD: 'IN_GRACE',
      SUBSCRIPTION_STATE_ON_HOLD: 'ON_HOLD',
      SUBSCRIPTION_STATE_PAUSED: 'PAUSED',
      SUBSCRIPTION_STATE_CANCELED: 'CANCELED',
      SUBSCRIPTION_STATE_EXPIRED: 'EXPIRED',
    } as const satisfies Record<GoogleSubState, StoreState>;

    // ...
    const storeState: StoreState = isGoogleSubState(data.subscriptionState)
      ? stateMap[data.subscriptionState]
      : 'EXPIRED';

    return {
      planId: line?.productId ?? '',
      startAt: start?.toISOString(),
      expiresAt: expires?.toISOString(),
      storeState,
      autoRenewing: line?.autoRenewingPlan?.autoRenewEnabled ?? undefined,
      raw: data,
    };
  }

  // TODO: iOS валідація через App Store Server API
}
