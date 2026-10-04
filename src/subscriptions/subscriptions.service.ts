import { Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { User } from 'src/users/entities/user.entity';
import { Plan } from 'src/plans/entities/plan.entity';
import { throwError } from 'src/common/utils';
import { HttpStatus } from 'src/common/utils/http-status';
import { UserPlanState } from './entities/user-plan-state.entity';
import { StoreSubscription } from './entities/store-subscription.entity';
import {
  PAID_SUBSCRIPTION_BASE_PLAN_IDS,
  getSubscriptionPlanCatalogItem,
  SUBSCRIPTION_PLAN_CATALOG,
} from './subscription-catalog';
import {
  SubscriptionAccessStatus,
  SubscriptionAccessReason,
  SubscriptionBasePlanId,
  SubscriptionBillingStatus,
  SubscriptionRuntime,
  SubscriptionSource,
  StoreSubscriptionProvider,
} from './types';
import { SubscribeGooglePlayDto } from './dto/subscribe-google-play.dto';
import { SubscriptionsBootstrapDto } from './dto/subscriptions-bootstrap.dto';
import { EnsureInitialSubscriptionStateDto } from './dto/ensure-initial-subscription-state.dto';
import { GooglePlaySubscriptionsService } from 'src/iap/google-play-subscriptions.service';
import { PaidPlanEventsService } from 'src/paid-plan-events/paid-plan-events.service';
import { PaidPlanEventSource } from 'src/paid-plan-events/entities/paid-plan-event.entity';
import { SubscriptionLegacyMapper } from './subscription-legacy.mapper';
import { CreditWalletService } from 'src/credits/credit-wallet.service';
import { buildEffectiveAiAccess } from './effective-ai-access';
import { buildAdvertisingAccess } from './advertising-access';
import { buildAdvertisingRollout } from './advertising-rollout';
import { canStoreSubscriptionGrantAccess } from './store-subscription-access';
import { preservesDeferredCreditCycle } from './deferred-credit-cycle';

function errorMetadata(error: unknown): {
  errorMessage: string | null;
  errorCode: string | number | null;
} {
  if (error instanceof Error) {
    const withCode = error as Error & { code?: unknown };
    return {
      errorMessage: error.message || null,
      errorCode:
        typeof withCode.code === 'string' || typeof withCode.code === 'number'
          ? withCode.code
          : null,
    };
  }
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    return {
      errorMessage: typeof record.message === 'string' ? record.message : null,
      errorCode:
        typeof record.code === 'string' || typeof record.code === 'number'
          ? record.code
          : null,
    };
  }
  return {
    errorMessage: typeof error === 'string' ? error : null,
    errorCode: null,
  };
}

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Plan)
    private readonly plansRepository: Repository<Plan>,
    @InjectRepository(UserPlanState)
    private readonly userPlanStatesRepository: Repository<UserPlanState>,
    @InjectRepository(StoreSubscription)
    private readonly storeSubscriptionsRepository: Repository<StoreSubscription>,
    private readonly googlePlaySubscriptionsService: GooglePlaySubscriptionsService,
    private readonly paidPlanEventsService: PaidPlanEventsService,
    private readonly legacyMapper: SubscriptionLegacyMapper,
    @Optional()
    private readonly creditWalletService?: CreditWalletService,
  ) {}

  async bootstrap(
    userId: number,
    dto: SubscriptionsBootstrapDto = {},
    now = new Date(),
  ) {
    return this.dataSource.transaction(async (manager) => {
      const user = await manager.findOne(User, {
        where: { id: userId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!user) {
        throwError(
          HttpStatus.BAD_REQUEST,
          'User not found',
          'User with this id does not exist.',
          'USER_NOT_FOUND',
        );
      }

      if (user.subscriptionRuntime === SubscriptionRuntime.V2) {
        const subscription = await manager.findOne(UserPlanState, {
          where: { userId },
          relations: ['currentStoreSubscription'],
        });

        this.debug('subscriptions.bootstrap existing V2 runtime', {
          userId,
          subscriptionId: subscription?.id ?? null,
          currentStoreSubscriptionId:
            subscription?.currentStoreSubscriptionId ?? null,
          accessStatus: subscription?.accessStatus ?? null,
          billingStatus: subscription?.billingStatus ?? null,
          basePlanId: subscription?.basePlanId ?? null,
          appVersion: dto.appVersion ?? null,
          appBuild: dto.appBuild ?? null,
          platform: dto.platform ?? null,
        });

        return {
          subscription,
          runtime: SubscriptionRuntime.V2,
          activated: false,
        };
      }

      const legacyPlan = await manager.findOne(Plan, {
        where: { userId, actual: true },
        order: { id: 'DESC' },
        lock: { mode: 'pessimistic_write' },
      });

      this.debug('subscriptions.bootstrap legacy runtime selected plan', {
        userId,
        userUuid: user.uuid ?? null,
        legacyPlanId: legacyPlan?.id ?? null,
        legacyPlanActual: legacyPlan?.actual ?? null,
        legacyPlanStatus: legacyPlan?.planStatus ?? null,
        legacyBasePlanId: legacyPlan?.basePlanId ?? null,
        legacyExpiryTime: legacyPlan?.expiryTime ?? null,
        legacyPurchaseTokenSuffix: this.tokenSuffix(legacyPlan?.purchaseToken),
        appVersion: dto.appVersion ?? null,
        appBuild: dto.appBuild ?? null,
        platform: dto.platform ?? null,
      });

      const subscription = await this.syncLegacyPlanToUserPlanStateWithManager(
        manager,
        user,
        legacyPlan,
        now,
      );

      user.subscriptionRuntime = SubscriptionRuntime.V2;
      await manager.save(User, user);

      this.debug('subscriptions.bootstrap activated V2 runtime', {
        userId,
        subscriptionId: subscription?.id ?? null,
        currentStoreSubscriptionId:
          subscription?.currentStoreSubscriptionId ?? null,
        accessStatus: subscription?.accessStatus ?? null,
        billingStatus: subscription?.billingStatus ?? null,
        basePlanId: subscription?.basePlanId ?? null,
        legacyPlanId: subscription?.legacyPlanId ?? null,
      });

      await this.paidPlanEventsService.info({
        eventType: 'SUBSCRIPTION_RUNTIME_ACTIVATED_V2',
        source: PaidPlanEventSource.PLANS_SERVICE,
        userId,
        oldPlanId: legacyPlan?.id,
        basePlanId: legacyPlan?.basePlanId,
        planStatus: legacyPlan?.planStatus,
        expiryTime: legacyPlan?.expiryTime ?? null,
        message:
          'User subscription runtime was activated for the new subscriptions API.',
        metadata: {
          appBuild: dto.appBuild ?? null,
          appVersion: dto.appVersion ?? null,
          platform: dto.platform ?? null,
        },
      });

      return {
        subscription,
        runtime: SubscriptionRuntime.V2,
        activated: true,
      };
    });
  }

  async getCurrentUserSubscription(userId: number) {
    const now = new Date();
    const result = await this.refreshEffectiveAccessState(userId, now);
    return {
      ...result,
      advertisingAccess: buildAdvertisingAccess(result.subscription, now),
      // Operational kill switch, default off. Entitlement alone never enables ads.
      advertisingRollout: buildAdvertisingRollout(),
    };
  }

  async findStoreSubscriptionOwnerByPurchaseToken(purchaseToken: string) {
    return this.storeSubscriptionsRepository.findOne({
      where: { purchaseToken },
      relations: ['user'],
    });
  }

  async hasPaidStoreSubscriptionForUser(userId: number): Promise<boolean> {
    const subscription = await this.storeSubscriptionsRepository.findOne({
      where: {
        userId,
        basePlanId: In(PAID_SUBSCRIPTION_BASE_PLAN_IDS),
      },
    });

    return Boolean(subscription);
  }

  async refreshEffectiveAccessState(userId: number, now = new Date()) {
    return this.dataSource.transaction(async (manager) => {
      let subscription = await manager.findOne(UserPlanState, {
        where: { userId },
        lock: { mode: 'pessimistic_write' },
      });

      let purchasedCredits = this.creditWalletService
        ? await this.creditWalletService.getSummary(userId, manager)
        : undefined;

      if (!subscription) {
        return {
          subscription: null,
          ...(purchasedCredits
            ? {
                purchasedCredits,
                aiAccess: buildEffectiveAiAccess(null, purchasedCredits),
              }
            : {}),
        };
      }

      const accessReasonBeforeDebtSettlement = this.deriveEffectiveAccessReason(
        subscription,
        now,
      );
      const availablePlanCredits = Math.max(
        0,
        (subscription.creditsLimit ?? 0) - (subscription.usedCredits ?? 0),
      );
      if (
        accessReasonBeforeDebtSettlement === SubscriptionAccessReason.NONE &&
        availablePlanCredits > 0 &&
        this.creditWalletService?.settleDebtWithManager
      ) {
        const settlement = await this.creditWalletService.settleDebtWithManager(
          manager,
          userId,
          availablePlanCredits,
          {
            subscriptionId: subscription.id,
            basePlanId: subscription.basePlanId,
          },
        );

        if (settlement.settledCredits > 0) {
          subscription = await manager.save(
            UserPlanState,
            manager.merge(UserPlanState, subscription, {
              usedCredits:
                (subscription.usedCredits ?? 0) + settlement.settledCredits,
              metadata: {
                ...(subscription.metadata ?? {}),
                walletDebtSettledCredits:
                  Number(subscription.metadata?.walletDebtSettledCredits ?? 0) +
                  settlement.settledCredits,
                lastWalletDebtSettlementAt: now.toISOString(),
              },
            }),
          );
          purchasedCredits = settlement.summary;
        }
      }

      const accessReason = this.deriveEffectiveAccessReason(subscription, now);
      const accessStatus = this.toAccessStatus(accessReason);

      if (
        subscription.accessStatus === accessStatus &&
        subscription.metadata?.accessReason === accessReason
      ) {
        await this.attachCurrentStoreSubscriptionWithManager(
          manager,
          subscription,
        );
        return {
          subscription,
          ...(purchasedCredits
            ? {
                purchasedCredits,
                aiAccess: buildEffectiveAiAccess(
                  subscription,
                  purchasedCredits,
                ),
              }
            : {}),
        };
      }

      const saved = await manager.save(
        UserPlanState,
        manager.merge(UserPlanState, subscription, {
          accessStatus,
          metadata: {
            ...(subscription.metadata ?? {}),
            accessReason,
          },
        }),
      );
      await this.attachCurrentStoreSubscriptionWithManager(manager, saved);

      return {
        subscription: saved,
        ...(purchasedCredits
          ? {
              purchasedCredits,
              aiAccess: buildEffectiveAiAccess(saved, purchasedCredits),
            }
          : {}),
      };
    });
  }

  private async attachCurrentStoreSubscriptionWithManager(
    manager: EntityManager,
    subscription: UserPlanState,
  ): Promise<void> {
    subscription.currentStoreSubscription =
      subscription.currentStoreSubscriptionId
        ? await manager.findOne(StoreSubscription, {
            where: { id: subscription.currentStoreSubscriptionId },
          })
        : null;
  }

  async syncLegacyPlanToUserPlanState(
    userId: number,
    plan: Plan | null,
    now = new Date(),
  ) {
    return this.dataSource.transaction(async (manager) => {
      const user = await manager.findOne(User, {
        where: { id: userId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!user) {
        throwError(
          HttpStatus.BAD_REQUEST,
          'User not found',
          'User with this id does not exist.',
          'USER_NOT_FOUND',
        );
      }

      return this.syncLegacyPlanToUserPlanStateWithManager(
        manager,
        user,
        plan,
        now,
      );
    });
  }

  async ensureInitialState(
    userId: number,
    dto: EnsureInitialSubscriptionStateDto = {},
    now = new Date(),
  ) {
    return this.dataSource.transaction(async (manager) => {
      const user = await manager.findOne(User, {
        where: { id: userId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!user) {
        throwError(
          HttpStatus.BAD_REQUEST,
          'User not found',
          'User with this id does not exist.',
          'USER_NOT_FOUND',
        );
      }

      const existing = await manager.findOne(UserPlanState, {
        where: { userId },
        lock: { mode: 'pessimistic_write' },
      });

      if (existing) {
        await this.activateV2RuntimeWithManager(manager, user);

        return { subscription: existing, created: false };
      }

      const payload =
        dto.isFirstInstall === false
          ? this.buildNoPlanSelectionPayload(userId, null)
          : this.buildTrialPayload(userId, null, now);

      const subscription = manager.create(UserPlanState, payload);
      const saved = await manager.save(UserPlanState, subscription);

      await this.activateV2RuntimeWithManager(manager, user, false);

      return { subscription: saved, created: true };
    });
  }

  async startTrial(userId: number, now = new Date()) {
    return this.dataSource.transaction(async (manager) => {
      const user = await manager.findOne(User, {
        where: { id: userId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!user) {
        throwError(
          HttpStatus.BAD_REQUEST,
          'User not found',
          'User with this id does not exist.',
          'USER_NOT_FOUND',
        );
      }

      const existing = await manager.findOne(UserPlanState, {
        where: { userId },
        lock: { mode: 'pessimistic_write' },
      });

      if (this.hasUsedTrial(existing)) {
        throwError(
          HttpStatus.BAD_REQUEST,
          'Trial already used',
          'You have already used your free trial.',
          'TRIAL_ALREADY_USED',
        );
      }

      const payload = this.buildTrialPayload(userId, existing, now);

      const subscription = existing
        ? manager.merge(UserPlanState, existing, payload)
        : manager.create(UserPlanState, payload);

      const saved = await manager.save(UserPlanState, subscription);

      await this.activateV2RuntimeWithManager(manager, user, false);

      return { subscription: saved };
    });
  }

  async useWithoutSubscription(userId: number) {
    return this.dataSource.transaction(async (manager) => {
      const user = await manager.findOne(User, {
        where: { id: userId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!user) {
        throwError(
          HttpStatus.BAD_REQUEST,
          'User not found',
          'User with this id does not exist.',
          'USER_NOT_FOUND',
        );
      }

      const existing = await manager.findOne(UserPlanState, {
        where: { userId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!existing) {
        throwError(
          HttpStatus.BAD_REQUEST,
          'Subscription state not found',
          'Subscription state must be initialized before using without subscription.',
          'SUBSCRIPTION_STATE_NOT_INITIALIZED',
        );
      }

      const effectiveReason = this.deriveEffectiveAccessReason(existing);

      if (!this.canSwitchToUseWithoutSubscription(existing, effectiveReason)) {
        throwError(
          HttpStatus.CONFLICT,
          'Cannot switch to use without subscription',
          'Use without subscription is not allowed while a paid subscription period is active.',
          'USE_WITHOUT_SUBSCRIPTION_NOT_ALLOWED',
        );
      }

      const metadata = {
        ...(existing.metadata ?? {}),
        accessReason: SubscriptionAccessReason.USE_WITHOUT_SUBSCRIPTION,
        useWithoutSubscriptionAt: new Date().toISOString(),
      };
      const payload: Partial<UserPlanState> = {
        userId,
        source: SubscriptionSource.NONE,
        basePlanId: null,
        name: 'None',
        price: 0,
        currency: null,
        billingStatus: existing.billingStatus,
        accessStatus: SubscriptionAccessStatus.LIMITED,
        startTime: existing.startTime ?? null,
        expiryTime: existing.expiryTime ?? null,
        creditsLimit: existing.creditsLimit ?? 0,
        usedCredits: existing.usedCredits ?? 0,
        inputUsedCredits: existing.inputUsedCredits ?? 0,
        outputUsedCredits: existing.outputUsedCredits ?? 0,
        useWithoutSubscription: true,
        currentStoreSubscriptionId: existing.currentStoreSubscriptionId ?? null,
        legacyPlanId: existing.legacyPlanId ?? null,
        metadata,
      };

      const subscription = manager.merge(UserPlanState, existing, payload);
      const saved = await manager.save(UserPlanState, subscription);

      await this.activateV2RuntimeWithManager(manager, user, true);

      if (saved.currentStoreSubscriptionId) {
        saved.currentStoreSubscription = await manager.findOne(
          StoreSubscription,
          {
            where: { id: saved.currentStoreSubscriptionId },
          },
        );
      }

      return { subscription: saved };
    });
  }

  async continueWithoutAi(userId: number) {
    await this.dataSource.transaction(async (manager) => {
      const user = await manager.findOne(User, {
        where: { id: userId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!user) {
        throwError(
          HttpStatus.BAD_REQUEST,
          'User not found',
          'User with this id does not exist.',
          'USER_NOT_FOUND',
        );
      }

      const existing = await manager.findOne(UserPlanState, {
        where: { userId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!existing) {
        throwError(
          HttpStatus.BAD_REQUEST,
          'Subscription state not found',
          'Subscription state must be initialized before continuing without AI.',
          'SUBSCRIPTION_STATE_NOT_INITIALIZED',
        );
      }

      const effectiveReason = this.deriveEffectiveAccessReason(existing);
      if (!this.canSwitchToUseWithoutSubscription(existing, effectiveReason)) {
        throwError(
          HttpStatus.CONFLICT,
          'Cannot continue without AI',
          'Continuing without AI is not allowed while paid access is active.',
          'CONTINUE_WITHOUT_AI_NOT_ALLOWED',
        );
      }

      await manager.save(
        UserPlanState,
        manager.merge(UserPlanState, existing, {
          useWithoutSubscription: true,
          metadata: {
            ...(existing.metadata ?? {}),
            freeModeSelectedAt: new Date().toISOString(),
          },
        }),
      );

      await this.activateV2RuntimeWithManager(manager, user, true);
    });

    return this.refreshEffectiveAccessState(userId);
  }

  private canSwitchToUseWithoutSubscription(
    subscription: Pick<
      UserPlanState,
      'source' | 'basePlanId' | 'useWithoutSubscription'
    >,
    reason: SubscriptionAccessReason,
  ) {
    if (
      subscription.source === SubscriptionSource.NONE ||
      subscription.basePlanId === null
    ) {
      return (
        reason === SubscriptionAccessReason.PLAN_SELECTION_REQUIRED ||
        reason === SubscriptionAccessReason.USE_WITHOUT_SUBSCRIPTION
      );
    }

    if (
      subscription.source === SubscriptionSource.TRIAL ||
      subscription.basePlanId === SubscriptionBasePlanId.START
    ) {
      return (
        reason === SubscriptionAccessReason.TRIAL_EXPIRED ||
        reason === SubscriptionAccessReason.CREDIT_EXCEEDED ||
        reason === SubscriptionAccessReason.TOKEN_EXCEEDED
      );
    }

    return (
      reason === SubscriptionAccessReason.SUBSCRIPTION_EXPIRED ||
      reason === SubscriptionAccessReason.SUBSCRIPTION_CANCELED
    );
  }

  async subscribeGooglePlay(userId: number, dto: SubscribeGooglePlayDto) {
    if (!dto?.packageName || !dto?.purchaseToken) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'Invalid Google Play subscription payload',
        'packageName and purchaseToken are required.',
        'INVALID_GOOGLE_PLAY_SUBSCRIPTION_PAYLOAD',
      );
    }

    await this.paidPlanEventsService.info({
      eventType: 'SUBSCRIPTIONS_GOOGLE_PLAY_SUBSCRIBE_RECEIVED',
      source: PaidPlanEventSource.FRONTEND_CREATE_SUB,
      userId,
      purchaseToken: dto.purchaseToken,
      message: 'New subscriptions API received Android subscription creation.',
      metadata: {
        packageName: dto.packageName,
        clientObfuscatedAccountId: dto.obfuscatedAccountId ?? null,
      },
    });

    let verified: Awaited<
      ReturnType<GooglePlaySubscriptionsService['verifyAndroidSubscription']>
    >;

    try {
      verified =
        await this.googlePlaySubscriptionsService.verifyAndroidSubscription(
          dto.packageName,
          dto.purchaseToken,
        );
    } catch (error: unknown) {
      const { errorMessage, errorCode } = errorMetadata(error);
      await this.paidPlanEventsService.conflict({
        eventType: 'SUBSCRIPTIONS_GOOGLE_PLAY_VERIFY_FAILED',
        source: PaidPlanEventSource.FRONTEND_CREATE_SUB,
        userId,
        purchaseToken: dto.purchaseToken,
        message:
          'New subscriptions API failed to verify purchase token with Google Play.',
        metadata: {
          packageName: dto.packageName,
          errorMessage,
          errorCode,
        },
      });
      throw error;
    }

    const { storeData, googleData } = verified;
    const googleExternalAccountIdentifiers =
      googleData.externalAccountIdentifiers ?? null;
    const googleObfuscatedAccountId =
      googleExternalAccountIdentifiers?.obfuscatedExternalAccountId ?? null;

    this.debug('subscriptions.google-play google verified', {
      userId,
      purchaseTokenSuffix: this.tokenSuffix(dto.purchaseToken),
      orderId: storeData.lastOrderId,
      basePlanId: storeData.basePlanId,
      storeStatus: storeData.storeStatus,
      expiryTime: storeData.expiryTime,
      googleSubscriptionState: googleData.subscriptionState ?? null,
      clientObfuscatedAccountId: dto.obfuscatedAccountId ?? null,
      googleExternalAccountId:
        googleExternalAccountIdentifiers?.externalAccountId ?? null,
      googleObfuscatedAccountId,
      googleObfuscatedProfileId:
        googleExternalAccountIdentifiers?.obfuscatedExternalProfileId ?? null,
      testPurchase: Boolean(googleData.testPurchase),
    });

    const catalogPlan = getSubscriptionPlanCatalogItem(storeData.basePlanId);

    if (!catalogPlan?.isPaid) {
      await this.paidPlanEventsService.conflict({
        eventType: 'SUBSCRIPTIONS_GOOGLE_PLAY_UNKNOWN_BASE_PLAN',
        source: PaidPlanEventSource.FRONTEND_CREATE_SUB,
        userId,
        purchaseToken: dto.purchaseToken,
        basePlanId: storeData.basePlanId,
        planStatus: storeData.storeStatus,
        expiryTime: storeData.expiryTime,
        message: 'Google Play returned an unknown or non-paid base plan.',
        metadata: {
          packageName: dto.packageName,
          googleSubscriptionState: googleData.subscriptionState || null,
        },
      });
      throwError(
        HttpStatus.BAD_REQUEST,
        'Unknown paid plan',
        'Google Play returned an unknown or non-paid base plan.',
        'UNKNOWN_PAID_PLAN',
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const user = await manager.findOne(User, {
        where: { id: userId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!user) {
        throwError(
          HttpStatus.BAD_REQUEST,
          'User not found',
          'User with this id does not exist.',
          'USER_NOT_FOUND',
        );
      }

      this.debug('subscriptions.google-play user snapshot', {
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
        purchaseTokenSuffix: this.tokenSuffix(dto.purchaseToken),
      });

      if (
        googleObfuscatedAccountId &&
        user.uuid &&
        googleObfuscatedAccountId !== user.uuid
      ) {
        await this.paidPlanEventsService.conflict({
          eventType: 'SUBSCRIPTIONS_GOOGLE_PLAY_OBFUSCATED_ACCOUNT_MISMATCH',
          source: PaidPlanEventSource.FRONTEND_CREATE_SUB,
          userId,
          purchaseToken: dto.purchaseToken,
          linkedPurchaseToken: storeData.linkedPurchaseToken,
          orderId: storeData.lastOrderId,
          basePlanId: storeData.basePlanId,
          planStatus: storeData.storeStatus,
          expiryTime: storeData.expiryTime,
          message:
            'Google Play purchase token belongs to a different obfuscated account id.',
          metadata: {
            packageName: dto.packageName,
            clientObfuscatedAccountId: dto.obfuscatedAccountId ?? null,
            googleObfuscatedAccountId,
            userUuid: user.uuid,
          },
        });
        throwError(
          HttpStatus.CONFLICT,
          'Subscription account mismatch',
          'This subscription belongs to another account.',
          'SUBSCRIPTION_ACCOUNT_MISMATCH',
        );
      }

      const existingStoreSubscription = await manager.findOne(
        StoreSubscription,
        {
          where: { purchaseToken: dto.purchaseToken },
          lock: { mode: 'pessimistic_write' },
        },
      );

      this.debug('subscriptions.google-play existing token lookup', {
        requestedUserId: userId,
        purchaseTokenSuffix: this.tokenSuffix(dto.purchaseToken),
        found: Boolean(existingStoreSubscription),
        existingStoreSubscriptionId: existingStoreSubscription?.id ?? null,
        existingUserId: existingStoreSubscription?.userId ?? null,
        existingBasePlanId: existingStoreSubscription?.basePlanId ?? null,
        existingStoreStatus: existingStoreSubscription?.storeStatus ?? null,
        existingOrderId: existingStoreSubscription?.lastOrderId ?? null,
        existingExpiryTime: existingStoreSubscription?.expiryTime ?? null,
        incomingBasePlanId: storeData.basePlanId,
        incomingStoreStatus: storeData.storeStatus,
        incomingOrderId: storeData.lastOrderId ?? null,
        incomingExpiryTime: storeData.expiryTime ?? null,
      });

      if (
        existingStoreSubscription?.userId &&
        existingStoreSubscription.userId !== userId &&
        canStoreSubscriptionGrantAccess(
          storeData.storeStatus,
          storeData.expiryTime,
        )
      ) {
        await this.paidPlanEventsService.conflict({
          eventType: 'SUBSCRIPTIONS_GOOGLE_PLAY_TOKEN_ALREADY_LINKED',
          source: PaidPlanEventSource.FRONTEND_CREATE_SUB,
          userId,
          oldPlanId: existingStoreSubscription.legacyPlanId,
          purchaseToken: dto.purchaseToken,
          linkedPurchaseToken: storeData.linkedPurchaseToken,
          orderId: storeData.lastOrderId,
          oldOrderId: existingStoreSubscription.lastOrderId,
          basePlanId: storeData.basePlanId,
          oldBasePlanId: existingStoreSubscription.basePlanId,
          planStatus: storeData.storeStatus,
          oldPlanStatus: existingStoreSubscription.storeStatus,
          expiryTime: storeData.expiryTime,
          oldExpiryTime: existingStoreSubscription.expiryTime,
          message:
            'Google Play purchase token is already linked to another active user subscription.',
          metadata: {
            packageName: dto.packageName,
            existingUserId: existingStoreSubscription.userId,
            requestedUserId: userId,
          },
        });
        throwError(
          HttpStatus.CONFLICT,
          'Subscription already belongs to another user',
          'This subscription is already linked to another active account.',
          'SUBSCRIPTION_ALREADY_LINKED',
        );
      }

      const previousOrderId = existingStoreSubscription?.lastOrderId ?? null;
      const storeSubscriptionPayload: Partial<StoreSubscription> = {
        userId,
        provider: StoreSubscriptionProvider.GOOGLE_PLAY,
        platform: storeData.platform,
        regionCode: storeData.regionCode,
        productId: storeData.productId,
        basePlanId: storeData.basePlanId,
        purchaseToken: dto.purchaseToken,
        linkedPurchaseToken: storeData.linkedPurchaseToken,
        lastOrderId: storeData.lastOrderId,
        storeStatus: storeData.storeStatus,
        startTime: storeData.startTime,
        expiryTime: storeData.expiryTime,
        autoRenewEnabled: storeData.autoRenewEnabled,
        price: storeData.price,
        currency: storeData.currency,
        rawStoreData: googleData as Record<string, unknown>,
        legacyPlanId: existingStoreSubscription?.legacyPlanId ?? null,
      };
      const storeSubscription = existingStoreSubscription
        ? manager.merge(
            StoreSubscription,
            existingStoreSubscription,
            storeSubscriptionPayload,
          )
        : manager.create(StoreSubscription, storeSubscriptionPayload);
      const savedStoreSubscription = await manager.save(
        StoreSubscription,
        storeSubscription,
      );

      const existingState = await manager.findOne(UserPlanState, {
        where: { userId },
        lock: { mode: 'pessimistic_write' },
      });
      const isNewCreditsCycle =
        !!storeData.lastOrderId && storeData.lastOrderId !== previousOrderId;
      const shouldResetCredits =
        !existingState ||
        (!preservesDeferredCreditCycle(existingState, storeData) &&
          (existingState.currentStoreSubscriptionId !==
            savedStoreSubscription.id ||
            isNewCreditsCycle));
      const accessStatus = this.deriveStoreAccessStatus(
        storeData.storeStatus,
        storeData.expiryTime,
        shouldResetCredits ? 0 : existingState.usedCredits,
        catalogPlan.creditsLimit,
      );
      const accessReason = this.deriveStoreAccessReason(
        storeData.storeStatus,
        storeData.expiryTime,
        shouldResetCredits ? 0 : existingState.usedCredits,
        catalogPlan.creditsLimit,
      );
      const statePayload: Partial<UserPlanState> = {
        userId,
        source: SubscriptionSource.GOOGLE_PLAY,
        basePlanId: storeData.basePlanId,
        name: catalogPlan.name,
        price: storeData.price,
        currency: storeData.currency,
        billingStatus: storeData.storeStatus,
        accessStatus,
        startTime: storeData.startTime,
        expiryTime: storeData.expiryTime,
        creditsLimit: catalogPlan.creditsLimit,
        usedCredits: shouldResetCredits ? 0 : existingState.usedCredits,
        inputUsedCredits: shouldResetCredits
          ? 0
          : existingState.inputUsedCredits,
        outputUsedCredits: shouldResetCredits
          ? 0
          : existingState.outputUsedCredits,
        useWithoutSubscription: false,
        currentStoreSubscriptionId: savedStoreSubscription.id,
        legacyPlanId: existingState?.legacyPlanId ?? null,
        metadata: {
          ...(existingState?.metadata ?? {}),
          lastGooglePlaySubscribeAt: new Date().toISOString(),
          googleSubscriptionState: googleData.subscriptionState || null,
          accessReason,
          testPurchase: Boolean(googleData.testPurchase),
        },
      };
      const userPlanState = existingState
        ? manager.merge(UserPlanState, existingState, statePayload)
        : manager.create(UserPlanState, statePayload);
      const savedState = await manager.save(UserPlanState, userPlanState);
      savedState.currentStoreSubscription = savedStoreSubscription;

      await this.activateV2RuntimeWithManager(manager, user, false);

      await this.paidPlanEventsService.info({
        eventType: 'SUBSCRIPTIONS_GOOGLE_PLAY_SUBSCRIBED',
        source: PaidPlanEventSource.FRONTEND_CREATE_SUB,
        userId,
        purchaseToken: dto.purchaseToken,
        linkedPurchaseToken: storeData.linkedPurchaseToken,
        orderId: storeData.lastOrderId,
        oldOrderId: previousOrderId,
        basePlanId: storeData.basePlanId,
        oldBasePlanId: existingState?.basePlanId ?? null,
        planStatus: storeData.storeStatus,
        oldPlanStatus: existingState?.billingStatus ?? null,
        expiryTime: storeData.expiryTime,
        oldExpiryTime: existingState?.expiryTime ?? null,
        actualAfter: true,
        message:
          'New subscriptions API created or updated a Google Play subscription.',
        metadata: {
          packageName: dto.packageName,
          storeSubscriptionId: savedStoreSubscription.id,
          userPlanStateId: savedState.id,
          resetCredits: shouldResetCredits,
          googleSubscriptionState: googleData.subscriptionState || null,
          testPurchase: Boolean(googleData.testPurchase),
        },
      });

      this.debug('subscriptions.google-play saved', {
        userId,
        purchaseTokenSuffix: this.tokenSuffix(dto.purchaseToken),
        storeSubscriptionId: savedStoreSubscription.id,
        userPlanStateId: savedState.id,
        basePlanId: savedStoreSubscription.basePlanId,
        storeStatus: savedStoreSubscription.storeStatus,
        accessStatus: savedState.accessStatus,
        expiryTime: savedStoreSubscription.expiryTime,
        orderId: savedStoreSubscription.lastOrderId,
        resetCredits: shouldResetCredits,
      });

      return {
        subscription: savedState,
        storeSubscription: savedStoreSubscription,
      };
    });
  }

  async handleGooglePlayPubSub(
    packageName: string,
    purchaseToken: string,
    notificationType?: number,
  ) {
    const existingStoreSubscription =
      await this.storeSubscriptionsRepository.findOne({
        where: { purchaseToken },
      });

    if (!existingStoreSubscription) {
      let verifiedWithoutStore: Awaited<
        ReturnType<GooglePlaySubscriptionsService['verifyAndroidSubscription']>
      >;

      try {
        verifiedWithoutStore =
          await this.googlePlaySubscriptionsService.verifyAndroidSubscription(
            packageName,
            purchaseToken,
          );
      } catch (error: unknown) {
        const { errorMessage, errorCode } = errorMetadata(error);
        this.debug(
          'subscriptions.pubsub google verify failed without store subscription',
          {
            packageName,
            notificationType: notificationType ?? null,
            purchaseTokenSuffix: this.tokenSuffix(purchaseToken),
            errorMessage,
            errorCode,
          },
        );
        return { handled: false, reason: 'STORE_SUBSCRIPTION_NOT_FOUND' };
      }

      const { storeData, googleData } = verifiedWithoutStore;
      const googleExternalAccountIdentifiers =
        googleData.externalAccountIdentifiers ?? null;
      const googleObfuscatedAccountId =
        googleExternalAccountIdentifiers?.obfuscatedExternalAccountId ?? null;

      this.debug(
        'subscriptions.pubsub google verified without store subscription',
        {
          packageName,
          notificationType: notificationType ?? null,
          purchaseTokenSuffix: this.tokenSuffix(purchaseToken),
          orderId: storeData.lastOrderId,
          basePlanId: storeData.basePlanId,
          storeStatus: storeData.storeStatus,
          expiryTime: storeData.expiryTime,
          googleSubscriptionState: googleData.subscriptionState ?? null,
          googleExternalAccountId:
            googleExternalAccountIdentifiers?.externalAccountId ?? null,
          googleObfuscatedAccountId,
          googleObfuscatedProfileId:
            googleExternalAccountIdentifiers?.obfuscatedExternalProfileId ??
            null,
          testPurchase: Boolean(googleData.testPurchase),
        },
      );

      if (!googleObfuscatedAccountId) {
        return { handled: false, reason: 'STORE_SUBSCRIPTION_NOT_FOUND' };
      }

      const catalogPlan = getSubscriptionPlanCatalogItem(storeData.basePlanId);

      if (!catalogPlan?.isPaid) {
        await this.paidPlanEventsService.conflict({
          eventType: 'SUBSCRIPTIONS_PUBSUB_UNKNOWN_BASE_PLAN',
          source: PaidPlanEventSource.GOOGLE_PUBSUB,
          purchaseToken,
          basePlanId: storeData.basePlanId,
          planStatus: storeData.storeStatus,
          expiryTime: storeData.expiryTime,
          message:
            'Google Play Pub/Sub returned an unknown or non-paid base plan.',
          metadata: {
            packageName,
            notificationType,
            googleSubscriptionState: googleData.subscriptionState || null,
            googleObfuscatedAccountId,
          },
        });
        return { handled: false, reason: 'UNKNOWN_PAID_PLAN' };
      }

      return this.dataSource.transaction(async (manager) => {
        const user = await manager.findOne(User, {
          where: { uuid: googleObfuscatedAccountId },
          lock: { mode: 'pessimistic_write' },
        });

        if (!user) {
          await this.paidPlanEventsService.info({
            eventType: 'SUBSCRIPTIONS_PUBSUB_OBFUSCATED_USER_NOT_FOUND',
            source: PaidPlanEventSource.GOOGLE_PUBSUB,
            purchaseToken,
            linkedPurchaseToken: storeData.linkedPurchaseToken,
            orderId: storeData.lastOrderId,
            basePlanId: storeData.basePlanId,
            planStatus: storeData.storeStatus,
            expiryTime: storeData.expiryTime,
            message:
              'Google Play Pub/Sub verified a token with an obfuscated account id, but no matching user was found.',
            metadata: {
              packageName,
              notificationType,
              googleSubscriptionState: googleData.subscriptionState || null,
              googleObfuscatedAccountId,
            },
          });
          return { handled: false, reason: 'OBFUSCATED_USER_NOT_FOUND' };
        }

        const concurrentStoreSubscription = await manager.findOne(
          StoreSubscription,
          {
            where: { purchaseToken },
            lock: { mode: 'pessimistic_write' },
          },
        );

        if (concurrentStoreSubscription) {
          return {
            handled: false,
            reason: 'STORE_SUBSCRIPTION_CREATED_CONCURRENTLY',
            storeSubscription: concurrentStoreSubscription,
          };
        }

        const storeSubscription = manager.create(StoreSubscription, {
          userId: user.id,
          provider: StoreSubscriptionProvider.GOOGLE_PLAY,
          platform: storeData.platform,
          regionCode: storeData.regionCode,
          productId: storeData.productId,
          basePlanId: storeData.basePlanId,
          purchaseToken,
          linkedPurchaseToken: storeData.linkedPurchaseToken,
          lastOrderId: storeData.lastOrderId,
          storeStatus: storeData.storeStatus,
          startTime: storeData.startTime,
          expiryTime: storeData.expiryTime,
          autoRenewEnabled: storeData.autoRenewEnabled,
          price: storeData.price,
          currency: storeData.currency,
          rawStoreData: googleData as Record<string, unknown>,
          legacyPlanId: null,
        });
        const savedStoreSubscription = await manager.save(
          StoreSubscription,
          storeSubscription,
        );

        const existingState = await manager.findOne(UserPlanState, {
          where: { userId: user.id },
          lock: { mode: 'pessimistic_write' },
        });
        const shouldResetCredits =
          !existingState ||
          (!preservesDeferredCreditCycle(existingState, storeData) &&
            (existingState.currentStoreSubscriptionId !==
              savedStoreSubscription.id ||
              !!storeData.lastOrderId));
        const accessStatus = this.deriveStoreAccessStatus(
          storeData.storeStatus,
          storeData.expiryTime,
          shouldResetCredits ? 0 : existingState.usedCredits,
          catalogPlan.creditsLimit,
        );
        const accessReason = this.deriveStoreAccessReason(
          storeData.storeStatus,
          storeData.expiryTime,
          shouldResetCredits ? 0 : existingState.usedCredits,
          catalogPlan.creditsLimit,
        );
        const statePayload: Partial<UserPlanState> = {
          userId: user.id,
          source: SubscriptionSource.GOOGLE_PLAY,
          basePlanId: storeData.basePlanId,
          name: catalogPlan.name,
          price: storeData.price,
          currency: storeData.currency,
          billingStatus: storeData.storeStatus,
          accessStatus,
          startTime: storeData.startTime,
          expiryTime: storeData.expiryTime,
          creditsLimit: catalogPlan.creditsLimit,
          usedCredits: shouldResetCredits ? 0 : existingState.usedCredits,
          inputUsedCredits: shouldResetCredits
            ? 0
            : existingState.inputUsedCredits,
          outputUsedCredits: shouldResetCredits
            ? 0
            : existingState.outputUsedCredits,
          useWithoutSubscription: false,
          currentStoreSubscriptionId: savedStoreSubscription.id,
          legacyPlanId: existingState?.legacyPlanId ?? null,
          metadata: {
            ...(existingState?.metadata ?? {}),
            lastGooglePlayPubSubRecoveryAt: new Date().toISOString(),
            googleSubscriptionState: googleData.subscriptionState || null,
            notificationType: notificationType ?? null,
            accessReason,
            testPurchase: Boolean(googleData.testPurchase),
          },
        };
        const userPlanState = existingState
          ? manager.merge(UserPlanState, existingState, statePayload)
          : manager.create(UserPlanState, statePayload);
        const savedState = await manager.save(UserPlanState, userPlanState);
        savedState.currentStoreSubscription = savedStoreSubscription;

        await this.activateV2RuntimeWithManager(manager, user, false);

        this.debug('subscriptions.pubsub recovered store subscription', {
          userId: user.id,
          userUuid: user.uuid ?? null,
          storeSubscriptionId: savedStoreSubscription.id,
          userPlanStateId: savedState.id,
          purchaseTokenSuffix: this.tokenSuffix(purchaseToken),
          orderId: storeData.lastOrderId,
          basePlanId: storeData.basePlanId,
          storeStatus: storeData.storeStatus,
          expiryTime: storeData.expiryTime,
          googleObfuscatedAccountId,
        });

        await this.paidPlanEventsService.info({
          eventType: 'SUBSCRIPTIONS_PUBSUB_RECOVERED_FROM_OBFUSCATED_ACCOUNT',
          source: PaidPlanEventSource.GOOGLE_PUBSUB,
          userId: user.id,
          purchaseToken,
          linkedPurchaseToken: storeData.linkedPurchaseToken,
          orderId: storeData.lastOrderId,
          basePlanId: storeData.basePlanId,
          planStatus: storeData.storeStatus,
          expiryTime: storeData.expiryTime,
          actualAfter: true,
          message:
            'Google Play Pub/Sub created a missing store subscription using the obfuscated account id.',
          metadata: {
            packageName,
            notificationType,
            storeSubscriptionId: savedStoreSubscription.id,
            userPlanStateId: savedState.id,
            resetCredits: shouldResetCredits,
            googleSubscriptionState: googleData.subscriptionState || null,
            googleObfuscatedAccountId,
            testPurchase: Boolean(googleData.testPurchase),
          },
        });

        return {
          handled: true,
          recovered: true,
          subscription: savedState,
          storeSubscription: savedStoreSubscription,
        };
      });
    }

    let verified: Awaited<
      ReturnType<GooglePlaySubscriptionsService['verifyAndroidSubscription']>
    >;

    try {
      verified =
        await this.googlePlaySubscriptionsService.verifyAndroidSubscription(
          packageName,
          purchaseToken,
        );
    } catch (error: unknown) {
      const { errorMessage, errorCode } = errorMetadata(error);
      await this.paidPlanEventsService.conflict({
        eventType: 'SUBSCRIPTIONS_PUBSUB_GOOGLE_VERIFY_FAILED',
        source: PaidPlanEventSource.GOOGLE_PUBSUB,
        userId: existingStoreSubscription.userId,
        purchaseToken,
        message:
          'New subscriptions API failed to verify Pub/Sub purchase token with Google Play.',
        metadata: {
          packageName,
          notificationType,
          errorMessage,
          errorCode,
        },
      });
      throw error;
    }

    const { storeData, googleData } = verified;
    const googleExternalAccountIdentifiers =
      googleData.externalAccountIdentifiers ?? null;

    this.debug('subscriptions.pubsub google verified', {
      packageName,
      notificationType: notificationType ?? null,
      userId: existingStoreSubscription.userId ?? null,
      storeSubscriptionId: existingStoreSubscription.id,
      purchaseTokenSuffix: this.tokenSuffix(purchaseToken),
      orderId: storeData.lastOrderId,
      basePlanId: storeData.basePlanId,
      storeStatus: storeData.storeStatus,
      expiryTime: storeData.expiryTime,
      googleSubscriptionState: googleData.subscriptionState ?? null,
      googleExternalAccountId:
        googleExternalAccountIdentifiers?.externalAccountId ?? null,
      googleObfuscatedAccountId:
        googleExternalAccountIdentifiers?.obfuscatedExternalAccountId ?? null,
      googleObfuscatedProfileId:
        googleExternalAccountIdentifiers?.obfuscatedExternalProfileId ?? null,
      testPurchase: Boolean(googleData.testPurchase),
    });

    const catalogPlan = getSubscriptionPlanCatalogItem(storeData.basePlanId);

    if (!catalogPlan?.isPaid) {
      await this.paidPlanEventsService.conflict({
        eventType: 'SUBSCRIPTIONS_PUBSUB_UNKNOWN_BASE_PLAN',
        source: PaidPlanEventSource.GOOGLE_PUBSUB,
        userId: existingStoreSubscription.userId,
        purchaseToken,
        basePlanId: storeData.basePlanId,
        planStatus: storeData.storeStatus,
        expiryTime: storeData.expiryTime,
        message:
          'Google Play Pub/Sub returned an unknown or non-paid base plan.',
        metadata: {
          packageName,
          notificationType,
          googleSubscriptionState: googleData.subscriptionState || null,
        },
      });
      return { handled: false, reason: 'UNKNOWN_PAID_PLAN' };
    }

    return this.dataSource.transaction(async (manager) => {
      const lockedStoreSubscription = await manager.findOne(StoreSubscription, {
        where: { purchaseToken },
        lock: { mode: 'pessimistic_write' },
      });

      if (!lockedStoreSubscription) {
        return { handled: false, reason: 'STORE_SUBSCRIPTION_NOT_FOUND' };
      }

      const previousOrderId = lockedStoreSubscription.lastOrderId ?? null;
      const storeSubscription = manager.merge(
        StoreSubscription,
        lockedStoreSubscription,
        {
          platform: storeData.platform,
          regionCode: storeData.regionCode,
          productId: storeData.productId,
          basePlanId: storeData.basePlanId,
          linkedPurchaseToken: storeData.linkedPurchaseToken,
          lastOrderId: storeData.lastOrderId,
          storeStatus: storeData.storeStatus,
          startTime: storeData.startTime,
          expiryTime: storeData.expiryTime,
          autoRenewEnabled: storeData.autoRenewEnabled,
          price: storeData.price,
          currency: storeData.currency,
          rawStoreData: googleData as Record<string, unknown>,
        },
      );
      const savedStoreSubscription = await manager.save(
        StoreSubscription,
        storeSubscription,
      );

      if (!savedStoreSubscription.userId) {
        await this.paidPlanEventsService.info({
          eventType: 'SUBSCRIPTIONS_PUBSUB_STORE_UPDATED_WITHOUT_USER',
          source: PaidPlanEventSource.GOOGLE_PUBSUB,
          purchaseToken,
          linkedPurchaseToken: storeData.linkedPurchaseToken,
          orderId: storeData.lastOrderId,
          oldOrderId: previousOrderId,
          basePlanId: storeData.basePlanId,
          oldBasePlanId: lockedStoreSubscription.basePlanId,
          planStatus: storeData.storeStatus,
          oldPlanStatus: lockedStoreSubscription.storeStatus,
          expiryTime: storeData.expiryTime,
          oldExpiryTime: lockedStoreSubscription.expiryTime,
          message:
            'New subscriptions Pub/Sub updated store subscription without linked user.',
          metadata: {
            packageName,
            notificationType,
            storeSubscriptionId: savedStoreSubscription.id,
            googleSubscriptionState: googleData.subscriptionState || null,
          },
        });

        return {
          handled: true,
          subscription: null,
          storeSubscription: savedStoreSubscription,
        };
      }

      const existingState = await manager.findOne(UserPlanState, {
        where: { userId: savedStoreSubscription.userId },
        lock: { mode: 'pessimistic_write' },
      });
      // Play sends EXPIRED for the old token after transferring entitlement.
      if (
        existingState?.currentStoreSubscriptionId &&
        existingState.currentStoreSubscriptionId !==
          savedStoreSubscription.id &&
        !canStoreSubscriptionGrantAccess(
          storeData.storeStatus,
          storeData.expiryTime,
        )
      ) {
        return {
          handled: true,
          subscription: existingState,
          storeSubscription: savedStoreSubscription,
        };
      }
      const isNewCreditsCycle =
        !!storeData.lastOrderId && storeData.lastOrderId !== previousOrderId;
      const shouldResetCredits =
        !existingState ||
        (!preservesDeferredCreditCycle(existingState, storeData) &&
          (existingState.currentStoreSubscriptionId !==
            savedStoreSubscription.id ||
            isNewCreditsCycle));
      const accessStatus = this.deriveStoreAccessStatus(
        storeData.storeStatus,
        storeData.expiryTime,
        shouldResetCredits ? 0 : existingState.usedCredits,
        catalogPlan.creditsLimit,
      );
      const accessReason = this.deriveStoreAccessReason(
        storeData.storeStatus,
        storeData.expiryTime,
        shouldResetCredits ? 0 : existingState.usedCredits,
        catalogPlan.creditsLimit,
      );
      const statePayload: Partial<UserPlanState> = {
        userId: savedStoreSubscription.userId,
        source: SubscriptionSource.GOOGLE_PLAY,
        basePlanId: storeData.basePlanId,
        name: catalogPlan.name,
        price: storeData.price,
        currency: storeData.currency,
        billingStatus: storeData.storeStatus,
        accessStatus,
        startTime: storeData.startTime,
        expiryTime: storeData.expiryTime,
        creditsLimit: catalogPlan.creditsLimit,
        usedCredits: shouldResetCredits ? 0 : existingState.usedCredits,
        inputUsedCredits: shouldResetCredits
          ? 0
          : existingState.inputUsedCredits,
        outputUsedCredits: shouldResetCredits
          ? 0
          : existingState.outputUsedCredits,
        useWithoutSubscription: false,
        currentStoreSubscriptionId: savedStoreSubscription.id,
        legacyPlanId: existingState?.legacyPlanId ?? null,
        metadata: {
          ...(existingState?.metadata ?? {}),
          lastGooglePlayPubSubAt: new Date().toISOString(),
          googleSubscriptionState: googleData.subscriptionState || null,
          notificationType: notificationType ?? null,
          accessReason,
          testPurchase: Boolean(googleData.testPurchase),
        },
      };
      const userPlanState = existingState
        ? manager.merge(UserPlanState, existingState, statePayload)
        : manager.create(UserPlanState, statePayload);
      const savedState = await manager.save(UserPlanState, userPlanState);
      savedState.currentStoreSubscription = savedStoreSubscription;

      await manager.update(
        User,
        { id: savedStoreSubscription.userId },
        { usesWithoutSubscription: false },
      );

      await this.paidPlanEventsService.info({
        eventType: 'SUBSCRIPTIONS_PUBSUB_UPDATED',
        source: PaidPlanEventSource.GOOGLE_PUBSUB,
        userId: savedStoreSubscription.userId,
        purchaseToken,
        linkedPurchaseToken: storeData.linkedPurchaseToken,
        orderId: storeData.lastOrderId,
        oldOrderId: previousOrderId,
        basePlanId: storeData.basePlanId,
        oldBasePlanId: lockedStoreSubscription.basePlanId,
        planStatus: storeData.storeStatus,
        oldPlanStatus: lockedStoreSubscription.storeStatus,
        expiryTime: storeData.expiryTime,
        oldExpiryTime: lockedStoreSubscription.expiryTime,
        actualAfter: true,
        message:
          'New subscriptions API updated Google Play subscription from Pub/Sub.',
        metadata: {
          packageName,
          notificationType,
          storeSubscriptionId: savedStoreSubscription.id,
          userPlanStateId: savedState.id,
          resetCredits: shouldResetCredits,
          googleSubscriptionState: googleData.subscriptionState || null,
          testPurchase: Boolean(googleData.testPurchase),
        },
      });

      return {
        handled: true,
        subscription: savedState,
        storeSubscription: savedStoreSubscription,
      };
    });
  }

  private async syncLegacyPlanToUserPlanStateWithManager(
    manager: EntityManager,
    user: User,
    plan: Plan | null,
    now: Date,
  ): Promise<UserPlanState> {
    let currentStoreSubscriptionId: number | null = null;
    const storeDraft = plan
      ? this.legacyMapper.toStoreSubscriptionDraft(plan)
      : null;

    if (storeDraft) {
      const existingStoreSubscription = await manager.findOne(
        StoreSubscription,
        {
          where: { purchaseToken: storeDraft.purchaseToken },
          lock: { mode: 'pessimistic_write' },
        },
      );

      this.debug('subscriptions.legacy-sync store lookup', {
        userId: user.id,
        legacyPlanId: plan?.id ?? null,
        purchaseTokenSuffix: this.tokenSuffix(storeDraft.purchaseToken),
        found: Boolean(existingStoreSubscription),
        existingStoreSubscriptionId: existingStoreSubscription?.id ?? null,
        existingStoreSubscriptionUserId:
          existingStoreSubscription?.userId ?? null,
        existingLegacyPlanId: existingStoreSubscription?.legacyPlanId ?? null,
      });

      const storeSubscription = existingStoreSubscription
        ? manager.merge(
            StoreSubscription,
            existingStoreSubscription,
            storeDraft,
          )
        : manager.create(StoreSubscription, storeDraft);
      const savedStoreSubscription = await manager.save(
        StoreSubscription,
        storeSubscription,
      );
      currentStoreSubscriptionId = savedStoreSubscription.id;

      this.debug('subscriptions.legacy-sync store saved', {
        userId: user.id,
        legacyPlanId: plan?.id ?? null,
        storeSubscriptionId: savedStoreSubscription.id,
        storeSubscriptionUserId: savedStoreSubscription.userId ?? null,
        purchaseTokenSuffix: this.tokenSuffix(storeDraft.purchaseToken),
      });
    }

    const stateDraft = this.legacyMapper.toUserPlanStateDraft(user.id, plan, {
      now,
      useWithoutSubscription: user.usesWithoutSubscription,
      currentStoreSubscriptionId,
    });
    const existingState = await manager.findOne(UserPlanState, {
      where: { userId: user.id },
      lock: { mode: 'pessimistic_write' },
    });

    this.debug('subscriptions.legacy-sync state lookup', {
      userId: user.id,
      legacyPlanId: plan?.id ?? null,
      currentStoreSubscriptionId,
      found: Boolean(existingState),
      existingStateId: existingState?.id ?? null,
      existingCurrentStoreSubscriptionId:
        existingState?.currentStoreSubscriptionId ?? null,
      existingLegacyPlanId: existingState?.legacyPlanId ?? null,
      nextBillingStatus: stateDraft.billingStatus,
      nextAccessStatus: stateDraft.accessStatus,
      nextBasePlanId: stateDraft.basePlanId,
    });

    const userPlanState = existingState
      ? manager.merge(UserPlanState, existingState, stateDraft)
      : manager.create(UserPlanState, stateDraft);
    const savedState = await manager.save(UserPlanState, userPlanState);

    this.debug('subscriptions.legacy-sync state saved', {
      userId: user.id,
      legacyPlanId: plan?.id ?? null,
      userPlanStateId: savedState.id,
      currentStoreSubscriptionId: savedState.currentStoreSubscriptionId ?? null,
      billingStatus: savedState.billingStatus,
      accessStatus: savedState.accessStatus,
      basePlanId: savedState.basePlanId,
    });

    if (currentStoreSubscriptionId) {
      savedState.currentStoreSubscription = await manager.findOne(
        StoreSubscription,
        {
          where: { id: currentStoreSubscriptionId },
        },
      );
    }

    return savedState;
  }

  private async activateV2RuntimeWithManager(
    manager: EntityManager,
    user: User,
    usesWithoutSubscription?: boolean,
  ): Promise<void> {
    let changed = false;

    if (user.subscriptionRuntime !== SubscriptionRuntime.V2) {
      user.subscriptionRuntime = SubscriptionRuntime.V2;
      changed = true;
    }

    if (
      usesWithoutSubscription !== undefined &&
      user.usesWithoutSubscription !== usesWithoutSubscription
    ) {
      user.usesWithoutSubscription = usesWithoutSubscription;
      changed = true;
    }

    if (changed) {
      await manager.save(User, user);
    }
  }

  private hasUsedTrial(subscription: UserPlanState | null) {
    if (!subscription) {
      return false;
    }

    if (subscription.metadata?.trialUsed === true) {
      return true;
    }

    return subscription.basePlanId !== null;
  }

  private buildTrialPayload(
    userId: number,
    existing: Pick<UserPlanState, 'metadata' | 'legacyPlanId'> | null,
    now: Date,
  ): Partial<UserPlanState> {
    const trial = SUBSCRIPTION_PLAN_CATALOG[SubscriptionBasePlanId.START];
    const expiryTime = new Date(
      now.getTime() + (trial.durationDays ?? 7) * 24 * 60 * 60 * 1000,
    );

    return {
      userId,
      source: SubscriptionSource.TRIAL,
      basePlanId: SubscriptionBasePlanId.START,
      name: trial.name,
      price: 0,
      currency: null,
      billingStatus: SubscriptionBillingStatus.NONE,
      accessStatus: SubscriptionAccessStatus.ACTIVE,
      startTime: now,
      expiryTime,
      creditsLimit: trial.creditsLimit,
      usedCredits: 0,
      inputUsedCredits: 0,
      outputUsedCredits: 0,
      useWithoutSubscription: false,
      currentStoreSubscriptionId: null,
      legacyPlanId: existing?.legacyPlanId ?? null,
      metadata: {
        ...(existing?.metadata ?? {}),
        accessReason: SubscriptionAccessReason.NONE,
        trialUsed: true,
        trialStartedAt: now.toISOString(),
        trialExpiryTime: expiryTime.toISOString(),
      },
    };
  }

  private buildNoPlanSelectionPayload(
    userId: number,
    existing: Pick<UserPlanState, 'metadata' | 'legacyPlanId'> | null,
  ): Partial<UserPlanState> {
    return {
      userId,
      source: SubscriptionSource.NONE,
      basePlanId: null,
      name: 'None',
      price: 0,
      currency: null,
      billingStatus: SubscriptionBillingStatus.NONE,
      accessStatus: SubscriptionAccessStatus.LIMITED,
      startTime: null,
      expiryTime: null,
      creditsLimit: 0,
      usedCredits: 0,
      inputUsedCredits: 0,
      outputUsedCredits: 0,
      useWithoutSubscription: false,
      currentStoreSubscriptionId: null,
      legacyPlanId: existing?.legacyPlanId ?? null,
      metadata: {
        ...(existing?.metadata ?? {}),
        accessReason: SubscriptionAccessReason.PLAN_SELECTION_REQUIRED,
      },
    };
  }

  private deriveStoreAccessStatus(
    billingStatus: SubscriptionBillingStatus,
    expiryTime: Date | string | null,
    usedCredits: number,
    creditsLimit: number,
    now = new Date(),
  ) {
    return this.deriveStoreAccessReason(
      billingStatus,
      expiryTime,
      usedCredits,
      creditsLimit,
      now,
    ) === SubscriptionAccessReason.NONE
      ? SubscriptionAccessStatus.ACTIVE
      : SubscriptionAccessStatus.LIMITED;
  }

  private deriveStoreAccessReason(
    billingStatus: SubscriptionBillingStatus,
    expiryTime: Date | string | null,
    usedCredits: number,
    creditsLimit: number,
    now = new Date(),
  ) {
    if (billingStatus === SubscriptionBillingStatus.PENDING) {
      return SubscriptionAccessReason.BILLING_PENDING;
    }

    if (billingStatus === SubscriptionBillingStatus.ON_HOLD) {
      return SubscriptionAccessReason.BILLING_ON_HOLD;
    }

    if (billingStatus === SubscriptionBillingStatus.PAUSED) {
      return SubscriptionAccessReason.BILLING_PAUSED;
    }

    if (billingStatus === SubscriptionBillingStatus.REFUNDED) {
      return SubscriptionAccessReason.SUBSCRIPTION_REFUNDED;
    }

    if (
      billingStatus === SubscriptionBillingStatus.CANCELED &&
      !canStoreSubscriptionGrantAccess(billingStatus, expiryTime, now)
    ) {
      return SubscriptionAccessReason.SUBSCRIPTION_CANCELED;
    }

    if (!canStoreSubscriptionGrantAccess(billingStatus, expiryTime, now)) {
      return SubscriptionAccessReason.SUBSCRIPTION_EXPIRED;
    }

    if (creditsLimit === 0) {
      return SubscriptionAccessReason.INSUFFICIENT_AI_CREDITS;
    }

    if (creditsLimit > 0 && usedCredits >= creditsLimit) {
      return SubscriptionAccessReason.CREDIT_EXCEEDED;
    }

    return SubscriptionAccessReason.NONE;
  }

  private deriveEffectiveAccessReason(
    subscription: Pick<
      UserPlanState,
      | 'source'
      | 'basePlanId'
      | 'billingStatus'
      | 'accessStatus'
      | 'expiryTime'
      | 'creditsLimit'
      | 'usedCredits'
      | 'useWithoutSubscription'
      | 'metadata'
    >,
    now = new Date(),
  ): SubscriptionAccessReason {
    const currentReason = subscription.metadata?.accessReason as
      | SubscriptionAccessReason
      | undefined;

    if (
      subscription.accessStatus === SubscriptionAccessStatus.BLOCKED ||
      currentReason === SubscriptionAccessReason.ADMIN_DISABLED
    ) {
      return SubscriptionAccessReason.ADMIN_DISABLED;
    }

    if (
      subscription.source === SubscriptionSource.NONE ||
      subscription.basePlanId === null
    ) {
      return subscription.useWithoutSubscription
        ? SubscriptionAccessReason.USE_WITHOUT_SUBSCRIPTION
        : SubscriptionAccessReason.PLAN_SELECTION_REQUIRED;
    }

    if (
      subscription.source === SubscriptionSource.TRIAL ||
      subscription.basePlanId === SubscriptionBasePlanId.START
    ) {
      if (
        subscription.expiryTime &&
        new Date(subscription.expiryTime).getTime() <= now.getTime()
      ) {
        return SubscriptionAccessReason.TRIAL_EXPIRED;
      }

      if (
        subscription.creditsLimit > 0 &&
        subscription.usedCredits >= subscription.creditsLimit
      ) {
        return SubscriptionAccessReason.CREDIT_EXCEEDED;
      }

      return SubscriptionAccessReason.NONE;
    }

    return this.deriveStoreAccessReason(
      subscription.billingStatus,
      subscription.expiryTime,
      subscription.usedCredits,
      subscription.creditsLimit,
      now,
    );
  }

  private toAccessStatus(reason: SubscriptionAccessReason) {
    if (reason === SubscriptionAccessReason.NONE) {
      return SubscriptionAccessStatus.ACTIVE;
    }

    if (reason === SubscriptionAccessReason.ADMIN_DISABLED) {
      return SubscriptionAccessStatus.BLOCKED;
    }

    return SubscriptionAccessStatus.LIMITED;
  }

  private tokenSuffix(token?: string | null) {
    return token ? token.slice(-10) : null;
  }

  private debug(_message: string, _data: Record<string, unknown>) {
    return;
  }
}
