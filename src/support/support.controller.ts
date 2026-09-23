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

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('support/requests')
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  /**
   * Tạo yêu cầu hỗ trợ sự cố mới (Khách hàng)
   * POST /support/requests
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() user: any,
    @Body() dto: CreateSupportRequestDto,
  ) {
    return this.supportService.create(user.id, dto);
  }

  /**
   * Lấy danh sách yêu cầu hỗ trợ (Phân quyền & Lọc)
   * GET /support/requests
   */
  @Get()
  async findAll(
    @CurrentUser() user: any,
    @Query() filterDto: FilterSupportRequestDto,
  ) {
    return this.supportService.findAll(user, filterDto);
  }

  /**
   * Xem chi tiết yêu cầu hỗ trợ kèm toàn bộ lịch sử xử lý
   * GET /support/requests/:id
   */
  @Get(':id')
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ) {
    return this.supportService.findOne(id, user);
  }

  /**
   * Phân công nhân viên tiếp nhận xử lý yêu cầu (Manager / Admin)
   * PATCH /support/requests/:id/assign
   */
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

  /**
   * Cập nhật tiến độ & trạng thái xử lý ticket (Staff / Manager / Admin)
   * PATCH /support/requests/:id/progress
   */
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

  /**
   * Khách hàng hoặc Nhân viên trao đổi, thêm ghi chú/phản hồi vào ticket
   * POST /support/requests/:id/notes
   */
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
