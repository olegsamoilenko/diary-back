import {
  Body,
  Controller,
  HttpCode,
  Logger,
  Optional,
  Post,
  Req,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { IapService } from './iap.service';
import { VerifyDto } from './dto/iap.dto';
import { AuthGuard } from '@nestjs/passport';
import {
  ActiveUserData,
  ActiveUserDataT,
} from '../auth/decorators/active-user.decorator';
import { PubSubPushEnvelope, RtdnPayload } from 'src/iap/types/subscription';
import {
  decodeBase64Json,
  hasOneTimeProductNotification,
  hasSubscriptionNotification,
  hasVoidedPurchaseNotification,
} from 'src/iap/utils/rtdn';
import { SubscriptionsService } from 'src/subscriptions/subscriptions.service';
import { Request } from 'express';
import { CreditPurchasesService } from 'src/credits/credit-purchases.service';
import { GooglePubSubAuthGuard } from './google-pubsub-auth.guard';

@Controller('iap')
export class IapController {
  private readonly logger = new Logger(IapController.name);

  constructor(
    private readonly iap: IapService,
    private readonly subscriptionsService: SubscriptionsService,
    @Optional()
    private readonly creditPurchasesService?: CreditPurchasesService,
  ) {}

  @UseGuards(AuthGuard('jwt'))
  @Post('create-sub')
  async createSub(
    @ActiveUserData() user: ActiveUserDataT,
    @Body() body: VerifyDto,
    @Req() req?: Request,
  ) {
    const requestMeta = this.getRequestMeta(req);

    if (body.platform === 'android') {
      this.debug('create-sub controller received', {
        ...requestMeta,
        userId: user?.id ?? null,
        userUuid: user?.uuid ?? null,
        platform: body.platform,
        packageName: body.packageName,
        purchaseTokenSuffix: this.tokenSuffix(body.purchaseToken),
      });

      if (!req) {
        return await this.iap.createAndroidSub(
          user.id,
          body.packageName,
          body.purchaseToken,
        );
      }

      return await this.iap.createAndroidSub(
        user.id,
        body.packageName,
        body.purchaseToken,
        requestMeta,
      );
    }

    // if (body.platform === 'ios') {
    // }
  }

  @Post('pub-sub')
  @UseGuards(GooglePubSubAuthGuard)
  @HttpCode(200)
  async handle(
    @Body() body: PubSubPushEnvelope,
    @Req() req?: Request,
  ): Promise<'ok'> {
    const message = body?.message;
    const decoded = message?.data
      ? decodeBase64Json<RtdnPayload>(message.data)
      : null;
    // Deliberately exclude purchase tokens, payloads and Google error objects.
    const event = {
      messageId: message?.messageId ?? null,
      kind: decoded?.testNotification
        ? 'test'
        : hasVoidedPurchaseNotification(decoded)
          ? 'voided'
          : hasOneTimeProductNotification(decoded)
            ? 'one-time'
            : hasSubscriptionNotification(decoded)
              ? 'subscription'
              : 'unrecognized',
      notificationType:
        decoded?.oneTimeProductNotification?.notificationType ??
        decoded?.subscriptionNotification?.notificationType,
      productType: decoded?.voidedPurchaseNotification?.productType,
      refundType: decoded?.voidedPurchaseNotification?.refundType,
      eventTimeMillis: decoded?.eventTimeMillis,
    };
    this.logger.log(`[IAP RTDN] received ${JSON.stringify(event)}`);
    try {
      const result = await this.processNotification(body, req);
      this.logger.log(`[IAP RTDN] acknowledged ${JSON.stringify(event)}`);
      return result;
    } catch {
      this.logger.error(
        `[IAP RTDN] failed; retry required ${JSON.stringify(event)}`,
      );
      // A non-2xx response lets Pub/Sub redeliver this specific event.
      throw new ServiceUnavailableException(
        'IAP notification processing failed',
      );
    }
  }

  private async processNotification(
    body: PubSubPushEnvelope,
    req?: Request,
  ): Promise<'ok'> {
    const msg = body.message;
    if (!msg?.data) {
      return 'ok';
    }
    const requestMeta = this.getRequestMeta(req);
    const legacyMessage = msg as typeof msg & {
      message_id?: string;
      publish_time?: string;
    };
    this.debug('pub-sub controller received envelope', {
      ...requestMeta,
      messageId: msg.messageId ?? legacyMessage.message_id ?? null,
      publishTime: msg.publishTime ?? legacyMessage.publish_time ?? null,
    });

    const decoded = decodeBase64Json<RtdnPayload>(msg.data);

    if (decoded?.testNotification) {
      return 'ok';
    }

    if (hasSubscriptionNotification(decoded)) {
      const { purchaseToken } = decoded.subscriptionNotification;
      const pkg = decoded.packageName ?? '';
      this.debug('pub-sub controller decoded subscription', {
        ...requestMeta,
        packageName: pkg,
        notificationType: decoded.subscriptionNotification.notificationType,
        subscriptionId: decoded.subscriptionNotification.subscriptionId,
        purchaseTokenSuffix: this.tokenSuffix(purchaseToken),
        eventTimeMillis: decoded.eventTimeMillis,
      });
      if (purchaseToken && pkg) {
        let processingFailed = false;

        try {
          await this.iap.pubSubAndroid(
            pkg,
            purchaseToken,
            decoded.subscriptionNotification.notificationType,
          );
        } catch {
          processingFailed = true;
        }

        try {
          await this.subscriptionsService.handleGooglePlayPubSub(
            pkg,
            purchaseToken,
            decoded.subscriptionNotification.notificationType,
          );
        } catch {
          processingFailed = true;
        }

        // Both handlers must run, but neither may acknowledge the other's failure.
        // The outer handler returns 503 without exposing provider/token details.
        if (processingFailed) {
          throw new Error('Subscription notification processing failed');
        }
      }
    }

    if (this.creditPurchasesService && hasOneTimeProductNotification(decoded)) {
      const notification = decoded.oneTimeProductNotification;
      const pkg = decoded.packageName ?? '';
      if (pkg && notification.purchaseToken && notification.sku) {
        const result = await this.creditPurchasesService.handleGooglePlayRtdn(
          pkg,
          notification.purchaseToken,
          notification.sku,
          notification.notificationType,
        );
        this.logCreditResult(body.message?.messageId, 'one-time', result);
      }
    }

    if (
      this.creditPurchasesService &&
      hasVoidedPurchaseNotification(decoded) &&
      decoded.voidedPurchaseNotification.productType === 2 &&
      decoded.voidedPurchaseNotification.purchaseToken
    ) {
      const result =
        await this.creditPurchasesService.handleVoidedGooglePlayPurchase(
          decoded.voidedPurchaseNotification.purchaseToken,
          decoded.voidedPurchaseNotification.orderId,
        );
      this.logCreditResult(body.message?.messageId, 'voided', result);
      if (result?.reason === 'CREDIT_WALLET_NOT_FOUND') {
        throw new Error('Credit refund wallet unavailable');
      }
    }

    return 'ok';
  }

  private logCreditResult(
    messageId: string | undefined,
    kind: string,
    result:
      | { handled?: boolean; reason?: string; alreadyRevoked?: boolean }
      | undefined,
  ) {
    const message = `[IAP RTDN] credit-result ${JSON.stringify({
      messageId: messageId ?? null,
      kind,
      handled: result?.handled ?? false,
      reason: result?.reason,
      alreadyRevoked: result?.alreadyRevoked ?? false,
    })}`;
    if (result?.handled) this.logger.log(message);
    else this.logger.warn(message);
  }

  private getRequestMeta(req?: Request) {
    const typedReq = req as (Request & { clientUa?: string }) | undefined;

    return {
      ip:
        (typedReq?.headers['x-forwarded-for'] as string | undefined) ??
        typedReq?.ip ??
        null,
      userAgent: typedReq?.headers['user-agent'] ?? typedReq?.clientUa ?? null,
      clientUa:
        (typedReq?.headers['x-client-ua'] as string | undefined) ?? null,
      appVersion:
        (typedReq?.headers['x-app-version'] as string | undefined) ?? null,
      appBuild:
        (typedReq?.headers['x-app-build'] as string | undefined) ?? null,
      appPlatform:
        (typedReq?.headers['x-app-platform'] as string | undefined) ?? null,
      deviceId:
        (typedReq?.headers['x-device-id'] as string | undefined) ?? null,
      requestId:
        (typedReq?.headers['x-request-id'] as string | undefined) ?? null,
      logOrigin:
        (typedReq?.headers['x-log-origin'] as string | undefined) ?? null,
    };
  }

  private tokenSuffix(token?: string | null) {
    return token ? token.slice(-10) : null;
  }

  private debug(_message: string, _data: Record<string, unknown>) {
    return;
  }
}
