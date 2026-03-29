import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CallSessionEntity } from '../../database/entities/call-session.entity';
import { WalletModule } from '../wallet/wallet.module';
import { UsersModule } from '../users/users.module';
import { CallsService } from './calls.service';
import { CallsController } from './calls.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([CallSessionEntity]),
    WalletModule,  // gives access to WalletService.debit()
    UsersModule,
  ],
  controllers: [CallsController],
  providers: [CallsService],
  exports: [CallsService],
})
export class CallsModule {}
