import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class ChatMessageDto {
  @ApiProperty({
    description: 'Nội dung tin nhắn gửi tới Trợ lý AI',
    example: 'Mình có 1 tủ lạnh, 20 thùng carton và 1 xe máy, nên thuê kho cỡ nào?',
  })
  @IsString({ message: 'message phải là chuỗi' })
  @IsNotEmpty({ message: 'message không được để trống' })
  @MaxLength(1000, { message: 'Tin nhắn tối đa 1000 ký tự' })
  message: string;

  @ApiPropertyOptional({
    description: 'ID cuộc trò chuyện (để lưu ngữ cảnh nhiều lượt)',
    example: 'conv_123456',
  })
  @IsOptional()
  @IsString()
  conversationId?: string;

  @ApiPropertyOptional({
    description: 'Lịch sử hội thoại trước đó (tối đa 6 lượt gần nhất)',
    example: [{ role: 'user', content: 'Chào bạn' }, { role: 'assistant', content: 'Xin chào! Tôi có thể giúp gì cho bạn?' }],
  })
  @IsOptional()
  @IsArray()
  history?: Array<{ role: string; content: string }>;

  @ApiPropertyOptional({
    description: 'Mã hoặc ID cơ sở kho người dùng đang quan tâm (tùy chọn)',
    example: '6ac4ea732f3017f8106ae7a6',
  })
  @IsOptional()
  @IsString()
  facilityId?: string;
}
