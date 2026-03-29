import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { UserEntity } from '../../database/entities/user.entity';
import { WalletEntity } from '../../database/entities/wallet.entity';
import { GoogleProfile } from './user.types';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,

    @InjectRepository(WalletEntity)
    private readonly walletRepo: Repository<WalletEntity>,

    private readonly dataSource: DataSource,
  ) {}

  async findByGoogleId(googleId: string): Promise<UserEntity | null> {
    return this.userRepo.findOne({ where: { google_id: googleId } });
  }

  /**
   * Lightweight findById — used by JwtStrategy on EVERY request.
   * Does NOT load wallet relation here — that would be a JOIN on every
   * authenticated request, which is expensive and unnecessary.
   * Wallet is loaded only when explicitly needed (e.g. wallet routes).
   */
  async findById(id: string): Promise<UserEntity | null> {
    return this.userRepo.findOne({ where: { id } });
  }

  /**
   * findByIdWithWallet — loads user + wallet relation.
   * Used only when wallet data is explicitly needed.
   */
  async findByIdWithWallet(id: string): Promise<UserEntity | null> {
    return this.userRepo.findOne({ where: { id }, relations: ['wallet'] });
  }

  /**
   * Production-grade find-or-create using PostgreSQL upsert.
   *
   * Race-condition safe: INSERT ... ON CONFLICT DO NOTHING.
   * Even if two requests hit simultaneously, PostgreSQL handles the conflict
   * atomically — only one INSERT succeeds, both requests then fetch the same row.
   *
   * Null-safety: throws InternalServerErrorException if user cannot be fetched
   * after upsert — prevents silent null propagation downstream.
   */
  async findOrCreateWithWallet(profile: GoogleProfile): Promise<UserEntity> {
    return this.dataSource.transaction(async (manager) => {
      // Upsert user
      await manager
        .createQueryBuilder()
        .insert()
        .into(UserEntity)
        .values({
          google_id: profile.google_id,
          email: profile.email,
          name: profile.name,
          avatar_url: profile.avatar_url,
        })
        .orIgnore()
        .execute();

      // Fetch user after upsert
      const user = await manager.findOne(UserEntity, {
        where: { google_id: profile.google_id },
      });

      // Null safety — should never happen, but must be guarded
      if (!user) {
        this.logger.error(
          `findOrCreateWithWallet: user not found after upsert for google_id=${profile.google_id}`,
        );
        throw new InternalServerErrorException(
          'User could not be created. Please try again.',
        );
      }

      // Upsert wallet
      await manager
        .createQueryBuilder()
        .insert()
        .into(WalletEntity)
        .values({
          user_id: user.id,
          balance: 0.0,
        })
        .orIgnore()
        .execute();

      return user;
    });
  }
}
