import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Req,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { HandoversService } from './handovers.service';
import { CloudinaryService } from '../common/cloudinary/cloudinary.service';
import { CheckInDto } from './dto/check-in.dto';
import { CheckOutDto } from './dto/check-out.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../common/enums/role.enum';

import { LogCccdAccessDto } from './dto/log-cccd-access.dto';

@ApiTags('Handovers & Check-In / Check-Out')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('handovers')
export class HandoversController {
  constructor(
    private readonly handoversService: HandoversService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  @ApiOperation({ summary: 'Tra cứu thông tin đơn đặt chỗ để nhân viên chuẩn bị Check-in / Bàn giao kho' })
  @ApiParam({ name: 'reservationId', description: 'ID đơn đặt chỗ' })
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
    @Param('reservationId') reservationId: string,
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

  @ApiOperation({ summary: 'Tra cứu thông tin hợp đồng để nhân viên chuẩn bị Check-out / Trả kho và đối soát hiện trạng' })
  @ApiParam({ name: 'contractId', description: 'ID hợp đồng thuê kho' })
  @ApiResponse({ status: 200, description: 'Thông tin hợp đồng, tiền cọc, phụ phí nợ, đồ đạc trong kho và biên bản check-in ban đầu' })
  @ApiResponse({ status: 403, description: 'Nhân viên không thuộc cơ sở của hợp đồng này' })
  @Roles(
    UserRole.FACILITY_STAFF,
    UserRole.FACILITY_MANAGER,
    UserRole.BUSINESS_OPERATIONS_MANAGER,
    UserRole.SYSTEM_ADMINISTRATOR,
  )
  @Get('contracts/:contractId/check-out')
  async getContractForCheckOut(
    @Param('contractId') contractId: string,
    @CurrentUser() user: any,
  ) {
    return this.handoversService.getContractForCheckOut(contractId, user);
  }

  @ApiOperation({ summary: 'Thực hiện Check-out & Bàn giao hoàn trả kho (Lập biên bản trả kho, thu hồi mã PIN, giải phóng kho và thanh toán cọc)' })
  @ApiResponse({ status: 200, description: 'Trả kho thành công, giải phóng kho và lập biên bản CHECK_OUT' })
  @ApiResponse({ status: 400, description: 'Hợp đồng không ở trạng thái hợp lệ để trả kho' })
  @Roles(
    UserRole.FACILITY_STAFF,
    UserRole.FACILITY_MANAGER,
    UserRole.BUSINESS_OPERATIONS_MANAGER,
    UserRole.SYSTEM_ADMINISTRATOR,
  )
  @Post('check-out')
  @HttpCode(HttpStatus.OK)
  async checkOut(
    @Body() checkOutDto: CheckOutDto,
    @CurrentUser() user: any,
  ) {
    return this.handoversService.checkOut(checkOutDto, user);
  }

  @ApiOperation({ summary: 'Ghi nhận Audit Log khi mở xem hoặc in CCCD, trả về số CCCD giải mã và Signed URL ảnh' })
  @ApiResponse({ status: 200, description: 'Ghi log thành công và trả về số giải mã' })
  @Roles(
    UserRole.FACILITY_STAFF,
    UserRole.FACILITY_MANAGER,
    UserRole.BUSINESS_OPERATIONS_MANAGER,
    UserRole.SYSTEM_ADMINISTRATOR,
  )
  @Post('log-cccd-access')
  @HttpCode(HttpStatus.OK)
  async logCccdAccess(
    @Body() dto: LogCccdAccessDto,
    @CurrentUser() user: any,
    @Req() req: any,
  ) {
    const clientIp =
      req.headers?.['x-forwarded-for']?.toString().split(',')[0].trim() ||
      req.socket?.remoteAddress ||
      req.ip ||
      '127.0.0.1';
    return this.handoversService.logCccdAccess(dto, user, clientIp);
  }

  @ApiOperation({ summary: 'Tải ảnh CCCD bảo mật (Private Authenticated + Watermark chống lạm dụng)' })
  @ApiResponse({ status: 200, description: 'Tải ảnh CCCD thành công, trả về Signed URL tạm thời 5 phút' })
  @Roles(
    UserRole.FACILITY_STAFF,
    UserRole.FACILITY_MANAGER,
    UserRole.BUSINESS_OPERATIONS_MANAGER,
    UserRole.SYSTEM_ADMINISTRATOR,
  )
  @Post('upload-cccd')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('photo'))
  async uploadCccd(
    @UploadedFile() file: Express.Multer.File,
    @Body('reservationCode') reservationCode?: string,
    @Body('side') side?: 'front' | 'back',
  ) {
    if (!file) {
      throw new BadRequestException('Vui lòng chọn tệp ảnh CCCD để tải lên');
    }
    return this.cloudinaryService.uploadCccdImage(file, { reservationCode, side });
  }

  @ApiOperation({ summary: 'Tải ảnh hiện trạng bàn giao lên Cloudinary' })
  @ApiResponse({ status: 200, description: 'Tải ảnh thành công, trả về URL Cloudinary' })
  @Roles(
    UserRole.FACILITY_STAFF,
    UserRole.FACILITY_MANAGER,
    UserRole.BUSINESS_OPERATIONS_MANAGER,
    UserRole.SYSTEM_ADMINISTRATOR,
  )
  @Post('upload-photo')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('photo'))
  async uploadPhoto(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Vui lòng chọn tệp ảnh để tải lên');
    }
    return this.cloudinaryService.uploadImage(file, 'handovers');
  }
}

