import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RequestRenewalDto {
  @ApiProperty({
    description: 'ID hợp đồng muốn gia hạn',
    example: '661234567890abcdef123456',
  })
  @IsString({ message: 'contractId phải là chuỗi' })
  @IsNotEmpty({ message: 'contractId không được để trống' })
  contractId: string;

  @ApiProperty({
    description: 'Số tháng muốn gia hạn thêm (tối thiểu 1 tháng, tối đa 36 tháng)',
    example: 3,
    minimum: 1,
    maximum: 36,
  })
  @Type(() => Number)
  @IsInt({ message: 'months phải là số nguyên' })
  @Min(1, { message: 'Thời gian gia hạn tối thiểu là 1 tháng' })
  @Max(36, { message: 'Thời gian gia hạn tối đa là 36 tháng' })
  months: number;

  @ApiPropertyOptional({
    description: 'Ghi chú hoặc yêu cầu từ khách hàng khi gia hạn',
    example: 'Gia hạn thêm 3 tháng đến hết quý',
  })
  @IsOptional()
  @IsString({ message: 'notes phải là chuỗi' })
  notes?: string;
}
