import {
  Controller,
  Get,
  Post,
  Patch,
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
import { SupportService } from './support.service';
import { CreateSupportRequestDto } from './dto/create-support-request.dto';
import { FilterSupportRequestDto } from './dto/filter-support-request.dto';
import {
  UpdateTicketProgressDto,
  AssignStaffTicketDto,
  AddTicketNoteDto,
} from './dto/update-support-request.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../common/enums/role.enum';

@ApiTags('Support & Issue Handling')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('support/requests')
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @ApiOperation({ summary: 'Tạo ticket yêu cầu hỗ trợ sự cố mới (Khách hàng hoặc nhân viên)' })
  @ApiResponse({ status: 201, description: 'Tạo yêu cầu hỗ trợ thành công' })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() user: any,
    @Body() dto: CreateSupportRequestDto,
  ) {
    return this.supportService.create(user.id, dto);
  }

  @ApiOperation({ summary: 'Lấy danh sách yêu cầu hỗ trợ (Khách hàng xem ticket của mình, Staff/Admin xem toàn bộ)' })
  @ApiResponse({ status: 200, description: 'Danh sách yêu cầu hỗ trợ phân trang' })
  @Get()
  async findAll(
    @CurrentUser() user: any,
    @Query() filterDto: FilterSupportRequestDto,
  ) {
    return this.supportService.findAll(user, filterDto);
  }

  @ApiOperation({ summary: 'Xem chi tiết yêu cầu hỗ trợ kèm toàn bộ lịch sử tiến độ & nhật ký xử lý' })
  @ApiParam({ name: 'id', description: 'ID yêu cầu hỗ trợ', example: 1 })
  @ApiResponse({ status: 200, description: 'Chi tiết ticket kèm nhật ký' })
  @ApiResponse({ status: 403, description: 'Không có quyền xem ticket của khách hàng khác' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy ticket' })
  @Get(':id')
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ) {
    return this.supportService.findOne(id, user);
  }

  @ApiOperation({ summary: 'Phân công nhân viên tiếp nhận xử lý ticket (Manager / Admin)' })
  @ApiParam({ name: 'id', description: 'ID yêu cầu hỗ trợ', example: 1 })
  @ApiResponse({ status: 200, description: 'Phân công nhân viên thành công' })
  @Roles(
    UserRole.FACILITY_MANAGER,
    UserRole.BUSINESS_OPERATIONS_MANAGER,
    UserRole.SYSTEM_ADMINISTRATOR,
  )
  @Patch(':id/assign')
  async assignStaff(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AssignStaffTicketDto,
    @CurrentUser() user: any,
  ) {
    return this.supportService.assignStaff(id, dto.staffId, user);
  }

  @ApiOperation({ summary: 'Cập nhật tiến độ & trạng thái xử lý ticket (Staff / Manager / Admin)' })
  @ApiParam({ name: 'id', description: 'ID yêu cầu hỗ trợ', example: 1 })
  @ApiResponse({ status: 200, description: 'Cập nhật tiến độ thành công' })
  @Roles(
    UserRole.FACILITY_STAFF,
    UserRole.FACILITY_MANAGER,
    UserRole.BUSINESS_OPERATIONS_MANAGER,
    UserRole.SYSTEM_ADMINISTRATOR,
  )
  @Patch(':id/progress')
  async updateProgress(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @Body() dto: UpdateTicketProgressDto,
  ) {
    return this.supportService.updateProgress(id, user, dto);
  }

  @ApiOperation({ summary: 'Khách hàng hoặc Nhân viên trao đổi, thêm ghi chú/phản hồi vào ticket' })
  @ApiParam({ name: 'id', description: 'ID yêu cầu hỗ trợ', example: 1 })
  @ApiResponse({ status: 201, description: 'Thêm ghi chú thành công' })
  @Post(':id/notes')
  @HttpCode(HttpStatus.CREATED)
  async addNote(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @Body() dto: AddTicketNoteDto,
  ) {
    return this.supportService.addNote(id, user, dto);
  }
}
