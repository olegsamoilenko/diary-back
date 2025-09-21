import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { google } from 'googleapis';
import type { StoreState } from './dto/iap.dto';
import {
  PlanIds,
  PlanStatus,
  SubscriptionIds,
  BasePlanIds,
} from 'src/plans/types';
import { CreatePlanDto } from 'src/plans/dto';
import { GoogleSubResponse } from 'src/iap/types/subscription';
import { Platform } from '../common/types/platform';
import { UsersService } from '../users/users.service';
import { PlansService } from 'src/plans/plans.service';
import { throwError } from '../common/utils';
import { HttpStatus } from '../common/utils/http-status';
import { PaymentsService } from 'src/payments/payments.service';

type GoogleSubState =
  | 'SUBSCRIPTION_STATE_ACTIVE'
  | 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD'
  | 'SUBSCRIPTION_STATE_ON_HOLD'
  | 'SUBSCRIPTION_STATE_PAUSED'
  | 'SUBSCRIPTION_STATE_CANCELED'
  | 'SUBSCRIPTION_STATE_EXPIRED';

@Injectable()
export class IapService {
  constructor(
    private readonly plansService: PlansService,
    private readonly paymentsService: PaymentsService,
    private readonly usersService: UsersService,
  ) {}

  private readonly auth = new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    scopes: ['https://www.googleapis.com/auth/androidpublisher'],
  });

  private readonly android = google.androidpublisher({
    version: 'v3',
    auth: this.auth,
  });

  async createAndroidSub(
    userId: number,
    packageName: string,
    purchaseToken: string,
  ) {
    const { planData, paymentData } = await this.verifyAndroidSub(
      packageName,
      purchaseToken,
    );

    try {
      const user = await this.usersService.findById(userId);

      if (!user) {
        throwError(
          HttpStatus.BAD_REQUEST,
          'User not found',
          'User with this id does not exist.',
          'USER_NOT_FOUND',
        );
        return;
      }

      const plan = await this.plansService.subscribePlan(userId, planData);

      if (!plan) {
        throwError(
          HttpStatus.BAD_REQUEST,
          'Failed to create plan',
          'Failed to create plan',
          'FAILED_CREATE_PLAN',
        );
        return;
      }

      const payment = {
        ...paymentData,
        user,
        plan: plan,
      };

      await this.paymentsService.create(payment);

      return true;
    } catch (error) {
      console.error('Error in verifyAndroidSub:', error);
      throwError(
        HttpStatus.BAD_REQUEST,
        'Error processing subscription',
        'Error processing subscription',
        'ERROR_PROCESSING_SUBSCRIPTION',
      );
    }
  }

  async pubSubAndroid(
    packageName: string,
    purchaseToken: string,
    notificationType?: number,
  ) {
    const { planData, paymentData } = await this.verifyAndroidSub(
      packageName,
      purchaseToken,
    );

    try {
      const existingPlan =
        await this.plansService.findExistingPlan(purchaseToken);

      if (!existingPlan) {
        // No existing plan found, nothing to update
        return;
      }

      const updatedPlan = await this.plansService.updatePlan(
        existingPlan.id,
        planData,
      );

      if (!updatedPlan) {
        throwError(
          HttpStatus.BAD_REQUEST,
          'Failed to update plan',
          'Failed to update plan',
          'FAILED_UPDATE_PLAN',
        );
        return;
      }

      const looksLikePurchase =
        notificationType === 4 ||
        notificationType === 2 ||
        notificationType === 1 ||
        notificationType === 7;

      if (looksLikePurchase) {
        const user = await this.usersService.findById(existingPlan.user.id);

        if (!user) {
          throwError(
            HttpStatus.BAD_REQUEST,
            'User not found',
            'User with this id does not exist.',
            'USER_NOT_FOUND',
          );
          return;
        }

        const payment = {
          ...paymentData,
          user,
          plan: updatedPlan,
        };

        await this.paymentsService.create(payment);
      }

      return true;
    } catch (error) {
      console.error('Error in pubSubAndroid:', error);
      throwError(
        HttpStatus.BAD_REQUEST,
        'Error processing subscription',
        'Error processing subscription',
        'ERROR_PROCESSING_SUBSCRIPTION',
      );
    }
  }

  async verifyAndroidSub(packageName: string, purchaseToken: string) {
    // try {
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
      SUBSCRIPTION_STATE_ACTIVE: 'ACTIVE',
      SUBSCRIPTION_STATE_IN_GRACE_PERIOD: 'IN_GRACE',
      SUBSCRIPTION_STATE_ON_HOLD: 'ON_HOLD',
      SUBSCRIPTION_STATE_PAUSED: 'PAUSED',
      SUBSCRIPTION_STATE_CANCELED: 'CANCELED',
      SUBSCRIPTION_STATE_EXPIRED: 'EXPIRED',
    } as const satisfies Record<GoogleSubState, StoreState>;

    const planStatus: PlanStatus = isGoogleSubState(data.subscriptionState)
      ? PlanStatus[stateMap[data.subscriptionState] as keyof typeof PlanStatus]
      : PlanStatus.EXPIRED;

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

    const planData: CreatePlanDto = {
      subscriptionId: (line?.productId ?? '') as SubscriptionIds,
      basePlanId: (line?.offerDetails?.basePlanId ?? '') as BasePlanIds,
      startTime: start!,
      expiryTime: expires!,
      planStatus,
      autoRenewEnabled: line?.autoRenewingPlan?.autoRenewEnabled ?? false,
      purchaseToken,
      linkedPurchaseToken: googleData.linkedPurchaseToken || null,
      platform: Platform.ANDROID,
      regionCode,
      price,
      currency,
    };

    const paymentData = {
      platform: Platform.ANDROID,
      regionCode,
      orderId: line?.latestSuccessfulOrderId,
      amount: price,
      currency,
    };

    console.log('planData', planData);
    console.log('paymentData', paymentData);

    return { planData, paymentData };
    // } catch (error: unknown) {
    //   console.error('Error in verifyAndroidSub:', error);
    //   throwError(
    //     HttpStatus.BAD_REQUEST,
    //     'Error verifying subscription',
    //     'Error verifying subscription',
    //     'ERROR_VERIFYING_SUBSCRIPTION',
    //   );
    // }
  }
}
