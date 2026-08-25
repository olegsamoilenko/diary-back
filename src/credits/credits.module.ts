import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from 'src/users/entities/user.entity';
import { CreditPurchasesService } from './credit-purchases.service';
import { CreditWalletService } from './credit-wallet.service';
import { CreditsController } from './credits.controller';
import { CreditLedgerEntry } from './entities/credit-ledger-entry.entity';
import { CreditPurchase } from './entities/credit-purchase.entity';
import { CreditWallet } from './entities/credit-wallet.entity';
import { GooglePlayCreditPurchasesService } from './google-play-credit-purchases.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CreditLedgerEntry,
      CreditPurchase,
      CreditWallet,
      User,
    ]),
  ],
  providers: [
    CreditPurchasesService,
    CreditWalletService,
    GooglePlayCreditPurchasesService,
  ],
  controllers: [CreditsController],
  exports: [CreditPurchasesService, CreditWalletService],
})
export class CreditsModule {}
