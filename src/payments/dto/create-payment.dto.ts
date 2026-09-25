import { IsInt, IsNotEmpty, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';

export class CreateDepositPaymentDto {
  @ApiProperty({
    description: 'ID của đơn đặt chỗ (Reservation ID) cần tạo thanh toán tiền cọc',
    example: 1,
  })
  @IsInt()
  @IsNotEmpty()
  reservationId: number;

  @ApiPropertyOptional({
    description: 'Phương thức thanh toán (mặc định: BANK_TRANSFER)',
    enum: PaymentMethod,
    default: PaymentMethod.BANK_TRANSFER,
  })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod = PaymentMethod.BANK_TRANSFER;
}
