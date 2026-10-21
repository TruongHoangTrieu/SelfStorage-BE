import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { QueryNotificationDto } from './dto/query-notification.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Notifications')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @ApiOperation({ summary: 'Lấy danh sách thông báo của người dùng hiện tại (phân trang)' })
  @ApiResponse({ status: 200, description: 'Danh sách thông báo kèm số lượng chưa đọc' })
  @Get()
  async findAll(
    @CurrentUser() user: any,
    @Query() query: QueryNotificationDto,
  ) {
    return this.notificationsService.findAll(user.id, query);
  }

  @ApiOperation({ summary: 'Lấy số lượng thông báo chưa đọc' })
  @ApiResponse({ status: 200, description: 'Số lượng thông báo chưa đọc' })
  @Get('unread-count')
  async getUnreadCount(@CurrentUser() user: any) {
    const unreadCount = await this.notificationsService.getUnreadCount(user.id);
    return { unreadCount };
  }

  @ApiOperation({ summary: 'Đánh dấu tất cả thông báo là đã đọc' })
  @ApiResponse({ status: 200, description: 'Đã đánh dấu tất cả là đã đọc' })
  @Patch('read-all')
  async markAllAsRead(@CurrentUser() user: any) {
    return this.notificationsService.markAllAsRead(user.id);
  }

  @ApiOperation({ summary: 'Đánh dấu một thông báo là đã đọc' })
  @ApiParam({ name: 'id', description: 'ID thông báo' })
  @ApiResponse({ status: 200, description: 'Thông báo đã được cập nhật trạng thái' })
  @Patch(':id/read')
  async markAsRead(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    return this.notificationsService.markAsRead(user.id, id);
  }

  @ApiOperation({ summary: 'Xóa một thông báo' })
  @ApiParam({ name: 'id', description: 'ID thông báo' })
  @ApiResponse({ status: 200, description: 'Đã xóa thông báo thành công' })
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async delete(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    return this.notificationsService.delete(user.id, id);
  }
}
