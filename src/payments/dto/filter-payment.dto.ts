import { IsOptional, IsInt, IsEnum, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentStatus, PaymentType, PaymentMethod } from '@prisma/client';

export class FilterPaymentDto {
  @ApiPropertyOptional({ description: 'Số trang (mặc định: 1)', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Số bản ghi trên trang (mặc định: 10)', example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 10;

  @ApiPropertyOptional({ description: 'Lọc theo trạng thái thanh toán', enum: PaymentStatus })
  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  @ApiPropertyOptional({ description: 'Lọc theo loại thanh toán', enum: PaymentType })
  @IsOptional()
  @IsEnum(PaymentType)
  paymentType?: PaymentType;

  @ApiPropertyOptional({ description: 'Lọc theo phương thức thanh toán', enum: PaymentMethod })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({ description: 'Lọc theo ID đơn đặt chỗ (Reservation ID)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  reservationId?: number;

  @ApiPropertyOptional({ description: 'Lọc theo ID hợp đồng (Contract ID)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  contractId?: number;
}
