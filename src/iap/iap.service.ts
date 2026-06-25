import { forwardRef, HttpException, Inject, Injectable } from '@nestjs/common';
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
import { PlanGateway } from 'src/ai/gateway/plan.gateway';
import {
  PaidPlanEventSource,
} from 'src/paid-plan-events/entities/paid-plan-event.entity';
import { PaidPlanEventsService } from 'src/paid-plan-events/paid-plan-events.service';
import { PAID_PLANS } from 'src/plans/constants';

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
    private readonly planGateway: PlanGateway,
    private readonly paidPlanEventsService: PaidPlanEventsService,
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
    await this.paidPlanEventsService.info({
      eventType: 'IAP_CREATE_SUB_RECEIVED',
      source: PaidPlanEventSource.FRONTEND_CREATE_SUB,
      userId,
      purchaseToken,
      message: 'Frontend requested Android subscription creation.',
      metadata: { packageName },
    });

    let verifiedSub: Awaited<ReturnType<IapService['verifyAndroidSub']>>;

    try {
      verifiedSub = await this.verifyAndroidSub(packageName, purchaseToken);
    } catch (error: any) {
      await this.paidPlanEventsService.conflict({
        eventType: 'IAP_CREATE_SUB_GOOGLE_VERIFY_FAILED',
        source: PaidPlanEventSource.FRONTEND_CREATE_SUB,
        userId,
        purchaseToken,
        message: 'Failed to verify frontend purchase token with Google Play.',
        metadata: {
          packageName,
          errorMessage: error?.message,
          errorCode: error?.code,
        },
      });
      throw error;
    }

    const { planData, paymentData, googleData } = verifiedSub;

    await this.paidPlanEventsService.info({
      eventType: 'IAP_CREATE_SUB_GOOGLE_VERIFIED',
      source: PaidPlanEventSource.FRONTEND_CREATE_SUB,
      userId,
      purchaseToken,
      linkedPurchaseToken: planData.linkedPurchaseToken,
      orderId: planData.lastOrderId,
      basePlanId: planData.basePlanId,
      planStatus: planData.planStatus,
      expiryTime: planData.expiryTime,
      googleSubscriptionState: googleData.subscriptionState || null,
      googleExpiryTime: planData.expiryTime,
      googleBasePlanId: planData.basePlanId,
      googleOrderId: planData.lastOrderId,
      message: 'Google Play verified frontend purchase token.',
      metadata: {
        packageName,
        testPurchase: Boolean(googleData.testPurchase),
      },
    });

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

      await this.warnIfReplacingActivePaidPlan(
        userId,
        packageName,
        purchaseToken,
        planData,
      );

      const { plan } = await this.plansService.subscribePlan(userId, planData);

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

      try {
        await this.paymentsService.create(payment);
      } catch (error) {
        await this.paidPlanEventsService.warning({
          eventType: 'IAP_CREATE_SUB_PAYMENT_CREATE_FAILED',
          source: PaidPlanEventSource.FRONTEND_CREATE_SUB,
          userId,
          planId: plan.id,
          purchaseToken,
          orderId: paymentData.orderId,
          basePlanId: planData.basePlanId,
          planStatus: planData.planStatus,
          expiryTime: planData.expiryTime,
          message: 'Payment creation failed after plan creation.',
          metadata: {
            packageName,
            errorMessage:
              error instanceof Error ? error.message : 'Unknown payment error',
          },
        });
        console.warn(
          'Payment create skipped/failed after plan creation:',
          error,
        );
      }

      return plan;
    } catch (error) {
      await this.paidPlanEventsService.conflict({
        eventType: 'IAP_CREATE_SUB_FAILED',
        source: PaidPlanEventSource.FRONTEND_CREATE_SUB,
        userId,
        purchaseToken,
        orderId: planData.lastOrderId,
        basePlanId: planData.basePlanId,
        planStatus: planData.planStatus,
        expiryTime: planData.expiryTime,
        message: 'Failed to process frontend Android subscription.',
        metadata: {
          packageName,
          errorMessage:
            error instanceof Error ? error.message : 'Unknown subscription error',
        },
      });
      console.error('Error in verifyAndroidSub:', error);
      if (error instanceof HttpException) {
        throw error;
      }

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
    await this.paidPlanEventsService.info({
      eventType: 'PUBSUB_RECEIVED',
      source: PaidPlanEventSource.GOOGLE_PUBSUB,
      purchaseToken,
      message: 'Google Pub/Sub subscription notification received.',
      metadata: { packageName, notificationType },
    });

    let verifiedSub: Awaited<ReturnType<IapService['verifyAndroidSub']>>;

    try {
      verifiedSub = await this.verifyAndroidSub(packageName, purchaseToken);
    } catch (error: any) {
      await this.paidPlanEventsService.conflict({
        eventType: 'PUBSUB_GOOGLE_VERIFY_FAILED',
        source: PaidPlanEventSource.GOOGLE_PUBSUB,
        purchaseToken,
        message: 'Failed to verify Pub/Sub purchase token with Google Play.',
        metadata: {
          packageName,
          notificationType,
          errorMessage: error?.message,
          errorCode: error?.code,
        },
      });
      throw error;
    }

    const { planData, paymentData, googleData } = verifiedSub;

    try {
      const existingPlan =
        await this.plansService.findExistingPlanForIap(purchaseToken);

      if (!existingPlan) {
        await this.paidPlanEventsService.conflict({
          eventType: 'PUBSUB_UNKNOWN_PURCHASE_TOKEN',
          source: PaidPlanEventSource.GOOGLE_PUBSUB,
          purchaseToken,
          linkedPurchaseToken: planData.linkedPurchaseToken,
          orderId: planData.lastOrderId,
          basePlanId: planData.basePlanId,
          planStatus: planData.planStatus,
          expiryTime: planData.expiryTime,
          googleSubscriptionState: googleData.subscriptionState || null,
          googleExpiryTime: planData.expiryTime,
          googleBasePlanId: planData.basePlanId,
          googleOrderId: planData.lastOrderId,
          message: 'Google sent a token that is not linked to any local plan.',
          metadata: {
            packageName,
            notificationType,
            testPurchase: Boolean(googleData.testPurchase),
          },
        });
        return;
      }

      const nextOrderId = paymentData.orderId ?? null;
      const prevOrderId = existingPlan.lastOrderId ?? null;

      const isNewCreditsCycle = !!nextOrderId && nextOrderId !== prevOrderId;

      const updatedPlan = await this.plansService.updatePlan(
        existingPlan.id,
        planData,
        {
          resetUsedCredits: isNewCreditsCycle,
          lastOrderId: nextOrderId,
        },
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

      await this.paidPlanEventsService.info({
        eventType: 'PUBSUB_PLAN_UPDATED',
        source: PaidPlanEventSource.GOOGLE_PUBSUB,
        userId: existingPlan.user?.id ?? existingPlan.userId ?? null,
        planId: existingPlan.id,
        purchaseToken,
        linkedPurchaseToken: planData.linkedPurchaseToken,
        orderId: nextOrderId,
        oldOrderId: prevOrderId,
        basePlanId: planData.basePlanId,
        oldBasePlanId: existingPlan.basePlanId,
        planStatus: planData.planStatus,
        oldPlanStatus: existingPlan.planStatus,
        expiryTime: planData.expiryTime,
        oldExpiryTime: existingPlan.expiryTime,
        googleSubscriptionState: googleData.subscriptionState || null,
        googleExpiryTime: planData.expiryTime,
        googleBasePlanId: planData.basePlanId,
        googleOrderId: nextOrderId,
        message: 'Local plan updated from Google Pub/Sub notification.',
        metadata: {
          packageName,
          notificationType,
          resetUsedCredits: isNewCreditsCycle,
          testPurchase: Boolean(googleData.testPurchase),
        },
      });

      const planUserId = existingPlan.user?.id ?? existingPlan.userId;
      if (planUserId) {
        this.planGateway.emitPlanStatusChanged(planUserId);
      }

      const looksLikePurchase =
        notificationType === 2 ||
        notificationType === 1 ||
        notificationType === 7;

      if (looksLikePurchase && isNewCreditsCycle) {
        if (!planUserId) {
          throwError(
            HttpStatus.BAD_REQUEST,
            'User not found',
            'User with this id does not exist.',
            'USER_NOT_FOUND',
          );
          return;
        }

        const user = await this.usersService.findById(planUserId);

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

        await this.paidPlanEventsService.info({
          eventType: 'PUBSUB_PAYMENT_CREATED',
          source: PaidPlanEventSource.GOOGLE_PUBSUB,
          userId: planUserId,
          planId: updatedPlan.id,
          purchaseToken,
          orderId: paymentData.orderId,
          basePlanId: planData.basePlanId,
          planStatus: planData.planStatus,
          expiryTime: planData.expiryTime,
          message: 'Payment created from Google Pub/Sub notification.',
          metadata: { packageName, notificationType },
        });
      }

      return true;
    } catch (error) {
      await this.paidPlanEventsService.conflict({
        eventType: 'PUBSUB_PROCESSING_FAILED',
        source: PaidPlanEventSource.GOOGLE_PUBSUB,
        purchaseToken,
        orderId: planData.lastOrderId,
        basePlanId: planData.basePlanId,
        planStatus: planData.planStatus,
        expiryTime: planData.expiryTime,
        message: 'Failed to process Google Pub/Sub subscription notification.',
        metadata: {
          packageName,
          notificationType,
          errorMessage:
            error instanceof Error ? error.message : 'Unknown Pub/Sub error',
        },
      });
      console.error('Error in pubSubAndroid:', error);
      if (error instanceof HttpException) {
        throw error;
      }

      throwError(
        HttpStatus.BAD_REQUEST,
        'Error processing subscription',
        'Error processing subscription',
        'ERROR_PROCESSING_SUBSCRIPTION',
      );
    }
  }

  async verifyAndroidSub(packageName: string, purchaseToken: string) {
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
      lastOrderId: line?.latestSuccessfulOrderId || null,
    };

    const paymentData = {
      platform: Platform.ANDROID,
      regionCode,
      orderId: line?.latestSuccessfulOrderId,
      amount: price,
      currency,
    };

    return { planData, paymentData, googleData };
  }

  private async warnIfReplacingActivePaidPlan(
    userId: number,
    packageName: string,
    incomingPurchaseToken: string,
    incomingPlanData: CreatePlanDto,
  ): Promise<void> {
    if (!PAID_PLANS.includes(incomingPlanData.basePlanId)) {
      return;
    }

    const { plan: currentPlan } = await this.plansService.getActualByUserId(
      userId,
    );

    if (
      !currentPlan ||
      !PAID_PLANS.includes(currentPlan.basePlanId) ||
      !currentPlan.purchaseToken ||
      currentPlan.purchaseToken === incomingPurchaseToken
    ) {
      return;
    }

    try {
      const { planData: currentGooglePlanData, googleData } =
        await this.verifyAndroidSub(packageName, currentPlan.purchaseToken);

      const isStillActive =
        currentGooglePlanData.planStatus === PlanStatus.ACTIVE ||
        currentGooglePlanData.planStatus === PlanStatus.IN_GRACE;

      if (!isStillActive) {
        return;
      }

      await this.paidPlanEventsService.warning({
        eventType: 'IAP_CREATE_SUB_REPLACES_ACTIVE_PAID_PLAN',
        source: PaidPlanEventSource.FRONTEND_CREATE_SUB,
        userId,
        oldPlanId: currentPlan.id,
        purchaseToken: incomingPurchaseToken,
        linkedPurchaseToken: incomingPlanData.linkedPurchaseToken,
        orderId: incomingPlanData.lastOrderId,
        oldOrderId: currentPlan.lastOrderId,
        basePlanId: incomingPlanData.basePlanId,
        oldBasePlanId: currentPlan.basePlanId,
        planStatus: incomingPlanData.planStatus,
        oldPlanStatus: currentGooglePlanData.planStatus,
        expiryTime: incomingPlanData.expiryTime,
        oldExpiryTime: currentGooglePlanData.expiryTime,
        googleSubscriptionState: googleData.subscriptionState || null,
        googleExpiryTime: currentGooglePlanData.expiryTime,
        googleBasePlanId: currentGooglePlanData.basePlanId,
        googleOrderId: currentGooglePlanData.lastOrderId,
        message:
          'Frontend create-sub is replacing an already active paid plan. Existing behavior continues.',
        metadata: {
          packageName,
          currentPlanDbStatus: currentPlan.planStatus,
          currentPlanDbExpiryTime: currentPlan.expiryTime,
          currentPlanActual: currentPlan.actual,
          incomingLinkedPurchaseTokenMatchesCurrent:
            incomingPlanData.linkedPurchaseToken === currentPlan.purchaseToken,
          testPurchase: Boolean(googleData.testPurchase),
        },
      });
    } catch (error) {
      await this.paidPlanEventsService.conflict({
        eventType: 'IAP_CREATE_SUB_EXISTING_PLAN_GOOGLE_VERIFY_FAILED',
        source: PaidPlanEventSource.FRONTEND_CREATE_SUB,
        userId,
        oldPlanId: currentPlan.id,
        purchaseToken: currentPlan.purchaseToken,
        orderId: currentPlan.lastOrderId,
        basePlanId: currentPlan.basePlanId,
        planStatus: currentPlan.planStatus,
        expiryTime: currentPlan.expiryTime,
        message:
          'Failed to verify existing paid plan while processing a new frontend create-sub request.',
        metadata: {
          packageName,
          incomingBasePlanId: incomingPlanData.basePlanId,
          incomingOrderId: incomingPlanData.lastOrderId,
          errorMessage:
            error instanceof Error ? error.message : 'Unknown Google verify error',
        },
      });
    }
  }
}
