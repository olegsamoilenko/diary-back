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

    if (body.platform === 'ios') {
      // iOS — коли будеш готовий
    }
  }

  @Post('pub-sub')
  // @UseGuards(PubsubOidcGuard)
  @HttpCode(200)
  async handle(@Body() body: PubSubPushEnvelope): Promise<'ok'> {
    const msg = body.message;
    if (!msg?.data) {
      return 'ok';
    }

    const decoded = decodeBase64Json<RtdnPayload>(msg.data);

    console.log('G-PUB-SUB', JSON.stringify(decoded, null, 2));

    if (decoded?.testNotification) {
      return 'ok';
    }

    if (hasSubscriptionNotification(decoded)) {
      const { purchaseToken } = decoded.subscriptionNotification;
      const pkg = decoded.packageName ?? '';
      if (purchaseToken && pkg) {
        // console.log('RTDN subscriptionNotification', {
        //   packageName: pkg,
        //   purchaseToken,
        //   notificationType: decoded.subscriptionNotification.notificationType,
        //   subscriptionId: decoded.subscriptionNotification.subscriptionId,
        // });
        await this.iap.pubSub(pkg, purchaseToken);
      }
    }

    return 'ok';
  }
}
