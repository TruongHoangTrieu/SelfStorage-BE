import {
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';
import { StorageUnitStatus } from '@prisma/client';

export class UpdateStorageUnitDto {
  @IsOptional()
  @IsString({ message: 'unitTypeId must be a string' })
  unitTypeId?: string;

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
