import { IsInt, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class FilterStorageUnitTypeDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'facilityId must be an integer' })
  facilityId?: number;
}
