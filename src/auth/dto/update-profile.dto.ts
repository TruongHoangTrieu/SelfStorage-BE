import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { IdentityType } from '@prisma/client';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Nguyễn Văn A', description: 'Họ và tên' })
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Họ và tên phải có ít nhất 2 ký tự' })
  fullName?: string;

  @ApiPropertyOptional({ example: '0901234567', description: 'Số điện thoại' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ enum: IdentityType, example: 'CCCD', description: 'Loại giấy tờ định danh' })
  @IsOptional()
  @IsEnum(IdentityType)
  identityType?: IdentityType;

  @ApiPropertyOptional({ example: '079095012345', description: 'Số CCCD hoặc số Hộ chiếu' })
  @IsOptional()
  @IsString()
  identityNumber?: string;

  @ApiPropertyOptional({ example: '2022-05-15', description: 'Ngày cấp (ISO Date string)' })
  @IsOptional()
  @IsString()
  identityIssueDate?: string;

  @ApiPropertyOptional({ example: 'Cục Cảnh sát QLHC về TTXH', description: 'Nơi cấp' })
  @IsOptional()
  @IsString()
  identityIssuePlace?: string;

  @ApiPropertyOptional({ example: 'Phường An Phú, TP. Thủ Đức, TP. Hồ Chí Minh', description: 'Địa chỉ thường trú' })
  @IsOptional()
  @IsString()
  identityAddress?: string;
}
