import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ApproveRenewalDto {
  @ApiPropertyOptional({
    description: 'Ghi chú của nhân viên / quản lý khi phê duyệt gia hạn',
    example: 'Đã xác nhận thanh toán phí gia hạn',
  })
  @IsOptional()
  @IsString({ message: 'notes phải là chuỗi' })
  notes?: string;
}

export class RejectRenewalDto {
  @ApiPropertyOptional({
    description: 'Lý do từ chối yêu cầu gia hạn',
    example: 'Ngăn kho có kế hoạch bảo trì nâng cấp sau khi hết hạn',
  })
  @IsOptional()
  @IsString({ message: 'reason phải là chuỗi' })
  reason?: string;
}
