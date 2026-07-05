import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
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
  hasSubscriptionNotification,
} from 'src/iap/utils/rtdn';
import { SubscriptionsService } from 'src/subscriptions/subscriptions.service';

@Controller('iap')
export class IapController {
  constructor(
    private readonly iap: IapService,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  @UseGuards(AuthGuard('jwt'))
  @Post('create-sub')
  async createSub(
    @ActiveUserData() user: ActiveUserDataT,
    @Body() body: VerifyDto,
  ) {
    if (body.platform === 'android') {
      return await this.iap.createAndroidSub(
        user.id,
        body.packageName,
        body.purchaseToken,
      );
    }

    // if (body.platform === 'ios') {
    // }
  }

  @Post('pub-sub')
  @HttpCode(200)
  async handle(@Body() body: PubSubPushEnvelope): Promise<'ok'> {
    const msg = body.message;
    if (!msg?.data) {
      return 'ok';
    }
    console.dir(msg, { depth: null, colors: true });

    const decoded = decodeBase64Json<RtdnPayload>(msg.data);

    if (decoded?.testNotification) {
      return 'ok';
    }

    console.dir(decoded, { depth: null, colors: true });

    if (hasSubscriptionNotification(decoded)) {
      const { purchaseToken } = decoded.subscriptionNotification;
      const pkg = decoded.packageName ?? '';
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
        } catch (error) {
          console.error('Error in subscriptions Pub/Sub handler:', error);
        }

        if (legacyError) {
          throw legacyError;
        }
      }
    }

    return 'ok';
  }
}
