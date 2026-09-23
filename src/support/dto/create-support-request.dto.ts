import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  IsArray,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SupportCategory, SupportPriority } from '@prisma/client';

export class CreateSupportRequestDto {
  @IsInt()
  @Type(() => Number)
  facilityId: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  contractItemId?: number;

  @IsEnum(SupportCategory, {
    message:
      'category phải là một trong các giá trị: UNIT, LOCK, ACCESS_CODE, PAYMENT, STORED_ITEMS, LOST_KEY, DAMAGE, OTHER',
  })
  category: SupportCategory;

  @IsString()
  @IsNotEmpty({ message: 'Tiêu đề sự cố không được để trống' })
  @MaxLength(200, { message: 'Tiêu đề không được vượt quá 200 ký tự' })
  subject: string;

  @IsString()
  @IsNotEmpty({ message: 'Mô tả chi tiết sự cố không được để trống' })
  description: string;

  @IsOptional()
  @IsEnum(SupportPriority, {
    message: 'priority phải là LOW, MEDIUM, HIGH hoặc URGENT',
  })
  priority?: SupportPriority;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photos?: string[];
}
