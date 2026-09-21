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

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('operations')
export class OperationsController {
  constructor(private readonly operationsService: OperationsService) {}

  // ==================== POLICIES ====================

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

  @Public()
  @Get('policies/:id')
  async getPolicyById(@Param('id', ParseIntPipe) id: number) {
    return this.operationsService.getPolicyById(id);
  }

  @Roles(UserRole.BUSINESS_OPERATIONS_MANAGER, UserRole.SYSTEM_ADMINISTRATOR)
  @Post('policies')
  @HttpCode(HttpStatus.CREATED)
  async createPolicy(@Body() dto: CreatePolicyDto) {
    return this.operationsService.createPolicy(dto);
  }

  // ==================== FEE TYPES & EXTRA CHARGES ====================

  @Public()
  @Get('fee-types')
  async getFeeTypes() {
    return this.operationsService.getFeeTypes();
  }

  @Roles(UserRole.BUSINESS_OPERATIONS_MANAGER, UserRole.SYSTEM_ADMINISTRATOR)
  @Post('fee-types')
  @HttpCode(HttpStatus.CREATED)
  async createFeeType(@Body() dto: CreateFeeTypeDto) {
    return this.operationsService.createFeeType(dto);
  }

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

  @Roles(UserRole.BUSINESS_OPERATIONS_MANAGER, UserRole.SYSTEM_ADMINISTRATOR)
  @Get('discounts')
  async getDiscounts() {
    return this.operationsService.getDiscounts();
  }

  @Roles(UserRole.BUSINESS_OPERATIONS_MANAGER, UserRole.SYSTEM_ADMINISTRATOR)
  @Post('discounts')
  @HttpCode(HttpStatus.CREATED)
  async createDiscount(@Body() dto: CreateDiscountDto) {
    return this.operationsService.createDiscount(dto);
  }

  @Get('discounts/validate/:code')
  async validateDiscountCode(@Param('code') code: string) {
    return this.operationsService.validateDiscountCode(code);
  }
}
