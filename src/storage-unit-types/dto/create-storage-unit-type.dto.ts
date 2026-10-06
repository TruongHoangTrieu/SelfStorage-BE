import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { UnitTypeStatus } from '@prisma/client';

export class CreateStorageUnitTypeDto {
  @IsString({ message: 'facilityId must be a string' })
  @IsNotEmpty({ message: 'facilityId is required' })
  facilityId: string;

  @IsString()
  @IsNotEmpty({ message: 'Name is required' })
  name: string;

  @IsString()
  @IsNotEmpty({ message: 'Code is required' })
  code: string;

  @IsOptional()
  @IsString()
  description?: string;

  @Type(() => Number)
  @IsNumber({}, { message: 'size must be a valid number' })
  @IsPositive({ message: 'size must be greater than 0' })
  size: number;

  @IsOptional()
  @IsString()
  sizeUnit?: string;

  @Type(() => Number)
  @IsNumber({}, { message: 'depositAmount must be a valid number' })
  @Min(0, { message: 'depositAmount must be greater than or equal to 0' })
  depositAmount: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'price must be a valid number' })
  @Min(0, { message: 'price must be greater than or equal to 0' })
  price?: number;

  @IsOptional()
  @IsEnum(UnitTypeStatus, { message: 'Status must be ACTIVE or INACTIVE' })
  status?: UnitTypeStatus;
}
