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
import { FacilitiesService } from './facilities.service';
import { CreateFacilityDto } from './dto/create-facility.dto';
import { UpdateFacilityDto } from './dto/update-facility.dto';
import { AssignStaffDto, EndStaffAssignmentDto } from './dto/assign-staff.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';
import { UserRole } from '../common/enums/role.enum';

@UseGuards(JwtAuthGuard)
@Controller('facilities')
export class FacilitiesController {
  constructor(private readonly facilitiesService: FacilitiesService) {}

  // ==================== CRUD CƠ SỞ KHO ====================

  @Public()
  @Get()
  async findAll() {
    return this.facilitiesService.findAll();
  }

  @Public()
  @Get(':id')
  async findById(@Param('id', ParseIntPipe) id: number) {
    return this.facilitiesService.findById(id);
  }

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

  /**
   * Phân công nhân viên vào cơ sở kho
   * POST /facilities/:id/staff
   */
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

  /**
   * Xem danh sách nhân viên đang làm việc tại cơ sở
   * GET /facilities/:id/staff?includeEnded=true
   */
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

  /**
   * Kết thúc phân công nhân viên (rời khỏi cơ sở)
   * PATCH /facilities/staff-assignments/:assignmentId/end
   */
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

  /**
   * Xem sơ đồ ngăn kho theo cơ sở (nhóm theo tầng, trạng thái, loại kho)
   * GET /facilities/:id/storage-layout
   */
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

  /**
   * Danh sách yêu cầu hỗ trợ tại cơ sở (dành cho Staff/Manager)
   * GET /facilities/:id/support-requests?status=OPEN&priority=HIGH
   */
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

  /**
   * Phân công nhân viên xử lý yêu cầu hỗ trợ
   * PATCH /facilities/support-requests/:requestId/assign
   */
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
