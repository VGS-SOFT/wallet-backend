import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WalletEntity } from '../../database/entities/wallet.entity';
import { WalletTransactionEntity } from '../../database/entities/wallet-transaction.entity';
import { WalletService } from './wallet.service';
import { WalletController } from './wallet.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([WalletEntity, WalletTransactionEntity]),
  ],
  controllers: [WalletController],
  providers: [WalletService],
  exports: [WalletService], // exported for Phase 3 (call debit)
})
export class WalletModule {}
