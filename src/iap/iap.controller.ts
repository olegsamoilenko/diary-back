import {
  Body,
  Controller,
  HttpCode,
  Optional,
  Post,
  Req,
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

@Controller('iap')
export class IapController {
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
  @HttpCode(200)
  async handle(
    @Body() body: PubSubPushEnvelope,
    @Req() req?: Request,
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
        let legacyError: unknown;

        try {
          await this.iap.pubSubAndroid(
            pkg,
            purchaseToken,
            decoded.subscriptionNotification.notificationType,
          );
        } catch (error) {
          legacyError = error;
        }

        try {
          await this.subscriptionsService.handleGooglePlayPubSub(
            pkg,
            purchaseToken,
            decoded.subscriptionNotification.notificationType,
          );
        } catch {
          // Preserve independent legacy and V2 subscription processing.
        }

        if (legacyError) {
          throw legacyError instanceof Error
            ? legacyError
            : new Error('Legacy Pub/Sub handler failed');
        }
      }
    }

    if (this.creditPurchasesService && hasOneTimeProductNotification(decoded)) {
      const notification = decoded.oneTimeProductNotification;
      const pkg = decoded.packageName ?? '';
      if (pkg && notification.purchaseToken && notification.sku) {
        await this.creditPurchasesService.handleGooglePlayRtdn(
          pkg,
          notification.purchaseToken,
          notification.sku,
          notification.notificationType,
        );
      }
    }

    if (
      this.creditPurchasesService &&
      hasVoidedPurchaseNotification(decoded) &&
      decoded.voidedPurchaseNotification.productType === 2 &&
      decoded.voidedPurchaseNotification.purchaseToken
    ) {
      await this.creditPurchasesService.handleVoidedGooglePlayPurchase(
        decoded.voidedPurchaseNotification.purchaseToken,
        decoded.voidedPurchaseNotification.orderId,
      );
    }

    return 'ok';
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
