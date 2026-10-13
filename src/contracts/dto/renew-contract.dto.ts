import { IsInt, IsOptional, IsString, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class RenewContractDto {
  @ApiProperty({ description: 'Số tháng muốn gia hạn (1, 3, 6, 12 tháng)', example: 3 })
  @IsInt({ message: 'Số tháng gia hạn phải là số nguyên' })
  @Min(1, { message: 'Gia hạn tối thiểu 1 tháng' })
  @Max(36, { message: 'Gia hạn tối đa 36 tháng' })
  @Type(() => Number)
  extendedMonths: number;

  @ApiProperty({ description: 'Phương thức thanh toán', example: 'SEPAY_QR', required: false })
  @IsOptional()
  @IsString()
  paymentMethod?: string;
}
