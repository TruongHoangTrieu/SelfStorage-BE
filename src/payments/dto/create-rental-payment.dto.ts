import { IsInt, IsNotEmpty, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';

export class CreateRentalPaymentDto {
  @ApiProperty({
    description: 'ID của đơn đặt chỗ (Reservation ID) hoặc Hợp đồng cần thanh toán tiền thuê',
    example: 1,
  })
  @IsInt()
  @IsNotEmpty()
  reservationId: number;

  @ApiPropertyOptional({
    description: 'Phương thức thanh toán (CASH, BANK_TRANSFER, CARD, etc.)',
    enum: PaymentMethod,
    default: PaymentMethod.BANK_TRANSFER,
  })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod = PaymentMethod.BANK_TRANSFER;
}
