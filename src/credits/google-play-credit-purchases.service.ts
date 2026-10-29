import { Injectable } from '@nestjs/common';
import { google } from 'googleapis';
import { creditOrderFinancialDetails } from './credit-purchase-finance';

export type VerifiedGooglePlayCreditPurchase = {
  productId: string;
  purchaseOptionId: string | null;
  purchaseToken: string;
  orderId: string | null;
  purchaseState: string;
  consumptionState: string | null;
  acknowledgementState: string | null;
  quantity: number;
  refundableQuantity: number;
  obfuscatedAccountId: string | null;
  regionCode: string | null;
  purchasedAt: Date | null;
  testPurchase: boolean;
  rawStoreData: Record<string, unknown>;
};

@Injectable()
export class GooglePlayCreditPurchasesService {
  private readonly auth = new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    scopes: ['https://www.googleapis.com/auth/androidpublisher'],
  });

  private readonly android = google.androidpublisher({
    version: 'v3',
    auth: this.auth,
  });

  async verify(
    packageName: string,
    purchaseToken: string,
    requestOptions?: { timeout: number; retry: boolean },
  ): Promise<VerifiedGooglePlayCreditPurchase> {
    const { data } =
      await this.android.purchases.productsv2.getproductpurchasev2(
        { packageName, token: purchaseToken },
        requestOptions,
      );
    const lineItems = data.productLineItem ?? [];

    const productId = lineItems[0]?.productId;
    if (lineItems.length !== 1 || !productId) {
      throw new Error('Google Play purchase must contain exactly one product');
    }

    const line = lineItems[0];
    const details = line.productOfferDetails;

    return {
      productId,
      purchaseOptionId: details?.purchaseOptionId ?? null,
      purchaseToken,
      orderId: data.orderId ?? null,
      purchaseState:
        data.purchaseStateContext?.purchaseState ??
        'PURCHASE_STATE_UNSPECIFIED',
      consumptionState: details?.consumptionState ?? null,
      acknowledgementState: data.acknowledgementState ?? null,
      quantity: details?.quantity ?? 1,
      refundableQuantity: details?.refundableQuantity ?? 0,
      obfuscatedAccountId: data.obfuscatedExternalAccountId ?? null,
      regionCode: data.regionCode ?? null,
      purchasedAt: data.purchaseCompletionTime
        ? new Date(data.purchaseCompletionTime)
        : null,
      testPurchase: Boolean(data.testPurchaseContext),
      rawStoreData: data as Record<string, unknown>,
    };
  }

  async getFinancialDetails(
    packageName: string,
    purchase: { orderId: string; purchaseToken: string; productId: string },
  ) {
    const { data } = await this.android.orders.get(
      { packageName, orderId: purchase.orderId },
      { timeout: 5_000, retry: false },
    );
    return creditOrderFinancialDetails(data, purchase);
  }

  async consume(
    packageName: string,
    productId: string,
    purchaseToken: string,
  ): Promise<void> {
    await this.android.purchases.products.consume({
      packageName,
      productId,
      token: purchaseToken,
    });
  }
}
