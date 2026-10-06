import { IsEnum, IsOptional, IsString } from 'class-validator';
import { StorageUnitStatus } from '@prisma/client';

export class FilterStorageUnitDto {
  @IsOptional()
  @IsString()
  facilityId?: string;

  @IsOptional()
  @IsString()
  unitTypeId?: string;

  @IsOptional()
  @IsEnum(StorageUnitStatus)
  status?: StorageUnitStatus;
}
