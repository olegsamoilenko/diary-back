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

@Controller('iap')
export class IapController {
  constructor(private readonly iap: IapService) {}

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

    const decoded = decodeBase64Json<RtdnPayload>(msg.data);

    if (decoded?.testNotification) {
      return 'ok';
    }

    if (hasSubscriptionNotification(decoded)) {
      const { purchaseToken } = decoded.subscriptionNotification;
      const pkg = decoded.packageName ?? '';
      if (purchaseToken && pkg) {
        await this.iap.pubSubAndroid(
          pkg,
          purchaseToken,
          decoded.subscriptionNotification.notificationType,
        );
      }
    }

    return 'ok';
  }
}
