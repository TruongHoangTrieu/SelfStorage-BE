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
import { HandoversService } from './handovers.service';
import { CheckInDto } from './dto/check-in.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../common/enums/role.enum';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('handovers')
export class HandoversController {
  constructor(private readonly handoversService: HandoversService) {}

  /**
   * Get reservation details for staff check-in verification
   * GET /handovers/reservations/:reservationId
   */
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

  /**
   * Perform check-in and handover for a verified reservation
   * POST /handovers/check-in
   */
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
