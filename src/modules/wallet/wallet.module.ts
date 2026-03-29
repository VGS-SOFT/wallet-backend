import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WalletEntity } from '../../database/entities/wallet.entity';
import { WalletTransactionEntity } from '../../database/entities/wallet-transaction.entity';
import { PlatformAccountEntity } from '../../database/entities/platform-account.entity';
import { PlatformAccountTransactionEntity } from '../../database/entities/platform-account-transaction.entity';
import { TopUpOrderEntity } from '../../database/entities/topup-order.entity';
import { WalletService } from './wallet.service';
import { WalletController } from './wallet.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WalletEntity,
      WalletTransactionEntity,
      PlatformAccountEntity,
      PlatformAccountTransactionEntity,
      TopUpOrderEntity,
    ]),
  ],
  controllers: [WalletController],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}
