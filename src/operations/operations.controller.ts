import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
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
  ApiQuery,
} from '@nestjs/swagger';
import { OperationsService } from './operations.service';
import { CreatePolicyDto } from './dto/create-policy.dto';
import { CreateFeeTypeDto } from './dto/create-fee-type.dto';
import { CreateExtraChargeDto } from './dto/create-extra-charge.dto';
import { CreateDiscountDto } from './dto/create-discount.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { UserRole } from '../common/enums/role.enum';

@ApiTags('Operations & Business Rules')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('operations')
export class OperationsController {
  constructor(private readonly operationsService: OperationsService) {}

  // ==================== POLICIES ====================

  @ApiOperation({ summary: 'Xem danh sách chính sách vận hành (Cancellation, Refund, Storage, Insurance,...)' })
  @ApiQuery({ name: 'policyType', required: false, description: 'Loại chính sách (CANCELLATION, REFUND, ACCESS, FACILITY, PENALTY, GENERAL)' })
  @ApiQuery({ name: 'facilityId', required: false, description: 'Lọc theo cơ sở áp dụng' })
  @ApiResponse({ status: 200, description: 'Danh sách chính sách' })
  @Public()
  @Get('policies')
  async getPolicies(
    @Query('policyType') policyType?: string,
    @Query('facilityId') facilityId?: string,
  ) {
    return this.operationsService.getPolicies(
      policyType,
      facilityId ? parseInt(facilityId, 10) : undefined,
    );
  }

  @ApiOperation({ summary: 'Xem chi tiết một chính sách' })
  @ApiParam({ name: 'id', description: 'ID chính sách', example: 1 })
  @ApiResponse({ status: 200, description: 'Chi tiết chính sách' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy chính sách' })
  @Public()
  @Get('policies/:id')
  async getPolicyById(@Param('id', ParseIntPipe) id: number) {
    return this.operationsService.getPolicyById(id);
  }

  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Thiết lập chính sách vận hành mới (Operations Manager / Admin)' })
  @ApiResponse({ status: 201, description: 'Tạo chính sách thành công' })
  @Roles(UserRole.BUSINESS_OPERATIONS_MANAGER, UserRole.SYSTEM_ADMINISTRATOR)
  @Post('policies')
  @HttpCode(HttpStatus.CREATED)
  async createPolicy(@Body() dto: CreatePolicyDto) {
    return this.operationsService.createPolicy(dto);
  }

  // ==================== FEE TYPES & EXTRA CHARGES ====================

  @ApiOperation({ summary: 'Xem danh mục các loại phụ phí (Vệ sinh, quá giờ, hư hại...)' })
  @ApiResponse({ status: 200, description: 'Danh mục phụ phí' })
  @Public()
  @Get('fee-types')
  async getFeeTypes() {
    return this.operationsService.getFeeTypes();
  }

  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Tạo loại phụ phí mới (Operations Manager / Admin)' })
  @ApiResponse({ status: 201, description: 'Tạo loại phụ phí thành công' })
  @Roles(UserRole.BUSINESS_OPERATIONS_MANAGER, UserRole.SYSTEM_ADMINISTRATOR)
  @Post('fee-types')
  @HttpCode(HttpStatus.CREATED)
  async createFeeType(@Body() dto: CreateFeeTypeDto) {
    return this.operationsService.createFeeType(dto);
  }

  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Ghi nhận phụ thu phí phát sinh cho hợp đồng hoặc đơn đặt chỗ (Staff / Manager / Admin)' })
  @ApiResponse({ status: 201, description: 'Ghi nhận phụ thu thành công' })
  @Roles(
    UserRole.FACILITY_STAFF,
    UserRole.FACILITY_MANAGER,
    UserRole.BUSINESS_OPERATIONS_MANAGER,
    UserRole.SYSTEM_ADMINISTRATOR,
  )
  @Post('extra-charges')
  @HttpCode(HttpStatus.CREATED)
  async createExtraCharge(
    @CurrentUser() user: any,
    @Body() dto: CreateExtraChargeDto,
  ) {
    return this.operationsService.createExtraCharge(user.id, dto);
  }

  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Xem danh sách các khoản phụ thu phí' })
  @ApiQuery({ name: 'contractId', required: false, description: 'Lọc theo ID hợp đồng' })
  @ApiQuery({ name: 'reservationId', required: false, description: 'Lọc theo ID đơn đặt chỗ' })
  @ApiResponse({ status: 200, description: 'Danh sách phụ thu' })
  @Get('extra-charges')
  async getExtraCharges(
    @Query('contractId') contractId?: string,
    @Query('reservationId') reservationId?: string,
  ) {
    return this.operationsService.getExtraCharges(
      contractId ? parseInt(contractId, 10) : undefined,
      reservationId ? parseInt(reservationId, 10) : undefined,
    );
  }

  // ==================== DISCOUNTS ====================

  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Xem danh sách mã voucher / khuyến mãi (Operations Manager / Admin)' })
  @ApiResponse({ status: 200, description: 'Danh sách khuyến mãi' })
  @Roles(UserRole.BUSINESS_OPERATIONS_MANAGER, UserRole.SYSTEM_ADMINISTRATOR)
  @Get('discounts')
  async getDiscounts() {
    return this.operationsService.getDiscounts();
  }

  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Tạo mã voucher / chương trình khuyến mãi mới (Operations Manager / Admin)' })
  @ApiResponse({ status: 201, description: 'Tạo voucher thành công' })
  @Roles(UserRole.BUSINESS_OPERATIONS_MANAGER, UserRole.SYSTEM_ADMINISTRATOR)
  @Post('discounts')
  @HttpCode(HttpStatus.CREATED)
  async createDiscount(@Body() dto: CreateDiscountDto) {
    return this.operationsService.createDiscount(dto);
  }

  @ApiOperation({ summary: 'Kiểm tra tính hợp lệ và giá trị giảm giá của mã voucher' })
  @ApiParam({ name: 'code', description: 'Mã voucher (ví dụ: HELLO2026)', example: 'HELLO2026' })
  @ApiResponse({ status: 200, description: 'Thông tin voucher và trạng thái hợp lệ' })
  @ApiResponse({ status: 404, description: 'Mã voucher không tồn tại hoặc đã hết hạn' })
  @Public()
  @Get('discounts/validate/:code')
  async validateDiscountCode(@Param('code') code: string) {
    return this.operationsService.validateDiscountCode(code);
  }
}
