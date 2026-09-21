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
  RecordAccessLogDto,
  ResetAccessCodeDto,
  UpdateAccessStatusDto,
} from './dto/access-log.dto';
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

  // ==================== MÃ KHÓA & LỊCH SỬ RA VÀO ====================

  /**
   * Lấy mã PIN mở cửa ngăn kho (Khách hàng)
   */
  @Get(':contractId/units/:unitId/access-code')
  async getAccessCode(
    @Param('contractId', ParseIntPipe) contractId: number,
    @Param('unitId', ParseIntPipe) unitId: number,
    @CurrentUser() user: any,
  ) {
    return this.contractsService.getAccessCode(contractId, unitId, user.id);
  }

  /**
   * Đổi mã PIN mở cửa mới
   */
  @Post(':contractId/units/:unitId/access-code/reset')
  async resetAccessCode(
    @Param('contractId', ParseIntPipe) contractId: number,
    @Param('unitId', ParseIntPipe) unitId: number,
    @CurrentUser() user: any,
    @Body() dto: ResetAccessCodeDto,
  ) {
    return this.contractsService.resetAccessCode(contractId, unitId, user.id, dto);
  }

  /**
   * Ghi nhận sự kiện mở khóa kho (Public/IoT Gateway hoặc App)
   */
  @Public()
  @Post(':contractId/units/:unitId/access-logs')
  @HttpCode(HttpStatus.CREATED)
  async recordAccessLog(
    @Param('contractId', ParseIntPipe) contractId: number,
    @Param('unitId', ParseIntPipe) unitId: number,
    @Body() dto: RecordAccessLogDto,
  ) {
    return this.contractsService.recordAccessLog(contractId, unitId, dto);
  }

  /**
   * Xem lịch sử ra vào ngăn kho
   */
  @Get(':contractId/units/:unitId/access-logs')
  async getAccessLogs(
    @Param('contractId', ParseIntPipe) contractId: number,
    @Param('unitId', ParseIntPipe) unitId: number,
    @CurrentUser() user: any,
  ) {
    return this.contractsService.getAccessLogs(
      contractId,
      unitId,
      user.id,
      user.role,
    );
  }

  /**
   * Khóa/mở khóa mã mở cửa ngăn kho (Staff / Manager)
   */
  @Roles(
    UserRole.FACILITY_STAFF,
    UserRole.FACILITY_MANAGER,
    UserRole.BUSINESS_OPERATIONS_MANAGER,
    UserRole.SYSTEM_ADMINISTRATOR,
  )
  @Patch(':contractId/units/:unitId/access-status')
  async updateAccessStatus(
    @Param('contractId', ParseIntPipe) contractId: number,
    @Param('unitId', ParseIntPipe) unitId: number,
    @Body() dto: UpdateAccessStatusDto,
  ) {
    return this.contractsService.updateAccessStatus(contractId, unitId, dto);
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
