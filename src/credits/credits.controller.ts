import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ActiveUserData,
  ActiveUserDataT,
} from 'src/auth/decorators/active-user.decorator';
import { CreditPurchasesService } from './credit-purchases.service';
import { CreditWalletService } from './credit-wallet.service';
import { PurchaseCreditPackDto } from './dto/purchase-credit-pack.dto';

@Controller('credits')
@UseGuards(AuthGuard('jwt'))
export class CreditsController {
  constructor(
    private readonly creditPurchasesService: CreditPurchasesService,
    private readonly creditWalletService: CreditWalletService,
  ) {}

  @Get('me')
  async getMyCredits(@ActiveUserData() user: ActiveUserDataT) {
    return {
      purchasedCredits: await this.creditWalletService.getSummary(user.id),
    };
  }

  @Post('google-play/purchase')
  async purchaseGooglePlay(
    @ActiveUserData() user: ActiveUserDataT,
    @Body() dto: PurchaseCreditPackDto,
  ) {
    return this.creditPurchasesService.purchaseGooglePlay(user.id, dto);
  }
}
