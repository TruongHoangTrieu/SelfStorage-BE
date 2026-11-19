import {
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OverdueStatus, StorageUnitStatus } from '@prisma/client';

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

export class RequestLiquidationDto {
  @ApiPropertyOptional({
    description: 'Ghi chú / chỉ đạo của Quản lý gửi nhân viên khi yêu cầu thanh lý kho',
    example: 'Hợp đồng quá hạn > 7 ngày, tiến hành kiểm kê đồ tồn và thu hồi ô kho.',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CompleteLiquidationDto {
  @ApiProperty({
    description: 'Hiện trạng kho và tài sản tồn đọng khi kiểm kê thanh lý',
    example: 'Đã kiểm kê và đóng gói đồ đạc tồn kho, niêm phong bàn giao xử lý.',
  })
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng mô tả hiện trạng kiểm kê khi thanh lý' })
  condition: string;

  @ApiPropertyOptional({
    description: 'Ghi chú bổ sung trong biên bản thanh lý kho',
  })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    description: 'Danh sách URL ảnh chụp đồ đạc tồn kho và hiện trạng ô kho khi thanh lý',
  })
  @IsOptional()
  @IsArray()
  photos?: string[];

  @ApiProperty({
    description: 'Mã PIN Smart Lock mới gồm 6 chữ số để đặt lại cho ô kho',
    example: '593812',
  })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'Mã PIN mới phải gồm đúng 6 chữ số' })
  newAccessCode: string;

  @ApiPropertyOptional({
    description: 'Trạng thái ô kho sau khi thanh lý (AVAILABLE hoặc UNDER_MAINTENANCE)',
    enum: StorageUnitStatus,
    default: StorageUnitStatus.AVAILABLE,
  })
  @IsOptional()
  @IsEnum(StorageUnitStatus, {
    message: 'unitCondition phải là AVAILABLE hoặc UNDER_MAINTENANCE',
  })
  unitCondition?: StorageUnitStatus;
}
