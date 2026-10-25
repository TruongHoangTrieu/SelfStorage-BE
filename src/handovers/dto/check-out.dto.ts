import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsArray,
  IsBoolean,
  IsNumber,
  IsEnum,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StorageUnitStatus } from '@prisma/client';

export class CheckOutDto {
  @ApiProperty({
    description: 'ID của hợp đồng thuê kho cần trả',
    example: '671234567890abcdef123456',
  })
  @IsString({ message: 'contractId must be a string' })
  @IsNotEmpty({ message: 'contractId is required' })
  contractId: string;

  @ApiProperty({
    description: 'Tình trạng hiện trạng của ngăn kho lúc hoàn trả',
    example: 'Kho đã dọn sạch, tường và sàn nguyên vẹn không trầy xước',
  })
  @IsString({ message: 'condition must be a string' })
  @IsNotEmpty({ message: 'condition is required (e.g. Unit is clean and undamaged)' })
  condition: string;

  @ApiPropertyOptional({
    description: 'Ghi chú thêm về biên bản bàn giao trả kho',
    example: 'Khách hàng bàn giao đúng hạn, đã kiểm tra đầy đủ',
  })
  @IsOptional()
  @IsString({ message: 'notes must be a string' })
  notes?: string;

  @ApiPropertyOptional({
    description: 'Danh sách URL ảnh chụp hiện trạng ngăn kho lúc trả',
    example: [
      'https://res.cloudinary.com/selfstorage/image/upload/v1234567/handovers/checkout_1.jpg',
    ],
  })
  @IsOptional()
  @IsArray({ message: 'photos must be an array of photo URLs' })
  photos?: any[];

  @ApiPropertyOptional({
    description: 'Phí bồi thường hư hỏng trang thiết bị kho nếu có (VND)',
    example: 0,
    default: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'damageFee must be a number' })
  @Min(0, { message: 'damageFee must be greater than or equal to 0' })
  damageFee?: number;

  @ApiPropertyOptional({
    description: 'Phí vệ sinh thu gom rác nếu khách để lại đồ thừa (VND)',
    example: 0,
    default: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'cleaningFee must be a number' })
  @Min(0, { message: 'cleaningFee must be greater than or equal to 0' })
  cleaningFee?: number;

  @ApiPropertyOptional({
    description: 'Có thực hiện hoàn trả tiền cọc cho khách hay không',
    default: true,
  })
  @IsOptional()
  @IsBoolean({ message: 'refundDeposit must be a boolean' })
  refundDeposit?: boolean;

  @ApiPropertyOptional({
    description: 'Số tiền cọc hoàn lại thực tế (nếu không nhập sẽ tự động tính = cọc - phí phạt - nợ phụ phí)',
    example: 1000000,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'refundAmount must be a number' })
  @Min(0, { message: 'refundAmount must be greater than or equal to 0' })
  refundAmount?: number;

  @ApiPropertyOptional({
    description: 'Trạng thái kho sau khi trả (AVAILABLE hoặc UNDER_MAINTENANCE nếu kho bị hỏng nặng)',
    enum: StorageUnitStatus,
    default: StorageUnitStatus.AVAILABLE,
  })
  @IsOptional()
  @IsEnum(StorageUnitStatus, {
    message: 'unitCondition must be AVAILABLE or UNDER_MAINTENANCE',
  })
  unitCondition?: StorageUnitStatus;
}
