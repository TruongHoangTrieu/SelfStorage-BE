import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { StorageUnitStatus } from '@prisma/client';

export class CreateStorageUnitDto {
  @Type(() => Number)
  @IsInt({ message: 'facilityId must be an integer' })
  @IsNotEmpty({ message: 'facilityId is required' })
  facilityId: number;

  @Type(() => Number)
  @IsInt({ message: 'unitTypeId must be an integer' })
  @IsNotEmpty({ message: 'unitTypeId is required' })
  unitTypeId: number;

  @IsString()
  @IsNotEmpty({ message: 'unitNumber is required' })
  unitNumber: string;

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
