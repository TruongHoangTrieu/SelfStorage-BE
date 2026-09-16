import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { StorageUnitStatus } from '@prisma/client';

export class UpdateStorageUnitDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'unitTypeId must be an integer' })
  unitTypeId?: number;

  @IsOptional()
  @IsString()
  unitNumber?: string;

  @IsOptional()
  @IsString()
  floor?: string;

  @IsOptional()
  @IsEnum(StorageUnitStatus, {
    message:
      'Status must be AVAILABLE, RESERVED, OCCUPIED, UNDER_MAINTENANCE, or OUT_OF_SERVICE',
  })
  status?: StorageUnitStatus;

  @IsOptional()
  @IsString()
  condition?: string;
}
