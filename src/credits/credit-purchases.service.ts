import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource, EntityManager, IsNull, Repository } from 'typeorm';
import { throwError } from 'src/common/utils';
import { HttpStatus } from 'src/common/utils/http-status';
import { User } from 'src/users/entities/user.entity';
import { UserPlanState } from 'src/subscriptions/entities/user-plan-state.entity';
import {
  SubscriptionAccessReason,
  SubscriptionAccessStatus,
  SubscriptionBillingStatus,
  SubscriptionRuntime,
  SubscriptionSource,
} from 'src/subscriptions/types';
import { getCreditPackCatalogItem } from './credit-pack.catalog';
import { PurchaseCreditPackDto } from './dto/purchase-credit-pack.dto';
import { CreditLedgerEntry } from './entities/credit-ledger-entry.entity';
import { CreditPurchase } from './entities/credit-purchase.entity';
import { CreditWallet } from './entities/credit-wallet.entity';
import {
  CreditLedgerEntryType,
  CreditPurchaseProvider,
  CreditPurchaseStatus,
} from './types';
import {
  GooglePlayCreditPurchasesService,
  VerifiedGooglePlayCreditPurchase,
} from './google-play-credit-purchases.service';
import { CreditWalletService } from './credit-wallet.service';

@Injectable()
export class CreditPurchasesService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(CreditPurchase)
    private readonly purchasesRepository: Repository<CreditPurchase>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly googlePlay: GooglePlayCreditPurchasesService,
    private readonly creditWalletService: CreditWalletService,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async retryPendingConsumptions(): Promise<void> {
    const pending = await this.purchasesRepository.find({
      where: {
        provider: CreditPurchaseProvider.GOOGLE_PLAY,
        status: CreditPurchaseStatus.PURCHASED,
        consumedAt: IsNull(),
      },
      order: { createdAt: 'ASC' },
      take: 50,
    });

    for (const purchase of pending) {
      const packageName =
        typeof purchase.metadata?.packageName === 'string'
          ? purchase.metadata.packageName
          : process.env.GOOGLE_PLAY_PACKAGE_NAME || 'com.soniac12.nemory';

      try {
        const verified = await this.googlePlay.verify(
          packageName,
          purchase.purchaseToken,
        );
        await this.consumeIfNeeded(
          packageName,
          purchase,
          verified.consumptionState,
        );
      } catch (error) {
        await this.purchasesRepository.update(purchase.id, {
          metadata: {
            ...(purchase.metadata ?? {}),
            consumeError:
              error instanceof Error ? error.message : String(error),
            consumeRetryRequired: true,
            lastConsumeRetryAt: new Date().toISOString(),
          },
        });
      }
    }
  }

  async purchaseGooglePlay(userId: number, dto: PurchaseCreditPackDto) {
    if (!dto?.packageName || !dto?.purchaseToken) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'Invalid credit purchase payload',
        'packageName and purchaseToken are required.',
        'INVALID_CREDIT_PURCHASE_PAYLOAD',
      );
    }

    const verified = await this.googlePlay.verify(
      dto.packageName,
      dto.purchaseToken,
    );

    if (dto.productId && dto.productId !== verified.productId) {
      throwError(
        HttpStatus.CONFLICT,
        'Credit product mismatch',
        'Google Play returned a different product.',
        'CREDIT_PRODUCT_MISMATCH',
      );
    }

    const result = await this.grantVerifiedPurchase(userId, verified, dto);
    const consumptionPending = await this.consumeIfNeeded(
      dto.packageName,
      result.purchase,
      verified.consumptionState,
    );

    return { ...result, consumptionPending };
  }

  async handleGooglePlayRtdn(
    packageName: string,
    purchaseToken: string,
    productId: string,
    notificationType?: number,
  ) {
    if (notificationType === 2) {
      const existing = await this.purchasesRepository.findOne({
        where: { provider: CreditPurchaseProvider.GOOGLE_PLAY, purchaseToken },
      });
      if (existing && existing.creditsGranted === 0 && !existing.consumedAt) {
        await this.purchasesRepository.update(existing.id, {
          status: CreditPurchaseStatus.CANCELED,
        });
      }
      return { handled: true, canceled: true };
    }

    if (notificationType !== 1) {
      return { handled: false, reason: 'UNSUPPORTED_NOTIFICATION_TYPE' };
    }

    const verified = await this.googlePlay.verify(packageName, purchaseToken);
    if (verified.productId !== productId) {
      return { handled: false, reason: 'PRODUCT_MISMATCH' };
    }

    const existing = await this.purchasesRepository.findOne({
      where: { provider: CreditPurchaseProvider.GOOGLE_PLAY, purchaseToken },
    });
    const user = existing
      ? await this.usersRepository.findOne({ where: { id: existing.userId } })
      : verified.obfuscatedAccountId
        ? await this.usersRepository.findOne({
            where: { uuid: verified.obfuscatedAccountId },
          })
        : null;

    if (!user) {
      return { handled: false, reason: 'PURCHASE_OWNER_NOT_FOUND' };
    }

    const result = await this.grantVerifiedPurchase(user.id, verified, {
      packageName,
      purchaseToken,
      productId,
      obfuscatedAccountId: verified.obfuscatedAccountId,
    });
    const consumptionPending = await this.consumeIfNeeded(
      packageName,
      result.purchase,
      verified.consumptionState,
    );

    return { handled: true, ...result, consumptionPending };
  }

  async handleVoidedGooglePlayPurchase(
    purchaseToken: string,
    orderId?: string | null,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const purchase = await manager.findOne(CreditPurchase, {
        where: {
          provider: CreditPurchaseProvider.GOOGLE_PLAY,
          purchaseToken,
        },
        lock: { mode: 'pessimistic_write' },
      });

      if (!purchase) {
        return { handled: false, reason: 'CREDIT_PURCHASE_NOT_FOUND' };
      }

      const outstanding = Math.max(
        0,
        purchase.creditsGranted - purchase.creditsRevoked,
      );
      if (outstanding === 0) {
        return { handled: true, alreadyRevoked: true };
      }

      const wallet = await manager.findOne(CreditWallet, {
        where: { userId: purchase.userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!wallet) {
        return { handled: false, reason: 'CREDIT_WALLET_NOT_FOUND' };
      }

      wallet.balance -= outstanding;
      wallet.totalRevoked += outstanding;
      const savedWallet = await manager.save(CreditWallet, wallet);

      purchase.creditsRevoked += outstanding;
      purchase.status = CreditPurchaseStatus.REFUNDED;
      purchase.refundedAt = new Date();
      purchase.metadata = {
        ...(purchase.metadata ?? {}),
        voidedOrderId: orderId ?? purchase.orderId,
      };
      const savedPurchase = await manager.save(CreditPurchase, purchase);

      await manager.save(
        CreditLedgerEntry,
        manager.create(CreditLedgerEntry, {
          userId: purchase.userId,
          walletId: savedWallet.id,
          purchaseId: savedPurchase.id,
          type: CreditLedgerEntryType.REFUND,
          amount: -outstanding,
          balanceAfter: savedWallet.balance,
          idempotencyKey: `google-play:refund:${purchaseToken}`,
          metadata: { orderId: orderId ?? purchase.orderId },
        }),
      );

      return {
        handled: true,
        purchase: savedPurchase,
        purchasedCredits: this.creditWalletService.toSummary(savedWallet),
      };
    });
  }

  private async grantVerifiedPurchase(
    userId: number,
    verified: VerifiedGooglePlayCreditPurchase,
    dto: PurchaseCreditPackDto,
  ) {
    const catalogItem = getCreditPackCatalogItem(verified.productId);
    if (!catalogItem) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'Unknown credit product',
        'Google Play returned an unknown credit product.',
        'UNKNOWN_CREDIT_PRODUCT',
      );
    }

    if (verified.purchaseState !== 'PURCHASED') {
      throwError(
        HttpStatus.BAD_REQUEST,
        'Credit purchase is not complete',
        'Credits are granted only after Google Play confirms the purchase.',
        'CREDIT_PURCHASE_NOT_COMPLETED',
        { purchaseState: verified.purchaseState },
      );
    }

    if (verified.quantity !== 1) {
      throwError(
        HttpStatus.BAD_REQUEST,
        'Unsupported credit purchase quantity',
        'This credit product supports one pack per transaction.',
        'UNSUPPORTED_CREDIT_PURCHASE_QUANTITY',
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

      if (
        verified.obfuscatedAccountId &&
        user.uuid &&
        verified.obfuscatedAccountId !== user.uuid
      ) {
        throwError(
          HttpStatus.CONFLICT,
          'Credit purchase account mismatch',
          'This purchase belongs to another account.',
          'CREDIT_PURCHASE_ACCOUNT_MISMATCH',
        );
      }

      if (!verified.obfuscatedAccountId) {
        throwError(
          HttpStatus.CONFLICT,
          'Credit purchase has no account binding',
          'The purchase cannot be securely linked to this account.',
          'CREDIT_PURCHASE_ACCOUNT_NOT_BOUND',
        );
      }

      const existing = await manager.findOne(CreditPurchase, {
        where: {
          provider: CreditPurchaseProvider.GOOGLE_PLAY,
          purchaseToken: verified.purchaseToken,
        },
        lock: { mode: 'pessimistic_write' },
      });

      if (existing) {
        if (existing.userId !== userId) {
          throwError(
            HttpStatus.CONFLICT,
            'Credit purchase already belongs to another user',
            'This purchase is already linked to another account.',
            'CREDIT_PURCHASE_ALREADY_LINKED',
          );
        }

        return {
          purchase: existing,
          purchasedCredits: await this.creditWalletService.getSummary(
            userId,
            manager,
          ),
          alreadyGranted: true,
        };
      }

      if (verified.consumptionState === 'CONSUMPTION_STATE_CONSUMED') {
        throwError(
          HttpStatus.CONFLICT,
          'Credit purchase was already consumed',
          'This consumed purchase is not registered by Nemory.',
          'CREDIT_PURCHASE_ALREADY_CONSUMED',
        );
      }

      // Keep the same lock order as AI usage: plan state, then wallet.
      await this.ensureV2State(manager, user);

      let wallet = await manager.findOne(CreditWallet, {
        where: { userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!wallet) {
        wallet = manager.create(CreditWallet, {
          userId,
          balance: 0,
          totalPurchased: 0,
          totalSpent: 0,
          totalRevoked: 0,
        });
      }

      wallet.balance += catalogItem.credits;
      wallet.totalPurchased += catalogItem.credits;
      const savedWallet = await manager.save(CreditWallet, wallet);

      const purchase = await manager.save(
        CreditPurchase,
        manager.create(CreditPurchase, {
          userId,
          provider: CreditPurchaseProvider.GOOGLE_PLAY,
          productId: verified.productId,
          purchaseOptionId: verified.purchaseOptionId,
          purchaseToken: verified.purchaseToken,
          orderId: verified.orderId,
          status: CreditPurchaseStatus.PURCHASED,
          quantity: verified.quantity,
          creditsGranted: catalogItem.credits,
          creditsRevoked: 0,
          regionCode: verified.regionCode,
          obfuscatedAccountId: verified.obfuscatedAccountId,
          testPurchase: verified.testPurchase,
          purchasedAt: verified.purchasedAt,
          consumedAt: null,
          refundedAt: null,
          rawStoreData: verified.rawStoreData,
          metadata: {
            packageName: dto.packageName,
            clientObfuscatedAccountId: dto.obfuscatedAccountId ?? null,
          },
        }),
      );

      await manager.save(
        CreditLedgerEntry,
        manager.create(CreditLedgerEntry, {
          userId,
          walletId: savedWallet.id,
          purchaseId: purchase.id,
          type: CreditLedgerEntryType.PURCHASE,
          amount: catalogItem.credits,
          balanceAfter: savedWallet.balance,
          idempotencyKey: `google-play:purchase:${verified.purchaseToken}`,
          metadata: {
            productId: verified.productId,
            orderId: verified.orderId,
          },
        }),
      );

      return {
        purchase,
        purchasedCredits: this.creditWalletService.toSummary(savedWallet),
        alreadyGranted: false,
      };
    });
  }

  private async ensureV2State(
    manager: EntityManager,
    user: User,
  ): Promise<void> {
    let state = await manager.findOne(UserPlanState, {
      where: { userId: user.id },
      lock: { mode: 'pessimistic_write' },
    });

    if (!state) {
      state = await manager.save(
        UserPlanState,
        manager.create(UserPlanState, {
          userId: user.id,
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
          useWithoutSubscription: true,
          currentStoreSubscriptionId: null,
          legacyPlanId: null,
          metadata: {
            accessReason: SubscriptionAccessReason.USE_WITHOUT_SUBSCRIPTION,
            creditsModeSelectedAt: new Date().toISOString(),
          },
        }),
      );
    }

    const choosesCreditsWithoutActiveSubscription =
      state.source === SubscriptionSource.NONE ||
      state.basePlanId === null ||
      (state.accessStatus !== SubscriptionAccessStatus.ACTIVE &&
        state.billingStatus !== SubscriptionBillingStatus.ACTIVE &&
        state.billingStatus !== SubscriptionBillingStatus.IN_GRACE);

    if (
      choosesCreditsWithoutActiveSubscription &&
      !state.useWithoutSubscription
    ) {
      state = await manager.save(
        UserPlanState,
        manager.merge(UserPlanState, state, {
          useWithoutSubscription: true,
          metadata: {
            ...(state.metadata ?? {}),
            accessReason: SubscriptionAccessReason.USE_WITHOUT_SUBSCRIPTION,
            creditsModeSelectedAt: new Date().toISOString(),
          },
        }),
      );
    }

    let userChanged = false;
    if (user.subscriptionRuntime !== SubscriptionRuntime.V2) {
      user.subscriptionRuntime = SubscriptionRuntime.V2;
      userChanged = true;
    }
    if (
      choosesCreditsWithoutActiveSubscription &&
      !user.usesWithoutSubscription
    ) {
      user.usesWithoutSubscription = true;
      userChanged = true;
    }
    if (userChanged) {
      await manager.save(User, user);
    }
  }

  private async consumeIfNeeded(
    packageName: string,
    purchase: CreditPurchase,
    googleConsumptionState: string | null,
  ): Promise<boolean> {
    if (
      purchase.status === CreditPurchaseStatus.REFUNDED ||
      purchase.status === CreditPurchaseStatus.CANCELED ||
      purchase.consumedAt ||
      googleConsumptionState === 'CONSUMPTION_STATE_CONSUMED'
    ) {
      if (!purchase.consumedAt && googleConsumptionState) {
        await this.purchasesRepository.update(purchase.id, {
          status: CreditPurchaseStatus.CONSUMED,
          consumedAt: new Date(),
        });
      }
      return false;
    }

    try {
      await this.googlePlay.consume(
        packageName,
        purchase.productId,
        purchase.purchaseToken,
      );
      const {
        consumeError: _consumeError,
        consumeRetryRequired: _consumeRetryRequired,
        ...purchaseMetadata
      } = purchase.metadata ?? {};
      await this.purchasesRepository.update(purchase.id, {
        status: CreditPurchaseStatus.CONSUMED,
        consumedAt: new Date(),
        metadata: {
          ...purchaseMetadata,
          consumeRetryRequired: false,
        },
      });
      return false;
    } catch (error) {
      await this.purchasesRepository.update(purchase.id, {
        metadata: {
          ...(purchase.metadata ?? {}),
          consumeError: error instanceof Error ? error.message : String(error),
          consumeRetryRequired: true,
        },
      });
      return true;
    }
  }
}
