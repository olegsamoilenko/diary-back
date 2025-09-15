import { Injectable } from '@nestjs/common';
import { google } from 'googleapis';
import type { StoreState } from './dto/iap.dto';
// import * as fs from 'fs';
// import * as path from 'path';

type GoogleSubState =
  | 'SUBSCRIPTION_STATE_ACTIVE'
  | 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD'
  | 'SUBSCRIPTION_STATE_ON_HOLD'
  | 'SUBSCRIPTION_STATE_PAUSED'
  | 'SUBSCRIPTION_STATE_CANCELED'
  | 'SUBSCRIPTION_STATE_EXPIRED';

@Injectable()
export class IapService {
  private readonly auth = new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    scopes: ['https://www.googleapis.com/auth/androidpublisher'],
  });

  private readonly android = google.androidpublisher({
    version: 'v3',
    auth: this.auth,
  });

  // private getServiceAccountEmail(): string | undefined {
  //   try {
  //     const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  //     if (!keyPath) return undefined;
  //     const abs = path.resolve(process.cwd(), keyPath);
  //     const raw = fs.readFileSync(abs, 'utf8');
  //     const json = JSON.parse(raw);
  //     return json.client_email as string | undefined;
  //   } catch {
  //     return undefined;
  //   }
  // }
  //
  // async pingAuth() {
  //   // Звідси якраз береться this.auth.getClient()
  //   const authClient = await this.auth.getClient();
  //   // А тут реально запитуємо access token
  //   const tokenResp = await authClient.getAccessToken();
  //
  //   return {
  //     ok: !!tokenResp?.token,
  //     tokenPreview: tokenResp?.token
  //       ? tokenResp.token.slice(0, 12) + '…'
  //       : null,
  //     saEmail: this.getServiceAccountEmail(),
  //     scope: 'https://www.googleapis.com/auth/androidpublisher',
  //   };
  // }

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
