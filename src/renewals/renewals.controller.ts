import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
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
  ApiQuery,
} from '@nestjs/swagger';
import { RenewalsService } from './renewals.service';
import { RequestRenewalDto } from './dto/request-renewal.dto';
import {
  ApproveRenewalDto,
  RejectRenewalDto,
} from './dto/approve-renewal.dto';
import { FilterRenewalDto } from './dto/filter-renewal.dto';
import {
  FilterOverdueDto,
  ResolveOverdueDto,
} from './dto/filter-overdue.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../common/enums/role.enum';

@ApiTags('Renewals & Overdue Handling (Flow 6)')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('renewals')
export class RenewalsController {
  constructor(private readonly renewalsService: RenewalsService) {}

  // ==================== 1. GIA HẠN HỢP ĐỒNG (CONTRACT RENEWALS) ====================

  @ApiOperation({
    summary: 'Gửi yêu cầu gia hạn hợp đồng thuê kho (Khách hàng hoặc Nhân viên)',
    description:
      'Tính toán số tiền gia hạn dựa trên đơn giá thuê hàng tháng và chính sách chiết khấu kỳ hạn, tạo bản ghi yêu cầu gia hạn PENDING.',
  })
  @ApiResponse({ status: 201, description: 'Gửi yêu cầu gia hạn thành công' })
  @ApiResponse({ status: 400, description: 'Hợp đồng không ở trạng thái được phép gia hạn' })
  @ApiResponse({ status: 409, description: 'Đang có một yêu cầu gia hạn khác chờ xử lý' })
  @Post('request')
  @HttpCode(HttpStatus.CREATED)
  async requestRenewal(
    @CurrentUser() user: any,
    @Body() dto: RequestRenewalDto,
  ) {
    const userRole = typeof user.role === 'string' ? user.role : user.role?.name;
    return this.renewalsService.requestRenewal(user.id, userRole, dto);
  }

  @ApiOperation({
    summary: 'Danh sách các yêu cầu gia hạn (Customer xem của mình, Staff/Manager xem theo cơ sở/toàn bộ)',
  })
  @ApiResponse({ status: 200, description: 'Danh sách yêu cầu gia hạn phân trang' })
  @Get()
  async getRenewals(
    @CurrentUser() user: any,
    @Query() filterDto: FilterRenewalDto,
  ) {
    return this.renewalsService.getRenewals(user, filterDto);
  }

  @ApiOperation({ summary: 'Xem chi tiết một yêu cầu gia hạn' })
  @ApiParam({ name: 'id', description: 'ID yêu cầu gia hạn' })
  @ApiResponse({ status: 200, description: 'Chi tiết yêu cầu gia hạn' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy yêu cầu gia hạn' })
  @Get(':id')
  async getRenewalById(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    return this.renewalsService.getRenewalById(id, user);
  }

  @ApiOperation({ summary: 'Khách hàng hủy yêu cầu gia hạn (khi đang ở trạng thái PENDING)' })
  @ApiParam({ name: 'id', description: 'ID yêu cầu gia hạn' })
  @ApiResponse({ status: 200, description: 'Hủy yêu cầu gia hạn thành công' })
  @Patch(':id/cancel')
  async cancelRenewal(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    return this.renewalsService.cancelRenewal(id, user);
  }

  @ApiOperation({
    summary: 'Phê duyệt gia hạn hợp đồng (Staff / Manager / Admin)',
    description:
      'Cập nhật ngày kết thúc mới cho hợp đồng, chuyển trạng thái hợp đồng sang ACTIVE, tự động mở khóa mã PIN ổ khóa thông minh nếu trước đó bị quá hạn.',
  })
  @ApiParam({ name: 'id', description: 'ID yêu cầu gia hạn' })
  @ApiResponse({ status: 200, description: 'Phê duyệt gia hạn thành công' })
  @Roles(
    UserRole.FACILITY_STAFF,
    UserRole.FACILITY_MANAGER,
    UserRole.BUSINESS_OPERATIONS_MANAGER,
    UserRole.SYSTEM_ADMINISTRATOR,
  )
  @Patch(':id/approve')
  async approveRenewal(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() dto: ApproveRenewalDto,
  ) {
    return this.renewalsService.approveRenewal(id, user, dto);
  }

  @ApiOperation({ summary: 'Từ chối yêu cầu gia hạn (Staff / Manager / Admin)' })
  @ApiParam({ name: 'id', description: 'ID yêu cầu gia hạn' })
  @ApiResponse({ status: 200, description: 'Từ chối yêu cầu gia hạn thành công' })
  @Roles(
    UserRole.FACILITY_STAFF,
    UserRole.FACILITY_MANAGER,
    UserRole.BUSINESS_OPERATIONS_MANAGER,
    UserRole.SYSTEM_ADMINISTRATOR,
  )
  @Patch(':id/reject')
  async rejectRenewal(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() dto: RejectRenewalDto,
  ) {
    return this.renewalsService.rejectRenewal(id, user, dto);
  }

  // ==================== 2. QUẢN LÝ QUÁ HẠN & CRON JOB (OVERDUE HANDLING) ====================

  @ApiOperation({
    summary: 'Kích hoạt quét hợp đồng quá hạn thủ công ngay lập tức (Manager / Admin / Staff)',
    description:
      'Chạy quy trình quét tương tự Cron Job: Kiểm tra hợp đồng hết hạn, chuyển sang OVERDUE, tự động khóa mã PIN ổ khóa và tính toán phí phạt trễ hạn.',
  })
  @ApiResponse({ status: 200, description: 'Kết quả quét và xử lý quá hạn' })
  @Roles(
    UserRole.FACILITY_STAFF,
    UserRole.FACILITY_MANAGER,
    UserRole.BUSINESS_OPERATIONS_MANAGER,
    UserRole.SYSTEM_ADMINISTRATOR,
  )
  @Post('overdue/scan')
  @HttpCode(HttpStatus.OK)
  async scanOverdue() {
    return this.renewalsService.scanAndProcessOverdueContracts();
  }

  @ApiOperation({
    summary: 'Danh sách các bản ghi quá hạn & tiền phạt (Staff / Manager / Admin)',
  })
  @ApiResponse({ status: 200, description: 'Danh sách bản ghi quá hạn phân trang' })
  @Roles(
    UserRole.FACILITY_STAFF,
    UserRole.FACILITY_MANAGER,
    UserRole.BUSINESS_OPERATIONS_MANAGER,
    UserRole.SYSTEM_ADMINISTRATOR,
  )
  @Get('overdue/records')
  async getOverdueRecords(
    @CurrentUser() user: any,
    @Query() filterDto: FilterOverdueDto,
  ) {
    return this.renewalsService.getOverdueRecords(user, filterDto);
  }

  @ApiOperation({
    summary: 'Giải quyết tình trạng quá hạn (RESOLVED) và khôi phục quyền truy cập kho',
    description:
      'Ghi nhận đã thu phí phạt trễ hạn, khôi phục mã PIN truy cập smart lock và tùy chọn gia hạn thêm hợp đồng.',
  })
  @ApiParam({ name: 'id', description: 'ID bản ghi quá hạn' })
  @ApiResponse({ status: 200, description: 'Giải quyết quá hạn thành công' })
  @Roles(
    UserRole.FACILITY_STAFF,
    UserRole.FACILITY_MANAGER,
    UserRole.BUSINESS_OPERATIONS_MANAGER,
    UserRole.SYSTEM_ADMINISTRATOR,
  )
  @Patch('overdue/records/:id/resolve')
  async resolveOverdue(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() dto: ResolveOverdueDto,
  ) {
    return this.renewalsService.resolveOverdue(id, user, dto);
  }

  @ApiOperation({
    summary: 'Miễn giảm phí phạt quá hạn (WAIVED) cho khách hàng (Manager / Admin)',
  })
  @ApiParam({ name: 'id', description: 'ID bản ghi quá hạn' })
  @ApiResponse({ status: 200, description: 'Miễn giảm phí phạt thành công' })
  @Roles(
    UserRole.FACILITY_MANAGER,
    UserRole.BUSINESS_OPERATIONS_MANAGER,
    UserRole.SYSTEM_ADMINISTRATOR,
  )
  @Patch('overdue/records/:id/waive')
  async waiveOverdue(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body('notes') notes?: string,
  ) {
    return this.renewalsService.waiveOverdue(id, user, notes);
  }
}
