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
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
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

@ApiTags('Contracts & Storage Management')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('contracts')
export class ContractsController {
  constructor(private readonly contractsService: ContractsService) {}

  @ApiOperation({ summary: 'Khách hàng xem danh sách hợp đồng & ngăn kho đang thuê của mình' })
  @ApiResponse({ status: 200, description: 'Danh sách hợp đồng đang thuê của khách hàng' })
  @Roles(UserRole.STORAGE_CUSTOMER)
  @Get('my-contracts')
  async getMyContracts(@CurrentUser() user: any) {
    return this.contractsService.getMyContracts(user.id);
  }

  @ApiOperation({ summary: 'Quản lý / Nhân viên tra cứu danh sách hợp đồng' })
  @ApiQuery({ name: 'facilityId', required: false, description: 'Lọc theo cơ sở kho' })
  @ApiQuery({ name: 'status', required: false, enum: ContractStatus, description: 'Lọc theo trạng thái hợp đồng (ACTIVE, TERMINATED, EXPIRED)' })
  @ApiResponse({ status: 200, description: 'Danh sách hợp đồng' })
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

  @ApiOperation({ summary: 'Xem chi tiết hợp đồng thuê' })
  @ApiParam({ name: 'id', description: 'ID hợp đồng', example: 1 })
  @ApiResponse({ status: 200, description: 'Chi tiết hợp đồng, danh sách ngăn kho và đồ đạc' })
  @ApiResponse({ status: 403, description: 'Không có quyền truy cập hợp đồng của người khác' })
  @Get(':id')
  async getContractById(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ) {
    return this.contractsService.getContractById(id, user.id, user.role);
  }

  @ApiOperation({ summary: 'Khách hàng ký điện tử xác nhận hợp đồng' })
  @ApiParam({ name: 'id', description: 'ID hợp đồng', example: 1 })
  @ApiResponse({ status: 200, description: 'Ký hợp đồng thành công' })
  @Patch(':id/sign')
  async signContract(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ) {
    return this.contractsService.signContract(id, user.id);
  }

  @ApiOperation({ summary: 'Thanh lý / Chấm dứt hợp đồng và giải phóng ngăn kho (Manager / Admin)' })
  @ApiParam({ name: 'id', description: 'ID hợp đồng', example: 1 })
  @ApiResponse({ status: 200, description: 'Thanh lý hợp đồng thành công' })
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

  @ApiOperation({ summary: 'Lấy thông tin ổ khóa điện tử và mã PIN mở cửa ngăn kho' })
  @ApiParam({ name: 'contractId', description: 'ID hợp đồng', example: 1 })
  @ApiParam({ name: 'unitId', description: 'ID ngăn kho', example: 1 })
  @ApiResponse({ status: 200, description: 'Thông tin khóa và mã PIN' })
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

  @ApiOperation({ summary: 'Khách hàng tự đổi mã PIN của ổ khóa thông minh (4-8 chữ số)' })
  @ApiParam({ name: 'contractId', description: 'ID hợp đồng', example: 1 })
  @ApiParam({ name: 'unitId', description: 'ID ngăn kho', example: 1 })
  @ApiResponse({ status: 200, description: 'Đổi mã PIN thành công' })
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

  @ApiOperation({ summary: 'Đặt lại mã PIN ngẫu nhiên hoặc chỉ định - Master Reset PIN (Staff / Manager / Admin)' })
  @ApiParam({ name: 'contractId', description: 'ID hợp đồng', example: 1 })
  @ApiParam({ name: 'unitId', description: 'ID ngăn kho', example: 1 })
  @ApiResponse({ status: 200, description: 'Reset PIN thành công' })
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

  @ApiOperation({ summary: 'Khóa / mở khóa trạng thái mã PIN của ngăn kho (Staff / Manager / Admin)' })
  @ApiParam({ name: 'contractId', description: 'ID hợp đồng', example: 1 })
  @ApiParam({ name: 'unitId', description: 'ID ngăn kho', example: 1 })
  @ApiResponse({ status: 200, description: 'Cập nhật trạng thái PIN thành công' })
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

  @ApiOperation({ summary: 'Lấy danh sách đồ đạc đang cất trong ngăn kho' })
  @ApiParam({ name: 'contractId', description: 'ID hợp đồng', example: 1 })
  @ApiParam({ name: 'unitId', description: 'ID ngăn kho', example: 1 })
  @ApiResponse({ status: 200, description: 'Danh sách đồ đạc' })
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

  @ApiOperation({ summary: 'Thêm món đồ mới vào kho' })
  @ApiParam({ name: 'contractId', description: 'ID hợp đồng', example: 1 })
  @ApiParam({ name: 'unitId', description: 'ID ngăn kho', example: 1 })
  @ApiResponse({ status: 201, description: 'Thêm đồ đạc thành công' })
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

  @ApiOperation({ summary: 'Chỉnh sửa thông tin / số lượng món đồ trong kho' })
  @ApiParam({ name: 'itemId', description: 'ID món đồ', example: 1 })
  @ApiResponse({ status: 200, description: 'Cập nhật món đồ thành công' })
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

  @ApiOperation({ summary: 'Xóa món đồ khỏi kho khi đã mang ra ngoài' })
  @ApiParam({ name: 'itemId', description: 'ID món đồ', example: 1 })
  @ApiResponse({ status: 200, description: 'Xóa món đồ thành công' })
  @Delete('items/:itemId')
  async deleteStoredItem(
    @Param('itemId', ParseIntPipe) itemId: number,
    @CurrentUser() user: any,
  ) {
    return this.contractsService.deleteStoredItem(itemId, user.id, user.role);
  }
}
