import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { RenewalStatus } from '@prisma/client';

export class FilterRenewalDto {
  @ApiPropertyOptional({
    description: 'Số trang',
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Số bản ghi trên mỗi trang',
    default: 10,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 10;

  @ApiPropertyOptional({
    description: 'Lọc theo trạng thái yêu cầu gia hạn',
    enum: RenewalStatus,
  })
  @IsOptional()
  @IsEnum(RenewalStatus)
  status?: RenewalStatus;

  @ApiPropertyOptional({
    description: 'Lọc theo ID hợp đồng',
  })
  @IsOptional()
  @IsString()
  contractId?: string;

  @ApiPropertyOptional({
    description: 'Lọc theo ID cơ sở kho',
  })
  @IsOptional()
  @IsString()
  facilityId?: string;
}
