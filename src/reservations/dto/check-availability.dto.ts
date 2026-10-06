import {
  IsNotEmpty,
  IsOptional,
  IsDateString,
  IsString,
  Min,
  IsEnum,
  IsInt,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ReservationRentalPeriodUnit } from '@prisma/client';

export class CheckAvailabilityDto {
  @IsString({ message: 'facilityId must be a string' })
  @IsNotEmpty({ message: 'facilityId is required' })
  facilityId: string;

  @IsString({ message: 'unitTypeId must be a string' })
  @IsNotEmpty({ message: 'unitTypeId is required' })
  unitTypeId: string;

  @IsOptional()
  @IsDateString()
  appointmentDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  rentalPeriod?: number;

  @IsOptional()
  @IsEnum(ReservationRentalPeriodUnit)
  rentalPeriodUnit?: ReservationRentalPeriodUnit;
}
