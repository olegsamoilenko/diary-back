import { Body, Controller, Post } from '@nestjs/common';
import { IapService } from './iap.service';
import { VerifyDto, VerifyResp } from './dto/iap.dto';

@Controller('iap')
export class IapController {
  constructor(private readonly iap: IapService) {}

  @Post('verify')
  async verify(@Body() body: VerifyDto): Promise<VerifyResp> {
    if (body.platform === 'android') {
      const r = await this.iap.verifyAndroidSub(
        body.packageName,
        body.purchaseToken,
      );

      console.log('Android verify result:', r);

      // Тут зроби upsert у таблицю підписок (userId, planId, startAt, expiresAt, storeState, autoRenewing, raw)
      // await repo.upsert(...)

      return {
        planId: r.planId,
        startAt: r.startAt,
        expiresAt: r.expiresAt,
        storeState: r.storeState,
        autoRenewing: r.autoRenewing,
      };
    }

    // iOS — коли будеш готовий
    // const r = await this.iap.verifyIos(...);

    return {
      planId: '',
      storeState: 'EXPIRED',
    };
  }
}
