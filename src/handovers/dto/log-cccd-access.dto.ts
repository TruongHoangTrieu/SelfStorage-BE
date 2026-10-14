import {
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LogCccdAccessDto {
  @ApiProperty({ description: 'ID đơn đặt chỗ hoặc mã hợp đồng liên quan' })
  @IsString()
  @IsNotEmpty()
  reservationId: string;

  @ApiProperty({ description: 'Hành vi truy cập: VIEW_UNMASKED_CCCD hoặc PRINT_CONTRACT_WITH_CCCD' })
  @IsString()
  @IsNotEmpty()
  action: string;

  @ApiPropertyOptional({ description: 'Tên khách hàng' })
  @IsOptional()
  @IsString()
  customerName?: string;
}
