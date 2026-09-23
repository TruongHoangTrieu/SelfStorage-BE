import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ContractsService } from './contracts.service';
import {
  CreateStoredItemDto,
  UpdateStoredItemDto,
} from './dto/stored-item.dto';
import {
  ChangeSmartLockPinDto,
  ResetSmartLockPinDto,
  UpdateSmartLockStatusDto,
} from './dto/smart-lock.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { UserRole } from '../common/enums/role.enum';
import { ContractStatus } from '@prisma/client';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('contracts')
export class ContractsController {
  constructor(private readonly contractsService: ContractsService) {}

  /**
   * Khách hàng xem danh sách hợp đồng & ngăn kho đang thuê của mình
   */
  @Roles(UserRole.STORAGE_CUSTOMER)
  @Get('my-contracts')
  async getMyContracts(@CurrentUser() user: any) {
    return this.contractsService.getMyContracts(user.id);
  }

  /**
   * Quản lý/Nhân viên tra cứu danh sách hợp đồng
   */
  @Roles(
    UserRole.FACILITY_STAFF,
    UserRole.FACILITY_MANAGER,
    UserRole.BUSINESS_OPERATIONS_MANAGER,
    UserRole.SYSTEM_ADMINISTRATOR,
  )
  @Get()
  async getContracts(
    @Query('facilityId') facilityId?: string,
    @Query('status') status?: ContractStatus,
  ) {
    return this.contractsService.getContracts(
      facilityId ? parseInt(facilityId, 10) : undefined,
      status,
    );
  }

  /**
   * Xem chi tiết hợp đồng
   */
  @Get(':id')
  async getContractById(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ) {
    return this.contractsService.getContractById(id, user.id, user.role);
  }

  /**
   * Ký điện tử hợp đồng
   */
  @Patch(':id/sign')
  async signContract(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ) {
    return this.contractsService.signContract(id, user.id);
  }

  /**
   * Thanh lý / Chấm dứt hợp đồng
   */
  @Roles(
    UserRole.FACILITY_MANAGER,
    UserRole.BUSINESS_OPERATIONS_MANAGER,
    UserRole.SYSTEM_ADMINISTRATOR,
  )
  @Patch(':id/terminate')
  async terminateContract(@Param('id', ParseIntPipe) id: number) {
    return this.contractsService.terminateContract(id);
  }

  // ==================== KHÓA THÔNG MINH CĂN HỘ (SMART DIGITAL LOCK) ====================

  /**
   * Lấy thông tin ổ khóa điện tử và mã PIN mở cửa ngăn kho
   * GET /contracts/:contractId/units/:unitId/smart-lock
   */
  @Get(':contractId/units/:unitId/smart-lock')
  async getSmartLockInfo(
    @Param('contractId', ParseIntPipe) contractId: number,
    @Param('unitId', ParseIntPipe) unitId: number,
    @CurrentUser() user: any,
  ) {
    return this.contractsService.getSmartLockInfo(
      contractId,
      unitId,
      user.id,
      user.role,
    );
  }

  /**
   * Khách hàng tự đổi mã PIN của ổ khóa thông minh
   * POST /contracts/:contractId/units/:unitId/smart-lock/change-pin
   */
  @Post(':contractId/units/:unitId/smart-lock/change-pin')
  async changeSmartLockPin(
    @Param('contractId', ParseIntPipe) contractId: number,
    @Param('unitId', ParseIntPipe) unitId: number,
    @CurrentUser() user: any,
    @Body() dto: ChangeSmartLockPinDto,
  ) {
    return this.contractsService.changeSmartLockPin(
      contractId,
      unitId,
      user.id,
      dto,
    );
  }

  /**
   * Đặt lại mã PIN ngẫu nhiên hoặc chỉ định (Master Reset PIN dành cho Staff/Manager/Admin)
   * POST /contracts/:contractId/units/:unitId/smart-lock/reset-pin
   */
  @Roles(
    UserRole.FACILITY_STAFF,
    UserRole.FACILITY_MANAGER,
    UserRole.BUSINESS_OPERATIONS_MANAGER,
    UserRole.SYSTEM_ADMINISTRATOR,
  )
  @Post(':contractId/units/:unitId/smart-lock/reset-pin')
  async resetSmartLockPin(
    @Param('contractId', ParseIntPipe) contractId: number,
    @Param('unitId', ParseIntPipe) unitId: number,
    @Body() dto: ResetSmartLockPinDto,
  ) {
    return this.contractsService.resetSmartLockPin(contractId, unitId, dto);
  }

  /**
   * Khóa/mở khóa trạng thái mã PIN của ngăn kho (Staff / Manager / Admin)
   * PATCH /contracts/:contractId/units/:unitId/smart-lock/status
   */
  @Roles(
    UserRole.FACILITY_STAFF,
    UserRole.FACILITY_MANAGER,
    UserRole.BUSINESS_OPERATIONS_MANAGER,
    UserRole.SYSTEM_ADMINISTRATOR,
  )
  @Patch(':contractId/units/:unitId/smart-lock/status')
  async updateSmartLockStatus(
    @Param('contractId', ParseIntPipe) contractId: number,
    @Param('unitId', ParseIntPipe) unitId: number,
    @Body() dto: UpdateSmartLockStatusDto,
  ) {
    return this.contractsService.updateSmartLockStatus(
      contractId,
      unitId,
      dto,
    );
  }

  // ==================== DANH MỤC LƯU TRỮ (STORED ITEMS) ====================

  /**
   * Lấy danh sách đồ đạc đang cất trong kho
   */
  @Get(':contractId/units/:unitId/items')
  async getStoredItems(
    @Param('contractId', ParseIntPipe) contractId: number,
    @Param('unitId', ParseIntPipe) unitId: number,
    @CurrentUser() user: any,
  ) {
    return this.contractsService.getStoredItems(
      contractId,
      unitId,
      user.id,
      user.role,
    );
  }

  /**
   * Thêm món đồ mới vào kho
   */
  @Post(':contractId/units/:unitId/items')
  @HttpCode(HttpStatus.CREATED)
  async createStoredItem(
    @Param('contractId', ParseIntPipe) contractId: number,
    @Param('unitId', ParseIntPipe) unitId: number,
    @CurrentUser() user: any,
    @Body() dto: CreateStoredItemDto,
  ) {
    return this.contractsService.createStoredItem(
      contractId,
      unitId,
      user.id,
      user.role,
      dto,
    );
  }

  /**
   * Chỉnh sửa thông tin đồ đạc
   */
  @Patch('items/:itemId')
  async updateStoredItem(
    @Param('itemId', ParseIntPipe) itemId: number,
    @CurrentUser() user: any,
    @Body() dto: UpdateStoredItemDto,
  ) {
    return this.contractsService.updateStoredItem(
      itemId,
      user.id,
      user.role,
      dto,
    );
  }

  /**
   * Xóa món đồ khỏi kho
   */
  @Delete('items/:itemId')
  async deleteStoredItem(
    @Param('itemId', ParseIntPipe) itemId: number,
    @CurrentUser() user: any,
  ) {
    return this.contractsService.deleteStoredItem(itemId, user.id, user.role);
  }
}
