import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IapService } from './iap.service';
import { VerifyDto, VerifyResp } from './dto/iap.dto';
import { AuthGuard } from '@nestjs/passport';
import {
  ActiveUserData,
  ActiveUserDataT,
} from '../auth/decorators/active-user.decorator';

@Controller('iap')
export class IapController {
  constructor(private readonly iap: IapService) {}

  @UseGuards(AuthGuard('jwt'))
  @Post('verify')
  async verify(
    @ActiveUserData() user: ActiveUserDataT,
    @Body() body: VerifyDto,
  ) {
    if (body.platform === 'android') {
      return await this.iap.verifyAndroidSub(
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
  async handle(@Body() body: any) {
    const msg = body?.message;
    if (!msg?.data) return 'ok';
    const decoded = JSON.parse(
      Buffer.from(msg.data, 'base64').toString('utf8'),
    );

    console.log('G-PUB-SUB', JSON.stringify(decoded, null, 2));

    if (decoded.testNotification) return 'ok';

    const subN = decoded.subscriptionNotification;
    if (subN?.purchaseToken) {
      console.log('subN', subN);
      // тут виклич свій сервіс, який зробить subscriptionsv2.get і оновить БД
      // await this.subs.syncFromPlay({ packageName: 'com.soniac12.nemory', purchaseToken: subN.purchaseToken });
    }
    return 'ok';
  }
}
