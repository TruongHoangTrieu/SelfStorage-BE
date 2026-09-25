import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Headers,
  UseGuards,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiHeader,
} from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { CreateDepositPaymentDto } from './dto/create-payment.dto';
import { CreateRentalPaymentDto } from './dto/create-rental-payment.dto';
import { SePayWebhookDto } from './dto/sepay-webhook.dto';
import { FilterPaymentDto } from './dto/filter-payment.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { UserRole } from '../common/enums/role.enum';

@ApiTags('Payments & SePay Integration')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  // ==================== FLOW 1: DEPOSIT PAYMENT ====================

  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Tạo thanh toán tiền cọc cho đơn đặt chỗ kho (Flow 1: Deposit Payment)',
    description:
      'Tạo bản ghi thanh toán DEPOSIT, sinh mã thanh toán duy nhất SSDEP... và trả về thông tin VietQR để khách hàng quét mã chuyển khoản qua SePay.',
  })
  @ApiResponse({
    status: 201,
    description: 'Tạo thanh toán cọc thành công, trả về thông tin thanh toán và mã QR VietQR',
  })
  @ApiResponse({ status: 400, description: 'Đơn đặt chỗ không hợp lệ hoặc đã hoàn tất/hủy' })
  @ApiResponse({ status: 409, description: 'Tiền cọc của đơn đặt chỗ này đã được thanh toán' })
  @Post('deposit')
  @HttpCode(HttpStatus.CREATED)
  async createDepositPayment(
    @CurrentUser() user: any,
    @Body() dto: CreateDepositPaymentDto,
  ) {
    const userRole = typeof user.role === 'string' ? user.role : user.role?.name;
    return this.paymentsService.createDepositPayment(user.id, dto, userRole);
  }

  // ==================== FLOW 2: CHECK-IN PAYMENT SUMMARY & RENTAL PAYMENT ====================

  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Tra cứu tổng hợp tình trạng thanh toán của đơn đặt chỗ (Flow 2: Payment Summary)',
    description:
      'Kiểm tra tiền cọc đã đóng hay chưa (Deposit Paid), tính toán số tiền thuê còn lại cần thu (Remaining Rental Amount) để chuẩn bị Check-in / Bàn giao.',
  })
  @ApiParam({ name: 'reservationId', description: 'ID đơn đặt chỗ', example: 1 })
  @ApiResponse({ status: 200, description: 'Thông tin tổng hợp thanh toán' })
  @Get('reservations/:reservationId/summary')
  async getReservationPaymentSummary(
    @Param('reservationId', ParseIntPipe) reservationId: number,
    @CurrentUser() user: any,
  ) {
    const userRole = typeof user.role === 'string' ? user.role : user.role?.name;
    return this.paymentsService.getReservationPaymentSummary(
      reservationId,
      user.id,
      userRole,
    );
  }

  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Tạo thanh toán tiền thuê cho giai đoạn Check-in (Flow 2: Rental Payment)',
    description:
      'Tạo bản ghi thanh toán RENTAL cho số tiền thuê còn lại mà không thu trùng tiền cọc đã đóng ở Flow 1.',
  })
  @ApiResponse({ status: 201, description: 'Tạo thanh toán tiền thuê thành công' })
  @ApiResponse({ status: 409, description: 'Tiền thuê của đơn này đã được thanh toán' })
  @Post('rental')
  @HttpCode(HttpStatus.CREATED)
  async createRentalPayment(
    @CurrentUser() user: any,
    @Body() dto: CreateRentalPaymentDto,
  ) {
    const userRole = typeof user.role === 'string' ? user.role : user.role?.name;
    return this.paymentsService.createRentalPayment(user.id, dto, userRole);
  }

  // ==================== SEPAY WEBHOOK ====================

  @Public()
  @ApiOperation({
    summary: 'Webhook tiếp nhận thông báo biến động số dư từ SePay (Tự động xác nhận thanh toán)',
    description:
      'Endpoint công khai dành riêng cho SePay gọi khi có giao dịch chuyển khoản ngân hàng thành công. Xác thực API Key, đối soát mã thanh toán, kiểm tra số tiền và cập nhật trạng thái đơn đặt chỗ (Reservation -> CONFIRMED) nguyên tử & an toàn chống trùng lặp (Idempotent).',
  })
  @ApiHeader({
    name: 'Authorization',
    required: false,
    description: 'SePay API Key (Apikey <SEPAY_API_KEY> hoặc Bearer <SEPAY_API_KEY>)',
  })
  @ApiResponse({ status: 200, description: 'Webhook xử lý thành công hoặc bỏ qua trùng lặp an toàn' })
  @ApiResponse({ status: 401, description: 'Xác thực SePay webhook thất bại' })
  @Post('sepay/webhook')
  @HttpCode(HttpStatus.OK)
  async handleSePayWebhook(
    @Body() payload: SePayWebhookDto,
    @Headers('authorization') authHeader?: string,
  ) {
    return this.paymentsService.handleSePayWebhook(payload, authHeader);
  }

  // ==================== LIST & DETAIL PAYMENTS ====================

  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Lấy danh sách các giao dịch thanh toán (Khách hàng xem của mình, Staff/Admin xem toàn bộ)',
  })
  @ApiResponse({ status: 200, description: 'Danh sách thanh toán phân trang' })
  @Get()
  async findAll(
    @CurrentUser() user: any,
    @Query() filterDto: FilterPaymentDto,
  ) {
    return this.paymentsService.findAll(filterDto, user);
  }

  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Xem chi tiết một giao dịch thanh toán theo ID' })
  @ApiParam({ name: 'id', description: 'ID giao dịch thanh toán', example: 1 })
  @ApiResponse({ status: 200, description: 'Chi tiết giao dịch thanh toán' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy giao dịch thanh toán' })
  @Get(':id')
  async findById(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ) {
    return this.paymentsService.findById(id, user);
  }
}
