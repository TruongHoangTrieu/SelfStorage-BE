import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsDateString,
  Min,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ReservationRentalPeriodUnit } from '@prisma/client';

export class CheckAvailabilityDto {
  @Type(() => Number)
  @IsInt({ message: 'facilityId must be an integer' })
  @IsNotEmpty({ message: 'facilityId is required' })
  facilityId: number;

  @Type(() => Number)
  @IsInt({ message: 'unitTypeId must be an integer' })
  @IsNotEmpty({ message: 'unitTypeId is required' })
  unitTypeId: number;

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
