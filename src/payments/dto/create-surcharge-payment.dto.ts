import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';

export class CreateSurchargePaymentDto {
  @ApiPropertyOptional({
    description: 'ID hợp đồng thuê kho cần phụ thu (nếu có)',
    example: '671234567890abcdef123456',
  })
  @IsOptional()
  @IsString()
  contractId?: string;

  @ApiPropertyOptional({
    description: 'ID đơn đặt chỗ (nếu có)',
  })
  @IsOptional()
  @IsString()
  reservationId?: string;

  @ApiProperty({
    description: 'Mã ô kho (phục vụ hiển thị trên nội dung chuyển khoản)',
    example: 'STD_1-02',
  })
  @IsOptional()
  @IsString()
  unitCode?: string;

  @ApiProperty({
    description: 'Tổng số tiền phụ thu (VND)',
    example: 150000,
  })
  @Type(() => Number)
  @IsNumber()
  @Min(1000, { message: 'Số tiền phụ thu tối thiểu là 1,000 VND' })
  amount: number;

  @ApiPropertyOptional({
    description: 'Lý do phụ thu / danh mục hư hỏng',
    example: 'Vệ sinh rác và trầy xước sàn',
  })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({
    description: 'Phương thức thanh toán',
    enum: PaymentMethod,
    default: PaymentMethod.BANK_TRANSFER,
  })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;
}

