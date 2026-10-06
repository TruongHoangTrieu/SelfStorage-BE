import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { StorageUnitStatus } from '@prisma/client';

export class CreateStorageUnitDto {
  @IsString({ message: 'facilityId must be a string' })
  @IsNotEmpty({ message: 'facilityId is required' })
  facilityId: string;

  @IsString({ message: 'unitTypeId must be a string' })
  @IsNotEmpty({ message: 'unitTypeId is required' })
  unitTypeId: string;

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
