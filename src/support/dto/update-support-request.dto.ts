import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsArray,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SupportStatus } from '@prisma/client';

export class UpdateTicketProgressDto {
  @IsEnum(SupportStatus, {
    message: 'status phải là OPEN, IN_PROGRESS, RESOLVED, CLOSED hoặc CANCELLED',
  })
  status: SupportStatus;

  @IsString()
  @IsNotEmpty({ message: 'Ghi chú tiến độ / phương án giải quyết không được để trống' })
  note: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photos?: string[];
}

export class AssignStaffTicketDto {
  @IsInt()
  @Type(() => Number)
  staffId: number;
}

export class AddTicketNoteDto {
  @IsString()
  @IsNotEmpty({ message: 'Nội dung phản hồi không được để trống' })
  note: string;
}
