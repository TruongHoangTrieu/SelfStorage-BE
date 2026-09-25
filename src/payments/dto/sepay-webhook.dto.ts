import { IsNotEmpty, IsNumber, IsString, IsOptional, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SePayWebhookDto {
  @ApiProperty({ description: 'ID giao dịch duy nhất trên hệ thống SePay', example: 123456 })
  @IsNumber()
  @IsNotEmpty()
  id: number;

  @ApiProperty({ description: 'Tên ngân hàng phát sinh giao dịch', example: 'MBBank' })
  @IsString()
  @IsNotEmpty()
  gateway: string;

  @ApiProperty({ description: 'Thời gian giao dịch', example: '2026-09-25 15:30:00' })
  @IsString()
  @IsNotEmpty()
  transactionDate: string;

  @ApiProperty({ description: 'Số tài khoản ngân hàng nhận tiền', example: '0123456789' })
  @IsString()
  @IsNotEmpty()
  accountNumber: string;

  @ApiPropertyOptional({ description: 'Mã thanh toán SePay nhận diện nếu có', example: 'SSDEP1001A2B3' })
  @IsOptional()
  @IsString()
  code?: string | null;

  @ApiProperty({ description: 'Nội dung chuyển khoản từ ứng dụng ngân hàng', example: 'SSDEP1001A2B3 chuyen tien dat coc' })
  @IsString()
  @IsNotEmpty()
  content: string;

  @ApiProperty({ description: 'Loại giao dịch: "in" (tiền vào) hoặc "out" (tiền ra)', example: 'in' })
  @IsString()
  @IsIn(['in', 'out'])
  transferType: 'in' | 'out';

  @ApiProperty({ description: 'Số tiền giao dịch (VND)', example: 500000 })
  @IsNumber()
  @IsNotEmpty()
  transferAmount: number;

  @ApiPropertyOptional({ description: 'Số dư lũy kế sau giao dịch', example: 10500000 })
  @IsOptional()
  @IsNumber()
  accumulated?: number;

  @ApiPropertyOptional({ description: 'Tài khoản phụ (nếu có)' })
  @IsOptional()
  @IsString()
  subAccount?: string | null;

  @ApiPropertyOptional({ description: 'Mã tham chiếu ngân hàng (FT reference code)', example: 'FT260925ABC123' })
  @IsOptional()
  @IsString()
  referenceCode?: string | null;

  @ApiPropertyOptional({ description: 'Mô tả chi tiết giao dịch' })
  @IsOptional()
  @IsString()
  description?: string | null;
}
