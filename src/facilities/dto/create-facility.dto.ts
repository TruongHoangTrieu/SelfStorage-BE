import {
  IsArray,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
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
  @Type(() => Number)
  @IsNumber({}, { message: 'totalArea must be a valid number' })
  @IsPositive({ message: 'totalArea must be greater than 0' })
  totalArea?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];

  @IsOptional()
  @IsEnum(FacilityStatus, {
    message: 'Status must be ACTIVE, INACTIVE, or UNDER_MAINTENANCE',
  })
  status?: FacilityStatus;
}
