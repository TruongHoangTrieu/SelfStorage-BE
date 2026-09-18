import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsDateString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ReservationRentalPeriodUnit } from '@prisma/client';

export class CreateReservationDto {
  @Type(() => Number)
  @IsInt({ message: 'facilityId must be an integer' })
  @IsNotEmpty({ message: 'facilityId is required' })
  facilityId: number;

  @Type(() => Number)
  @IsInt({ message: 'unitTypeId must be an integer' })
  @IsNotEmpty({ message: 'unitTypeId is required' })
  unitTypeId: number;

  @IsDateString(
    {},
    {
      message:
        'appointmentDate must be a valid ISO 8601 date string (e.g., 2026-10-01T09:00:00.000Z)',
    },
  )
  @IsNotEmpty({ message: 'appointmentDate is required' })
  appointmentDate: string;

  @Type(() => Number)
  @IsInt({ message: 'rentalPeriod must be an integer' })
  @Min(1, { message: 'rentalPeriod must be at least 1' })
  @IsNotEmpty({ message: 'rentalPeriod is required' })
  rentalPeriod: number;

  @IsOptional()
  @IsEnum(ReservationRentalPeriodUnit, {
    message: 'rentalPeriodUnit must be one of: DAYS, WEEKS, MONTHS, YEARS',
  })
  rentalPeriodUnit?: ReservationRentalPeriodUnit;

  @IsOptional()
  @IsString()
  notes?: string;
}
