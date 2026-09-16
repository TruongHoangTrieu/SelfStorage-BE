import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { FacilityStatus } from '@prisma/client';

export class UpdateFacilityDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Facility name must be at least 2 characters long' })
  name?: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Invalid email format' })
  email?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsEnum(FacilityStatus, {
    message: 'Status must be ACTIVE, INACTIVE, or UNDER_MAINTENANCE',
  })
  status?: FacilityStatus;
}
