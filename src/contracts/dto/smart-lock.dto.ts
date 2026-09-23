import { IsString, IsOptional, IsEnum, Matches } from 'class-validator';
import { AccessCodeStatus } from '@prisma/client';

export class ChangeSmartLockPinDto {
  @IsString()
  @Matches(/^\d{4,8}$/, {
    message: 'Mã PIN mới phải là chuỗi từ 4 đến 8 chữ số',
  })
  newPin: string;
}

export class ResetSmartLockPinDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{4,8}$/, {
    message: 'Mã PIN đặt lại phải là chuỗi từ 4 đến 8 chữ số nếu có nhập',
  })
  newPin?: string;
}

export class UpdateSmartLockStatusDto {
  @IsEnum(AccessCodeStatus)
  status: AccessCodeStatus;
}
