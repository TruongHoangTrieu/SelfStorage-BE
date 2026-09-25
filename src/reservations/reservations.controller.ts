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
  ApiParam,
} from '@nestjs/swagger';
import { ReservationsService } from './reservations.service';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { UpdateReservationDto } from './dto/update-reservation.dto';
import { CancelReservationDto } from './dto/cancel-reservation.dto';
import { FilterReservationDto } from './dto/filter-reservation.dto';
import { CheckAvailabilityDto } from './dto/check-availability.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../common/enums/role.enum';

@ApiTags('Reservations')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('reservations')
export class ReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @ApiOperation({ summary: 'Kiểm tra phòng trống & dự toán giá thuê kho trước khi đặt chỗ' })
  @ApiResponse({ status: 200, description: 'Thông tin phòng trống và tính giá' })
  @Get('availability')
  async checkAvailability(@Query() query: CheckAvailabilityDto) {
    return this.reservationsService.checkAvailability(query);
  }

  @ApiOperation({ summary: 'Tạo đơn đặt chỗ thuê kho mới (Customer only)' })
  @ApiResponse({ status: 201, description: 'Tạo đơn đặt chỗ thành công' })
  @ApiResponse({ status: 400, description: 'Dữ liệu không hợp lệ' })
  @ApiResponse({ status: 409, description: 'Hết phòng trống thuộc loại kho này' })
  @UseGuards(RolesGuard)
  @Roles(UserRole.STORAGE_CUSTOMER)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() user: any,
    @Body() createReservationDto: CreateReservationDto,
  ) {
    return this.reservationsService.create(user.id, createReservationDto);
  }

  @ApiOperation({ summary: 'Lấy danh sách đơn đặt chỗ (Customer xem của mình, Staff/Manager xem tất cả)' })
  @ApiResponse({ status: 200, description: 'Danh sách đơn đặt chỗ phân trang' })
  @Get()
  async findAll(
    @CurrentUser() user: any,
    @Query() filterDto: FilterReservationDto,
  ) {
    return this.reservationsService.findAll(filterDto, user);
  }

  @ApiOperation({ summary: 'Lấy chi tiết đơn đặt chỗ theo ID' })
  @ApiParam({ name: 'id', description: 'ID đơn đặt chỗ', example: 1 })
  @ApiResponse({ status: 200, description: 'Chi tiết đơn đặt chỗ' })
  @ApiResponse({ status: 403, description: 'Không có quyền xem đơn của khách hàng khác' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy đơn' })
  @Get(':id')
  async findById(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ) {
    return this.reservationsService.findById(id, user);
  }

  @ApiOperation({ summary: 'Cập nhật thông tin đơn đặt chỗ (ngày hẹn, thời hạn thuê)' })
  @ApiParam({ name: 'id', description: 'ID đơn đặt chỗ', example: 1 })
  @ApiResponse({ status: 200, description: 'Cập nhật đơn thành công' })
  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @Body() updateReservationDto: UpdateReservationDto,
  ) {
    return this.reservationsService.update(id, updateReservationDto, user);
  }

  @ApiOperation({ summary: 'Hủy đơn đặt chỗ và tự động giải phóng ngăn kho về trạng thái AVAILABLE' })
  @ApiParam({ name: 'id', description: 'ID đơn đặt chỗ', example: 1 })
  @ApiResponse({ status: 200, description: 'Hủy đơn đặt chỗ thành công' })
  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancel(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @Body() cancelReservationDto: CancelReservationDto,
  ) {
    return this.reservationsService.cancel(id, user, cancelReservationDto);
  }
}
