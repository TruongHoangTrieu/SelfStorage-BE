import { IsString, IsNotEmpty, IsOptional, IsEnum } from 'class-validator';
import { AccessCodeStatus } from '@prisma/client';

export class RecordAccessLogDto {
  @IsOptional()
  @IsString()
  accessCode?: string;

  @IsOptional()
  @IsString()
  accessMethod?: string; // PIN_CODE, MOBILE_APP, RFID

  @IsOptional()
  @IsString()
  status?: string; // SUCCESS, FAILED_INVALID_PIN

  @IsOptional()
  @IsString()
  notes?: string;
}

export class ResetAccessCodeDto {
  @IsOptional()
  @IsString()
  newAccessCode?: string; // Nếu không truyền thì tự động sinh 6 số ngẫu nhiên
}

export class UpdateAccessStatusDto {
  @IsEnum(AccessCodeStatus)
  status: AccessCodeStatus;
}
