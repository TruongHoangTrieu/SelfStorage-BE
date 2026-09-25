import {
  Controller,
  Get,
  Post,
  Param,
  Body,
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
import { HandoversService } from './handovers.service';
import { CheckInDto } from './dto/check-in.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../common/enums/role.enum';

@ApiTags('Handovers & Check-In')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('handovers')
export class HandoversController {
  constructor(private readonly handoversService: HandoversService) {}

  @ApiOperation({ summary: 'Tra cứu thông tin đơn đặt chỗ để nhân viên chuẩn bị Check-in / Bàn giao kho' })
  @ApiParam({ name: 'reservationId', description: 'ID đơn đặt chỗ', example: 1 })
  @ApiResponse({ status: 200, description: 'Thông tin đơn đặt chỗ kèm phòng và khách hàng' })
  @ApiResponse({ status: 403, description: 'Nhân viên không thuộc cơ sở của đơn này' })
  @Roles(
    UserRole.FACILITY_STAFF,
    UserRole.FACILITY_MANAGER,
    UserRole.BUSINESS_OPERATIONS_MANAGER,
    UserRole.SYSTEM_ADMINISTRATOR,
  )
  @Get('reservations/:reservationId')
  async getReservationForCheckIn(
    @Param('reservationId', ParseIntPipe) reservationId: number,
    @CurrentUser() user: any,
  ) {
    return this.handoversService.getReservationForCheckIn(reservationId, user);
  }

  @ApiOperation({ summary: 'Thực hiện Check-in & Bàn giao kho (Kích hoạt hợp đồng, cấp mã PIN khóa và lập biên bản)' })
  @ApiResponse({ status: 200, description: 'Check-in thành công, trả về Hợp đồng, mã PIN và Biên bản bàn giao' })
  @ApiResponse({ status: 400, description: 'Trạng thái đơn không hợp lệ hoặc đã check-in' })
  @Roles(
    UserRole.FACILITY_STAFF,
    UserRole.FACILITY_MANAGER,
    UserRole.BUSINESS_OPERATIONS_MANAGER,
    UserRole.SYSTEM_ADMINISTRATOR,
  )
  @Post('check-in')
  @HttpCode(HttpStatus.OK)
  async checkIn(
    @Body() checkInDto: CheckInDto,
    @CurrentUser() user: any,
  ) {
    return this.handoversService.checkIn(checkInDto, user);
  }
}
