import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
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
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { FacilitiesService } from './facilities.service';
import { CreateFacilityDto } from './dto/create-facility.dto';
import { UpdateFacilityDto } from './dto/update-facility.dto';
import { AssignStaffDto, EndStaffAssignmentDto } from './dto/assign-staff.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';
import { UserRole } from '../common/enums/role.enum';

@ApiTags('Facilities')
@UseGuards(JwtAuthGuard)
@Controller('facilities')
export class FacilitiesController {
  constructor(private readonly facilitiesService: FacilitiesService) {}

  // ==================== CRUD CƠ SỞ KHO ====================

  @ApiOperation({ summary: 'Lấy danh sách tất cả cơ sở kho (Kèm thống kê số lượng ngăn kho)' })
  @ApiResponse({ status: 200, description: 'Danh sách cơ sở kho' })
  @Public()
  @Get()
  async findAll() {
    return this.facilitiesService.findAll();
  }

  @ApiOperation({ summary: 'Lấy chi tiết một cơ sở kho theo ID' })
  @ApiParam({ name: 'id', description: 'ID cơ sở kho', example: 1 })
  @ApiResponse({ status: 200, description: 'Chi tiết cơ sở kho kèm loại kho và ngăn kho' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy cơ sở' })
  @Public()
  @Get(':id')
  async findById(@Param('id', ParseIntPipe) id: number) {
    return this.facilitiesService.findById(id);
  }

  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Tạo cơ sở kho mới (Manager / Admin)' })
  @ApiResponse({ status: 201, description: 'Tạo cơ sở thành công' })
  @UseGuards(RolesGuard)
  @Roles(
    UserRole.FACILITY_MANAGER,
    UserRole.BUSINESS_OPERATIONS_MANAGER,
    UserRole.SYSTEM_ADMINISTRATOR,
  )
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createFacilityDto: CreateFacilityDto) {
    return this.facilitiesService.create(createFacilityDto);
  }

  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Cập nhật thông tin cơ sở kho (Manager / Admin)' })
  @ApiParam({ name: 'id', description: 'ID cơ sở kho', example: 1 })
  @ApiResponse({ status: 200, description: 'Cập nhật cơ sở thành công' })
  @UseGuards(RolesGuard)
  @Roles(
    UserRole.FACILITY_MANAGER,
    UserRole.BUSINESS_OPERATIONS_MANAGER,
    UserRole.SYSTEM_ADMINISTRATOR,
  )
  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateFacilityDto: UpdateFacilityDto,
  ) {
    return this.facilitiesService.update(id, updateFacilityDto);
  }

  // ==================== FLOW 5: QUẢN LÝ NHÂN VIÊN ====================

  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Phân công nhân viên vào làm việc tại cơ sở kho (Manager / Admin)' })
  @ApiParam({ name: 'id', description: 'ID cơ sở kho', example: 1 })
  @ApiResponse({ status: 201, description: 'Phân công nhân viên thành công' })
  @UseGuards(RolesGuard)
  @Roles(
    UserRole.FACILITY_MANAGER,
    UserRole.BUSINESS_OPERATIONS_MANAGER,
    UserRole.SYSTEM_ADMINISTRATOR,
  )
  @Post(':id/staff')
  @HttpCode(HttpStatus.CREATED)
  async assignStaff(
    @Param('id', ParseIntPipe) facilityId: number,
    @Body() dto: AssignStaffDto,
  ) {
    return this.facilitiesService.assignStaff(facilityId, dto);
  }

  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Xem danh sách nhân viên đang làm việc tại cơ sở (Staff / Manager / Admin)' })
  @ApiParam({ name: 'id', description: 'ID cơ sở kho', example: 1 })
  @ApiQuery({ name: 'includeEnded', required: false, description: 'Bao gồm nhân viên đã kết thúc phân công (true/false)' })
  @ApiResponse({ status: 200, description: 'Danh sách nhân viên tại cơ sở' })
  @UseGuards(RolesGuard)
  @Roles(
    UserRole.FACILITY_STAFF,
    UserRole.FACILITY_MANAGER,
    UserRole.BUSINESS_OPERATIONS_MANAGER,
    UserRole.SYSTEM_ADMINISTRATOR,
  )
  @Get(':id/staff')
  async getStaffByFacility(
    @Param('id', ParseIntPipe) facilityId: number,
    @Query('includeEnded') includeEnded?: string,
  ) {
    return this.facilitiesService.getStaffByFacility(
      facilityId,
      includeEnded === 'true',
    );
  }

  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Kết thúc phân công nhân viên tại cơ sở (Manager / Admin)' })
  @ApiParam({ name: 'assignmentId', description: 'ID bản ghi phân công', example: 1 })
  @ApiResponse({ status: 200, description: 'Kết thúc phân công thành công' })
  @UseGuards(RolesGuard)
  @Roles(
    UserRole.FACILITY_MANAGER,
    UserRole.BUSINESS_OPERATIONS_MANAGER,
    UserRole.SYSTEM_ADMINISTRATOR,
  )
  @Patch('staff-assignments/:assignmentId/end')
  async endStaffAssignment(
    @Param('assignmentId', ParseIntPipe) assignmentId: number,
    @Body() dto: EndStaffAssignmentDto,
  ) {
    return this.facilitiesService.endStaffAssignment(assignmentId, dto);
  }

  // ==================== FLOW 5: SƠ ĐỒ NGĂN KHO (STORAGE LAYOUT) ====================

  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Xem sơ đồ mặt bằng ngăn kho theo tầng và tỷ lệ lấp đầy (Staff / Manager / Admin)' })
  @ApiParam({ name: 'id', description: 'ID cơ sở kho', example: 1 })
  @ApiResponse({ status: 200, description: 'Sơ đồ mặt bằng kèm nhóm theo tầng và tỷ lệ lấp đầy' })
  @UseGuards(RolesGuard)
  @Roles(
    UserRole.FACILITY_STAFF,
    UserRole.FACILITY_MANAGER,
    UserRole.BUSINESS_OPERATIONS_MANAGER,
    UserRole.SYSTEM_ADMINISTRATOR,
  )
  @Get(':id/storage-layout')
  async getStorageLayout(@Param('id', ParseIntPipe) facilityId: number) {
    return this.facilitiesService.getStorageLayout(facilityId);
  }

  // ==================== FLOW 5: YÊU CẦU HỖ TRỢ TẠI CƠ SỞ ====================

  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Danh sách yêu cầu hỗ trợ tại cơ sở kho (Staff / Manager / Admin)' })
  @ApiParam({ name: 'id', description: 'ID cơ sở kho', example: 1 })
  @ApiQuery({ name: 'status', required: false, description: 'Lọc theo trạng thái ticket (OPEN, IN_PROGRESS, RESOLVED, CLOSED)' })
  @ApiQuery({ name: 'priority', required: false, description: 'Lọc theo mức ưu tiên (LOW, MEDIUM, HIGH, URGENT)' })
  @UseGuards(RolesGuard)
  @Roles(
    UserRole.FACILITY_STAFF,
    UserRole.FACILITY_MANAGER,
    UserRole.BUSINESS_OPERATIONS_MANAGER,
    UserRole.SYSTEM_ADMINISTRATOR,
  )
  @Get(':id/support-requests')
  async getSupportRequests(
    @Param('id', ParseIntPipe) facilityId: number,
    @Query('status') status?: string,
    @Query('priority') priority?: string,
  ) {
    return this.facilitiesService.getSupportRequests(facilityId, status, priority);
  }

  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Phân công nhân viên xử lý ticket hỗ trợ tại cơ sở (Manager / Admin)' })
  @ApiParam({ name: 'requestId', description: 'ID ticket hỗ trợ', example: 1 })
  @UseGuards(RolesGuard)
  @Roles(
    UserRole.FACILITY_MANAGER,
    UserRole.BUSINESS_OPERATIONS_MANAGER,
    UserRole.SYSTEM_ADMINISTRATOR,
  )
  @Patch('support-requests/:requestId/assign')
  async assignSupportRequest(
    @Param('requestId', ParseIntPipe) requestId: number,
    @Body('staffId', ParseIntPipe) staffId: number,
  ) {
    return this.facilitiesService.assignSupportRequest(requestId, staffId);
  }
}
