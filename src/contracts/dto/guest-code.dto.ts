import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateGuestCodeDto {
  @ApiProperty({ description: 'Tên khách hoặc người nhận mã', example: 'Lê Văn Hùng' })
  @IsString()
  @IsNotEmpty({ message: 'Tên khách không được để trống' })
  guestName: string;

  @ApiProperty({ description: 'Mã PIN 6 số của khách', example: '718293' })
  @IsString()
  @Matches(/^\d{4,8}$/, { message: 'Mã PIN khách phải là từ 4 đến 8 chữ số' })
  pinCode: string;

  @ApiProperty({ description: 'Thời hạn sử dụng: 2h, 24h, 3d', example: '24h' })
  @IsString()
  durationOption: '2h' | '24h' | '3d';

  @ApiProperty({ description: 'Loại sử dụng: one_time hoặc multi_time', example: 'multi_time', required: false })
  @IsOptional()
  @IsString()
  usageType?: string;

  @ApiProperty({ description: 'Mục đích ủy quyền mở kho', example: 'Vận chuyển đồ đạc', required: false })
  @IsOptional()
  @IsString()
  purpose?: string;
}
