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

@UseGuards(JwtAuthGuard)
@Controller('reservations')
export class ReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  /**
   * Check storage unit availability for reservation
   * GET /reservations/availability?facilityId=1&unitTypeId=2&rentalPeriod=3
   */
  @Get('availability')
  async checkAvailability(@Query() query: CheckAvailabilityDto) {
    return this.reservationsService.checkAvailability(query);
  }

  /**
   * Create a new reservation (Customer only)
   * POST /reservations
   */
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

  /**
   * Get list of reservations (Customer sees own, Staff/Manager sees all with filter)
   * GET /reservations?page=1&limit=10&status=PENDING
   */
  @Get()
  async findAll(
    @CurrentUser() user: any,
    @Query() filterDto: FilterReservationDto,
  ) {
    return this.reservationsService.findAll(filterDto, user);
  }

  /**
   * Get reservation details by ID
   * GET /reservations/:id
   */
  @Get(':id')
  async findById(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ) {
    return this.reservationsService.findById(id, user);
  }

  /**
   * Update reservation details (e.g. appointmentDate, rentalPeriod)
   * PATCH /reservations/:id
   */
  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @Body() updateReservationDto: UpdateReservationDto,
  ) {
    return this.reservationsService.update(id, updateReservationDto, user);
  }

  /**
   * Cancel a reservation and release the reserved storage unit
   * POST /reservations/:id/cancel
   */
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
