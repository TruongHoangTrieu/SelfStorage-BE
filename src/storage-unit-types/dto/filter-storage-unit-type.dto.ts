import { IsOptional, IsString } from 'class-validator';

export class FilterStorageUnitTypeDto {
  @IsOptional()
  @IsString({ message: 'facilityId must be a string' })
  facilityId?: string;
}
