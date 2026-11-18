import {
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LogCccdAccessDto {
  @ApiPropertyOptional({ description: 'ID đơn đặt chỗ hoặc mã đơn liên quan' })
  @IsOptional()
  @IsString()
  reservationId?: string;

  @ApiPropertyOptional({ description: 'ID hoặc mã hợp đồng liên quan (dành cho Mobile App)' })
  @IsOptional()
  @IsString()
  contractId?: string;

  @ApiPropertyOptional({ description: 'Hành vi truy cập: VIEW_UNMASKED_CCCD hoặc PRINT_CONTRACT_WITH_CCCD' })
  @IsOptional()
  @IsString()
  action?: string;

  @ApiPropertyOptional({ description: 'Lý do truy cập CCCD' })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({ description: 'Tên khách hàng' })
  @IsOptional()
  @IsString()
  customerName?: string;
}
