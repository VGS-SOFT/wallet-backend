import { Injectable, Logger } from '@nestjs/common';
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

  async findById(id: string): Promise<UserEntity | null> {
    return this.userRepo.findOne({ where: { id }, relations: ['wallet'] });
  }

  /**
   * Production-grade find-or-create using PostgreSQL upsert.
   *
   * Problem with naive find -> check -> insert:
   *   Two simultaneous requests both pass the find check,
   *   both attempt INSERT — one crashes with unique constraint violation.
   *
   * Solution: INSERT ... ON CONFLICT DO NOTHING (upsert).
   *   - If user doesn’t exist: inserts and creates wallet atomically.
   *   - If user already exists: conflict is silently ignored, then we fetch.
   *   - Race-condition safe: even concurrent requests resolve correctly.
   */
  async findOrCreateWithWallet(profile: GoogleProfile): Promise<UserEntity> {
    return this.dataSource.transaction(async (manager) => {
      // Upsert user — ON CONFLICT (google_id) DO NOTHING
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
        .orIgnore() // ON CONFLICT DO NOTHING
        .execute();

      // Fetch the user (whether just created or already existed)
      const user = await manager.findOne(UserEntity, {
        where: { google_id: profile.google_id },
      });

      // Upsert wallet — ON CONFLICT (user_id) DO NOTHING
      await manager
        .createQueryBuilder()
        .insert()
        .into(WalletEntity)
        .values({
          user_id: user.id,
          balance: 0.0,
        })
        .orIgnore() // wallet may already exist for returning users
        .execute();

      return user;
    });
  }
}
