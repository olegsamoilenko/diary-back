import { Injectable } from '@nestjs/common';
import { google } from 'googleapis';
import type { StoreState } from './dto/iap.dto';
import * as fs from 'fs';
import * as path from 'path';

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

  private async checkAuthBasics() {
    let keyPathResolved: string | null = null;
    let saEmail: string | null = null;
    let tokenOk = false;
    let tokenPreview: string | null = null;

    try {
      if (
        !process.env.GCP_SA_JSON &&
        process.env.GOOGLE_APPLICATION_CREDENTIALS
      ) {
        keyPathResolved = path.resolve(
          process.cwd(),
          process.env.GOOGLE_APPLICATION_CREDENTIALS,
        );
        if (!fs.existsSync(keyPathResolved)) {
          return {
            ok: false,
            step: 'keyFile',
            error: `Key file not found at ${keyPathResolved}`,
          };
        }
        const raw = fs.readFileSync(keyPathResolved, 'utf8');
        saEmail = JSON.parse(raw).client_email ?? null;
      } else if (process.env.GCP_SA_JSON) {
        saEmail = JSON.parse(process.env.GCP_SA_JSON).client_email ?? null;
      }

      const client = await this.auth.getClient();
      const tokenResp = await client.getAccessToken();
      tokenOk = !!tokenResp?.token;
      tokenPreview = tokenResp?.token
        ? tokenResp.token.slice(0, 12) + '…'
        : null;
    } catch (e: any) {
      return { ok: false, step: 'auth', error: String(e?.message || e) };
    }

    return { ok: true, keyPathResolved, saEmail, tokenOk, tokenPreview };
  }

  private async checkPlayAccess(packageName: string) {
    try {
      const { data } = await this.android.edits.insert({ packageName });
      return { ok: true, editId: data.id ?? null };
    } catch (e: any) {
      const code = e?.response?.status || e?.code;
      const body = e?.response?.data;
      return { ok: false, code, body };
    }
  }

  async healthCheck(packageName: string) {
    const basics = await this.checkAuthBasics();
    if (!basics.ok) return { ok: false, stage: 'auth', details: basics };

    const play = await this.checkPlayAccess(packageName);
    if (!play.ok)
      return { ok: false, stage: 'play', details: { basics, play } };

    return { ok: true, basics, play };
  }

  async inspectPurchase({
    packageName,
    token,
    productId,
  }: {
    packageName: string;
    token: string;
    productId?: string;
  }) {
    const out: any = { packageName };

    try {
      const sub = await this.android.purchases.subscriptionsv2.get({
        packageName,
        token,
      });
      out.subscriptionsv2 = {
        ok: true,
        state: sub.data.subscriptionState,
        line0: sub.data.lineItems?.[0] ?? null,
      };
    } catch (e: any) {
      out.subscriptionsv2 = {
        ok: false,
        code: e?.response?.status || e?.code,
        data: e?.response?.data,
      };
    }

    if (productId) {
      try {
        const prod = await this.android.purchases.products.get({
          packageName,
          productId,
          token,
        });
        out.products = {
          ok: true,
          purchaseState: prod.data.purchaseState,
          kind: prod.data.kind,
        };
      } catch (e: any) {
        out.products = {
          ok: false,
          code: e?.response?.status || e?.code,
          data: e?.response?.data,
        };
      }
    }
    return out;
  }

  async testEditInsert(packageName: string) {
    try {
      const { data } = await this.android.edits.insert({ packageName });
      return { ok: true, editId: data.id ?? null };
    } catch (e: any) {
      return { ok: false, code: e?.response?.status, data: e?.response?.data };
    }
  }

  async testInappList(packageName: string) {
    try {
      const { data } = await this.android.inappproducts.list({ packageName });
      return { ok: true, total: data.inappproduct?.length ?? 0 };
    } catch (e: any) {
      return { ok: false, code: e?.response?.status, data: e?.response?.data };
    }
  }

  async token() {
    const authClient = await this.auth.getClient();
    const { token } = await authClient.getAccessToken();
    return { token };
  }

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
}

// http://192.168.0.100:3001/iap/inspect?packageName=com.soniac12.nemory&token=gdigkepfagfimjildhklcbig.AO-J1OwU3MnJro80iu9zruezVOlTkEZjkagvEHXdluUGtK9EPqcjgJND0EVi-bELWZsWGNjeIAA4xyWGpiBg_iAitx1pzvTecAgdigkepfagfimjildhklcbig.AO-J1OwU3MnJro80iu9zruezVOlTkEZjkagvEHXdluUGtK9EPqcjgJND0EVi-bELWZsWGNjeIAA4xyWGpiBg_iAitx1pzvTecA&productId=nemory_lite
