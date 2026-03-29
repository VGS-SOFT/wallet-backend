import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { UserEntity } from '../../database/entities/user.entity';
import { WalletEntity } from '../../database/entities/wallet.entity';
import { GoogleProfile } from './user.types';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,

    @InjectRepository(WalletEntity)
    private readonly walletRepo: Repository<WalletEntity>,

    private readonly dataSource: DataSource,
  ) {}

  /**
   * Find user by Google ID.
   * Returns null if not found.
   */
  async findByGoogleId(googleId: string): Promise<UserEntity | null> {
    return this.userRepo.findOne({ where: { google_id: googleId } });
  }

  /**
   * Find user by their UUID.
   */
  async findById(id: string): Promise<UserEntity | null> {
    return this.userRepo.findOne({ where: { id }, relations: ['wallet'] });
  }

  /**
   * Create a new user AND their wallet atomically.
   * If either fails, both are rolled back.
   */
  async createWithWallet(profile: GoogleProfile): Promise<UserEntity> {
    return this.dataSource.transaction(async (manager) => {
      // Create user
      const user = manager.create(UserEntity, {
        google_id: profile.google_id,
        email: profile.email,
        name: profile.name,
        avatar_url: profile.avatar_url,
      });
      const savedUser = await manager.save(user);

      // Auto-create wallet with 0 balance
      const wallet = manager.create(WalletEntity, {
        user_id: savedUser.id,
        balance: 0.0,
      });
      await manager.save(wallet);

      return savedUser;
    });
  }
}
