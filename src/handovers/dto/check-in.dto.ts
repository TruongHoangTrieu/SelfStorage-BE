import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsArray,
  IsEnum,
  IsBoolean,
} from 'class-validator';
import { IdentityType } from '@prisma/client';

export class CheckInDto {
  @IsString({ message: 'reservationId must be a string' })
  @IsNotEmpty({ message: 'reservationId is required' })
  reservationId: string;

  @IsString({ message: 'condition must be a string' })
  @IsNotEmpty({ message: 'condition is required (e.g. Unit is clean and undamaged)' })
  condition: string;

  @IsOptional()
  @IsString({ message: 'notes must be a string' })
  notes?: string;

  @IsOptional()
  @IsArray({ message: 'photos must be an array of photo URLs or objects' })
  photos?: any[];

  @IsOptional()
  @IsEnum(IdentityType)
  identityType?: IdentityType;

  @IsOptional()
  @IsString()
  identityNumber?: string;

  @IsOptional()
  @IsString()
  identityAddress?: string;

  @IsOptional()
  @IsBoolean()
  isIdentityVerified?: boolean;

  @IsOptional()
  @IsString()
  identityFrontUrl?: string;

  @IsOptional()
  @IsString()
  identityBackUrl?: string;

  @IsOptional()
  @IsString({ message: 'unitCode must be a string' })
  unitCode?: string;
}
