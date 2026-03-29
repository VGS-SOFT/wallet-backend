import { IsNumber, IsString, IsNotEmpty, Min, Max, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class TopUpDto {
  /**
   * Amount must be:
   * - A positive number (Min 1)
   * - No more than 100,000 per transaction (business rule)
   * - Transformed to number automatically (handles string input from JSON)
   */
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Amount must be a number with max 2 decimal places' })
  @Min(1, { message: 'Minimum top-up amount is ₹1' })
  @Max(100000, { message: 'Maximum top-up amount is ₹1,00,000 per transaction' })
  @Type(() => Number)
  amount: number;

  @IsString()
  @IsNotEmpty({ message: 'Description is required' })
  @IsOptional()
  description?: string;
}
