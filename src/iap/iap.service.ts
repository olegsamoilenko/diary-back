import { forwardRef, HttpException, Inject, Injectable } from '@nestjs/common';
import { PlanStatus } from 'src/plans/types';
import { CreatePlanDto } from 'src/plans/dto';
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
import { GooglePlaySubscriptionsService } from './google-play-subscriptions.service';
import { Plan } from 'src/plans/entities/plan.entity';

@Injectable()
export class IapService {
  constructor(
    private readonly plansService: PlansService,
    private readonly paymentsService: PaymentsService,
    private readonly usersService: UsersService,
    private readonly planGateway: PlanGateway,
    private readonly paidPlanEventsService: PaidPlanEventsService,
    private readonly googlePlaySubscriptionsService: GooglePlaySubscriptionsService = new GooglePlaySubscriptionsService(),
  ) {}

  get android() {
    return this.googlePlaySubscriptionsService.android;
  }

  set android(value: any) {
    (this.googlePlaySubscriptionsService as any).android = value;
  }

  async createAndroidSub(
    userId: number,
    packageName: string,
    purchaseToken: string,
    requestMeta?: Record<string, unknown>,
  ) {
    this.debug('createAndroidSub start', {
      userId,
      packageName,
      purchaseTokenSuffix: this.tokenSuffix(purchaseToken),
      requestMeta: requestMeta ?? null,
    });

    await this.paidPlanEventsService.info({
      eventType: 'IAP_CREATE_SUB_RECEIVED',
      source: PaidPlanEventSource.FRONTEND_CREATE_SUB,
      userId,
      purchaseToken,
      message: 'Frontend requested Android subscription creation.',
      metadata: { packageName },
    });

    let verifiedSub: Awaited<
      ReturnType<GooglePlaySubscriptionsService['verifyAndroidSub']>
    >;

    try {
      verifiedSub = await this.googlePlaySubscriptionsService.verifyAndroidSub(
        packageName,
        purchaseToken,
      );
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
    const googleExternalAccountIdentifiers =
      googleData.externalAccountIdentifiers ?? null;

    this.debug('createAndroidSub google verified', {
      userId,
      packageName,
      purchaseTokenSuffix: this.tokenSuffix(purchaseToken),
      linkedPurchaseTokenSuffix: this.tokenSuffix(planData.linkedPurchaseToken),
      orderId: planData.lastOrderId,
      basePlanId: planData.basePlanId,
      planStatus: planData.planStatus,
      expiryTime: planData.expiryTime,
      googleSubscriptionState: googleData.subscriptionState ?? null,
      googleOrderId: planData.lastOrderId,
      googleExternalAccountId:
        googleExternalAccountIdentifiers?.externalAccountId ?? null,
      googleObfuscatedAccountId:
        googleExternalAccountIdentifiers?.obfuscatedExternalAccountId ?? null,
      googleObfuscatedProfileId:
        googleExternalAccountIdentifiers?.obfuscatedExternalProfileId ?? null,
      testPurchase: Boolean(googleData.testPurchase),
    });

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
      const user = await this.usersService.findById(userId, ['settings']);

      if (!user) {
        throwError(
          HttpStatus.BAD_REQUEST,
          'User not found',
          'User with this id does not exist.',
          'USER_NOT_FOUND',
        );
        return;
      }

      this.debug('createAndroidSub user snapshot', {
        userId,
        userUuid: user.uuid ?? null,
        isRegistered: user.isRegistered ?? null,
        isLogged: user.isLogged ?? null,
        subscriptionRuntime: user.subscriptionRuntime ?? null,
        acquisitionSource: user.acquisitionSource ?? null,
        settingsAppVersion: user.settings?.appVersion ?? null,
        settingsAppBuild: user.settings?.appBuild ?? null,
        settingsPlatform: user.settings?.platform ?? null,
        settingsModel: user.settings?.model ?? null,
        settingsOsVersion: user.settings?.osVersion ?? null,
        settingsOsBuildId: user.settings?.osBuildId ?? null,
        settingsUniqueId: user.settings?.uniqueId ?? null,
      });

      const ignoredLegacyPlan =
        await this.resolveLegacyCreateSubActivePlanMismatch(
          userId,
          packageName,
          purchaseToken,
          planData,
        );

      if (ignoredLegacyPlan) {
        return ignoredLegacyPlan;
      }

      this.debug('createAndroidSub before subscribePlan', {
        userId,
        purchaseTokenSuffix: this.tokenSuffix(purchaseToken),
        linkedPurchaseTokenSuffix: this.tokenSuffix(planData.linkedPurchaseToken),
        orderId: planData.lastOrderId,
        basePlanId: planData.basePlanId,
        planStatus: planData.planStatus,
        expiryTime: planData.expiryTime,
      });

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
      this.debug('createAndroidSub failed', {
        userId,
        packageName,
        purchaseTokenSuffix: this.tokenSuffix(purchaseToken),
        orderId: planData.lastOrderId,
        basePlanId: planData.basePlanId,
        planStatus: planData.planStatus,
        expiryTime: planData.expiryTime,
        errorMessage:
          error instanceof Error ? error.message : 'Unknown subscription error',
      });

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
    this.debug('pubSubAndroid start', {
      packageName,
      notificationType: notificationType ?? null,
      purchaseTokenSuffix: this.tokenSuffix(purchaseToken),
    });

    let verifiedSub: Awaited<
      ReturnType<GooglePlaySubscriptionsService['verifyAndroidSub']>
    >;

    try {
      verifiedSub = await this.googlePlaySubscriptionsService.verifyAndroidSub(
        packageName,
        purchaseToken,
      );
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
    const googleExternalAccountIdentifiers =
      googleData.externalAccountIdentifiers ?? null;

    this.debug('pubSubAndroid google verified', {
      packageName,
      notificationType: notificationType ?? null,
      purchaseTokenSuffix: this.tokenSuffix(purchaseToken),
      linkedPurchaseTokenSuffix: this.tokenSuffix(planData.linkedPurchaseToken),
      orderId: planData.lastOrderId,
      basePlanId: planData.basePlanId,
      planStatus: planData.planStatus,
      expiryTime: planData.expiryTime,
      googleSubscriptionState: googleData.subscriptionState ?? null,
      googleExternalAccountId:
        googleExternalAccountIdentifiers?.externalAccountId ?? null,
      googleObfuscatedAccountId:
        googleExternalAccountIdentifiers?.obfuscatedExternalAccountId ?? null,
      googleObfuscatedProfileId:
        googleExternalAccountIdentifiers?.obfuscatedExternalProfileId ?? null,
      testPurchase: Boolean(googleData.testPurchase),
    });

    try {
      const existingPlan =
        await this.plansService.findExistingPlanForIap(purchaseToken);

      if (!existingPlan) {
        this.debug('pubSubAndroid no existing plan for token', {
          purchaseTokenSuffix: this.tokenSuffix(purchaseToken),
          orderId: planData.lastOrderId,
          planStatus: planData.planStatus,
        });
        return;
      }

      this.debug('pubSubAndroid existing plan found', {
        purchaseTokenSuffix: this.tokenSuffix(purchaseToken),
        existingPlanId: existingPlan.id,
        existingPlanUserId: existingPlan.user?.id ?? existingPlan.userId ?? null,
        existingPlanStatus: existingPlan.planStatus,
        existingPlanActual: existingPlan.actual,
        existingPlanOrderId: existingPlan.lastOrderId ?? null,
        incomingOrderId: paymentData.orderId ?? null,
        incomingPlanStatus: planData.planStatus,
        incomingExpiryTime: planData.expiryTime,
      });

      await this.paidPlanEventsService.info({
        eventType: 'PUBSUB_RECEIVED',
        source: PaidPlanEventSource.GOOGLE_PUBSUB,
        purchaseToken,
        message: 'Google Pub/Sub subscription notification received.',
        metadata: { packageName, notificationType },
      });

      const nextOrderId = paymentData.orderId ?? null;
      const prevOrderId = existingPlan.lastOrderId ?? null;

      const isNewCreditsCycle = !!nextOrderId && nextOrderId !== prevOrderId;
      const planUserId = existingPlan.user?.id ?? existingPlan.userId;
      const shouldRestoreActual =
        !!planUserId &&
        (planData.planStatus === PlanStatus.ACTIVE ||
          planData.planStatus === PlanStatus.IN_GRACE);

      this.debug('pubSubAndroid before plan update', {
        purchaseTokenSuffix: this.tokenSuffix(purchaseToken),
        planId: existingPlan.id,
        planUserId: planUserId ?? null,
        shouldRestoreActual,
        isNewCreditsCycle,
        nextOrderId,
        prevOrderId,
        incomingPlanStatus: planData.planStatus,
      });

      const updatedPlan = shouldRestoreActual
        ? await this.plansService.updatePlanFromGooglePubSub(
            existingPlan.id,
            planUserId,
            planData,
            {
              resetUsedCredits: isNewCreditsCycle,
              lastOrderId: nextOrderId,
              restoreActual: true,
            },
          )
        : await this.plansService.updatePlan(existingPlan.id, planData, {
            resetUsedCredits: isNewCreditsCycle,
            lastOrderId: nextOrderId,
          });

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

      if (planUserId) {
        this.debug('pubSubAndroid emit plan status changed', {
          purchaseTokenSuffix: this.tokenSuffix(purchaseToken),
          planId: updatedPlan.id,
          planUserId,
          updatedPlanStatus: updatedPlan.planStatus,
          updatedPlanActual: updatedPlan.actual,
        });
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
    return this.googlePlaySubscriptionsService.verifyAndroidSub(
      packageName,
      purchaseToken,
    );
  }

  private async resolveLegacyCreateSubActivePlanMismatch(
    userId: number,
    packageName: string,
    incomingPurchaseToken: string,
    incomingPlanData: CreatePlanDto,
  ): Promise<Plan | null> {
    if (!PAID_PLANS.includes(incomingPlanData.basePlanId)) {
      return null;
    }

    const { plan: currentPlan } = await this.plansService.getActualByUserId(
      userId,
    );

    this.debug('createAndroidSub current actual plan check', {
      userId,
      incomingPurchaseTokenSuffix: this.tokenSuffix(incomingPurchaseToken),
      incomingOrderId: incomingPlanData.lastOrderId,
      incomingPlanStatus: incomingPlanData.planStatus,
      currentPlanId: currentPlan?.id ?? null,
      currentPlanPurchaseTokenSuffix: this.tokenSuffix(
        currentPlan?.purchaseToken,
      ),
      currentPlanOrderId: currentPlan?.lastOrderId ?? null,
      currentPlanStatus: currentPlan?.planStatus ?? null,
      currentPlanActual: currentPlan?.actual ?? null,
      currentPlanExpiryTime: currentPlan?.expiryTime ?? null,
    });

    if (
      !currentPlan ||
      !PAID_PLANS.includes(currentPlan.basePlanId) ||
      !currentPlan.purchaseToken ||
      currentPlan.purchaseToken === incomingPurchaseToken
    ) {
      return null;
    }

    try {
      const { planData: currentGooglePlanData, googleData } =
        await this.googlePlaySubscriptionsService.verifyAndroidSub(
          packageName,
          currentPlan.purchaseToken,
        );

      const isStillActive =
        currentGooglePlanData.planStatus === PlanStatus.ACTIVE ||
        currentGooglePlanData.planStatus === PlanStatus.IN_GRACE;
      const incomingLinkedPurchaseTokenMatchesCurrent =
        incomingPlanData.linkedPurchaseToken === currentPlan.purchaseToken;

      this.debug('createAndroidSub current Google plan check', {
        userId,
        incomingPurchaseTokenSuffix: this.tokenSuffix(incomingPurchaseToken),
        currentPlanId: currentPlan.id,
        currentPlanPurchaseTokenSuffix: this.tokenSuffix(
          currentPlan.purchaseToken,
        ),
        currentGoogleStatus: currentGooglePlanData.planStatus,
        currentGoogleExpiryTime: currentGooglePlanData.expiryTime,
        isStillActive,
        incomingLinkedPurchaseTokenMatchesCurrent:
          incomingLinkedPurchaseTokenMatchesCurrent,
      });

      if (!isStillActive) {
        return null;
      }

      if (!incomingLinkedPurchaseTokenMatchesCurrent) {
        await this.paidPlanEventsService.warning({
          eventType: 'IAP_CREATE_SUB_IGNORED_ACTIVE_PAID_PLAN_MISMATCH',
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
            'Legacy frontend create-sub was ignored because the user already has an active paid plan and the incoming token is not linked to it.',
          metadata: {
            packageName,
            currentPlanDbStatus: currentPlan.planStatus,
            currentPlanDbExpiryTime: currentPlan.expiryTime,
            currentPlanActual: currentPlan.actual,
            testPurchase: Boolean(googleData.testPurchase),
          },
        });

        this.debug('createAndroidSub ignored active paid mismatch', {
          userId,
          incomingPurchaseTokenSuffix: this.tokenSuffix(incomingPurchaseToken),
          incomingOrderId: incomingPlanData.lastOrderId,
          incomingPlanStatus: incomingPlanData.planStatus,
          currentPlanId: currentPlan.id,
          currentPlanPurchaseTokenSuffix: this.tokenSuffix(
            currentPlan.purchaseToken,
          ),
          currentGoogleStatus: currentGooglePlanData.planStatus,
          currentGoogleExpiryTime: currentGooglePlanData.expiryTime,
        });

        return currentPlan;
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
            incomingLinkedPurchaseTokenMatchesCurrent,
          testPurchase: Boolean(googleData.testPurchase),
        },
      });

      return null;
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

      return null;
    }
  }

  private tokenSuffix(token?: string | null) {
    return token ? token.slice(-10) : null;
  }

  private debug(message: string, data: Record<string, unknown>) {
    console.log('[IAP_DEBUG]', message, JSON.stringify(data));
  }
}
