import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsDateString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ReservationRentalPeriodUnit } from '@prisma/client';

export class UpdateReservationDto {
  @IsOptional()
  @IsDateString(
    {},
    {
      message:
        'appointmentDate must be a valid ISO 8601 date string (e.g., 2026-10-01T09:00:00.000Z)',
    },
  )
  appointmentDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'rentalPeriod must be an integer' })
  @Min(1, { message: 'rentalPeriod must be at least 1' })
  rentalPeriod?: number;

  @IsOptional()
  @IsEnum(ReservationRentalPeriodUnit, {
    message: 'rentalPeriodUnit must be one of: DAYS, WEEKS, MONTHS, YEARS',
  })
  rentalPeriodUnit?: ReservationRentalPeriodUnit;

  @IsOptional()
  @IsString()
  notes?: string;
}
