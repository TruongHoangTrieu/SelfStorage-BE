import { IsEnum, IsInt, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { StorageUnitStatus } from '@prisma/client';

export class FilterStorageUnitDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  facilityId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  unitTypeId?: number;

  @IsOptional()
  @IsEnum(StorageUnitStatus)
  status?: StorageUnitStatus;
}
