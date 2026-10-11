import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { OverdueStatus } from '@prisma/client';

export class FilterOverdueDto {
  @ApiPropertyOptional({
    description: 'Số trang',
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Số bản ghi trên mỗi trang',
    default: 10,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 10;

  @ApiPropertyOptional({
    description: 'Lọc theo trạng thái xử lý quá hạn (OPEN, RESOLVED, WAIVED)',
    enum: OverdueStatus,
  })
  @IsOptional()
  @IsEnum(OverdueStatus)
  status?: OverdueStatus;

  @ApiPropertyOptional({
    description: 'Lọc theo ID cơ sở kho',
  })
  @IsOptional()
  @IsString()
  facilityId?: string;
}

export class ResolveOverdueDto {
  @ApiPropertyOptional({
    description: 'Ghi chú khi giải quyết tình trạng quá hạn (ví dụ: khách đã đóng phạt qua ngân hàng)',
    example: 'Khách hàng đã thanh toán đủ tiền phạt trễ hạn và hoàn tất thủ tục bàn giao',
  })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    description: 'Tùy chọn gia hạn hợp đồng sau khi giải quyết phạt (số tháng muốn gia hạn thêm)',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  extendMonths?: number;
}
