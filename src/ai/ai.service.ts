import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { ChatMessageDto } from './dto/chat.dto';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly aiServiceUrl: string;
  private readonly internalKey: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.aiServiceUrl =
      this.configService.get<string>('AI_SERVICE_URL') || 'http://localhost:8000';
    this.internalKey =
      this.configService.get<string>('AI_INTERNAL_KEY') || 'change_me_internal_key';
  }

  /**
   * Chuyển tiếp tin nhắn của khách hàng tới AI Service (Python FastAPI)
   */
  async chat(userId: string, dto: ChatMessageDto) {
    const payload = {
      conversation_id: dto.conversationId || `conv_${userId}_${Date.now()}`,
      user_id: userId,
      message: dto.message,
      history: dto.history || [],
      facility_id: dto.facilityId || null,
    };

    try {
      const response = await fetch(`${this.aiServiceUrl}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-key': this.internalKey,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000), // Timeout 15s
      });

      if (!response.ok) {
        throw new Error(`AI Service returned status ${response.status}`);
      }

      return await response.json();
    } catch (error: any) {
      this.logger.error(`Lỗi khi gọi AI Service: ${error.message}`);
      // Fallback thân thiện bảo vệ hệ thống không bị crash
      return {
        conversation_id: payload.conversation_id,
        intent: 'fallback',
        reply:
          'Trợ lý AI hiện đang bận hoặc đang bảo trì. Vui lòng thử lại sau giây lát hoặc gửi Ticket hỗ trợ cho nhân viên chăm sóc khách hàng nhé!',
        data: {},
        sources: [],
        model_version: 'fallback',
      };
    }
  }

  /**
   * Gọi AI Service chấm điểm gia hạn và gói đề xuất cho danh sách hợp đồng
   */
  async predictRenewalsBatch(contracts: any[]) {
    try {
      const response = await fetch(`${this.aiServiceUrl}/predict/renewal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-key': this.internalKey,
        },
        body: JSON.stringify({ contracts }),
        signal: AbortSignal.timeout(20000),
      });

      if (!response.ok) {
        throw new Error(`AI Service predict failed with status ${response.status}`);
      }

      return await response.json();
    } catch (error: any) {
      this.logger.error(`Lỗi chạy dự đoán gia hạn batch: ${error.message}`);
      return [];
    }
  }

  /**
   * Kiểm tra tình trạng kết nối AI Service
   */
  async getHealth() {
    try {
      const response = await fetch(`${this.aiServiceUrl}/health`, {
        signal: AbortSignal.timeout(3000),
      });
      return await response.json();
    } catch (error: any) {
      return { status: 'down', error: error.message };
    }
  }
}
