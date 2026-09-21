import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsNumber,
  Min,
} from 'class-validator';
import { FeeAmountType, FeeAppliesTo, FeeTypeStatus } from '@prisma/client';
import { Type } from 'class-transformer';

export class CreateFeeTypeDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  code: string;

  @IsOptional()
  @IsString()
  description?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  defaultAmount: number;

  @IsOptional()
  @IsEnum(FeeAmountType)
  amountType?: FeeAmountType;

  @IsOptional()
  @IsEnum(FeeAppliesTo)
  appliesTo?: FeeAppliesTo;

  @IsOptional()
  @IsEnum(FeeTypeStatus)
  status?: FeeTypeStatus;
}
