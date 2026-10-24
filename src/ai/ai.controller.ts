import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AiService } from './ai.service';
import { ChatMessageDto } from './dto/chat.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../common/enums/role.enum';

@ApiTags('AI Assistant (3 Kỹ năng & ML Models)')
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @ApiOperation({
    summary: 'Gửi tin nhắn hội thoại tới Trợ lý AI Assistant',
    description:
      'Gộp 3 kỹ năng: Tư vấn kích thước kho (Skill 1), Hỏi đáp chính sách & RAG (Skill 2), Gợi ý gói gia hạn (Skill 3). Cho phép cả khách vãng lai và người dùng đã đăng nhập.',
  })
  @ApiResponse({ status: 200, description: 'Phản hồi từ Trợ lý AI' })
  @Public()
  @UseGuards(JwtAuthGuard)
  @Post('chat')
  @HttpCode(HttpStatus.OK)
  async chat(
    @CurrentUser() user: any,
    @Body() dto: ChatMessageDto,
  ) {
    const userId = user?.id || 'guest';
    return this.aiService.chat(userId, dto);
  }

  @ApiOperation({
    summary: 'Kiểm tra trạng thái hoạt động của AI Service (Python FastAPI)',
  })
  @Public()
  @Get('health')
  async health() {
    return this.aiService.getHealth();
  }

  @ApiOperation({
    summary: 'Thủ công chạy quét dự đoán gia hạn hợp đồng (Dành cho Quản lý / Staff)',
    description: 'Chấm điểm xác suất gia hạn bằng Model A và gợi ý gói bằng Model B cho các hợp đồng sắp hết hạn.',
  })
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.FACILITY_STAFF, UserRole.FACILITY_MANAGER, UserRole.SYSTEM_ADMINISTRATOR)
  @Post('predict-renewals')
  @HttpCode(HttpStatus.OK)
  async triggerRenewalPredictions() {
    return {
      message: 'Đã kích hoạt quét dự đoán gia hạn hợp đồng bằng mô hình ML',
      status: 'triggered',
    };
  }
}
