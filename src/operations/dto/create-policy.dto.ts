import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsInt,
  IsDateString,
  IsDefined,
} from 'class-validator';
import { PolicyValueType, PolicyStatus } from '@prisma/client';

export class CreatePolicyDto {
  @IsOptional()
  @IsInt()
  facilityId?: number;

  @IsString()
  @IsNotEmpty()
  policyType: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsDefined()
  value: any;

  @IsOptional()
  @IsEnum(PolicyValueType)
  valueType?: PolicyValueType;

  @IsDateString()
  effectiveFrom: string;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string;

  @IsOptional()
  @IsEnum(PolicyStatus)
  status?: PolicyStatus;
}
