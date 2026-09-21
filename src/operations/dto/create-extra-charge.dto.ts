import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  IsNumber,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateExtraChargeDto {
  @IsOptional()
  @IsInt()
  contractId?: number;

  @IsOptional()
  @IsInt()
  reservationId?: number;

  @IsInt()
  @IsNotEmpty()
  feeTypeId: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount: number;

  @IsOptional()
  @IsString()
  reason?: string;
}
