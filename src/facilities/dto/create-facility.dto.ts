import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { FacilityStatus } from '@prisma/client';

export class CreateFacilityDto {
  @IsString()
  @IsNotEmpty({ message: 'Facility name is required' })
  @MinLength(2, { message: 'Facility name must be at least 2 characters long' })
  name: string;

  @IsString()
  @IsNotEmpty({ message: 'Facility code is required' })
  code: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Invalid email format' })
  email?: string;

  @IsString()
  @IsNotEmpty({ message: 'Facility address is required' })
  address: string;

  @IsOptional()
  @IsEnum(FacilityStatus, {
    message: 'Status must be ACTIVE, INACTIVE, or UNDER_MAINTENANCE',
  })
  status?: FacilityStatus;
}
