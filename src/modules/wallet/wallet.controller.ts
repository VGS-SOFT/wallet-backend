import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { WalletService } from './wallet.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserEntity } from '../../database/entities/user.entity';
import { TopUpDto } from './dto/topup.dto';
import { TransactionQueryDto } from './dto/transaction-query.dto';

@Controller('wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  /**
   * GET /wallet/balance
   * Returns current wallet balance for the logged-in user.
   */
  @Get('balance')
  async getBalance(@CurrentUser() user: UserEntity) {
    const wallet = await this.walletService.getWalletByUserId(user.id);
    return {
      balance: Number(wallet.balance),
      currency: 'INR',
    };
  }

  /**
   * POST /wallet/topup
   * Adds money to wallet. Validated via TopUpDto.
   * Pessimistic lock prevents race conditions.
   */
  @Post('topup')
  @HttpCode(HttpStatus.OK)
  async topUp(
    @CurrentUser() user: UserEntity,
    @Body() dto: TopUpDto,
  ) {
    const transaction = await this.walletService.topUp(user.id, dto);
    return {
      message: 'Top-up successful',
      transaction: {
        id: transaction.id,
        type: transaction.type,
        amount: Number(transaction.amount),
        balance_after: Number(transaction.balance_after),
        description: transaction.description,
        created_at: transaction.created_at,
      },
    };
  }

  /**
   * GET /wallet/transactions
   * Paginated transaction history. ?page=1&limit=10
   */
  @Get('transactions')
  async getTransactions(
    @CurrentUser() user: UserEntity,
    @Query() query: TransactionQueryDto,
  ) {
    const result = await this.walletService.getTransactions(user.id, query);
    return {
      transactions: result.transactions.map((tx) => ({
        id: tx.id,
        type: tx.type,
        amount: Number(tx.amount),
        balance_after: Number(tx.balance_after),
        description: tx.description,
        created_at: tx.created_at,
      })),
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        total_pages: Math.ceil(result.total / result.limit),
      },
    };
  }
}
