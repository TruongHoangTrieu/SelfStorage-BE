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
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { UserRole } from '../common/enums/role.enum';
import { UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

@ApiTags('Users - Quản Trị Người Dùng & Phân Quyền')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @ApiOperation({ summary: 'Lấy danh sách người dùng hệ thống (Admin & Ops)' })
  @Public()
  @Get()
  async findAll(
    @Query('search') search?: string,
    @Query('role') role?: string,
    @Query('status') status?: UserStatus,
    @Query('facilityId') facilityId?: string,
  ) {
    return this.usersService.findAll({ search, role, status, facilityId });
  }

  @ApiOperation({ summary: 'Lấy danh sách vai trò IAM (Admin & Ops)' })
  @Public()
  @Get('roles')
  async getRoles() {
    return this.usersService.getRoles();
  }

  @ApiOperation({ summary: 'Lấy nhật ký truy vết hoạt động hệ thống (Admin)' })
  @Public()
  @Get('audit-logs')
  async getAuditLogs(
    @Query('limit') limit?: string,
    @Query('userId') userId?: string,
    @Query('action') action?: string,
  ) {
    const lim = limit ? parseInt(limit, 10) : 50;
    return this.usersService.getAuditLogs({ limit: lim, userId, action });
  }

  @ApiOperation({ summary: 'Lấy lịch sử đăng nhập người dùng (Admin)' })
  @Public()
  @Get('login-history')
  async getLoginHistory(
    @Query('limit') limit?: string,
    @Query('userId') userId?: string,
  ) {
    const lim = limit ? parseInt(limit, 10) : 50;
    return this.usersService.getLoginHistory({ limit: lim, userId });
  }

  @ApiOperation({ summary: 'Tạo tài khoản người dùng mới và cấp quyền ban đầu (Admin)' })
  @Public()
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createUser(
    @Body()
    body: {
      fullName: string;
      email: string;
      phone?: string;
      password?: string;
      roleName: string;
      facilityId?: string;
      reason?: string;
    },
    @CurrentUser() adminUser: any,
  ) {
    if (adminUser?.role === UserRole.BUSINESS_OPERATIONS_MANAGER) {
      throw new BadRequestException(
        'Chỉ Quản trị viên hệ thống (SYSTEM_ADMINISTRATOR) mới có quyền khởi tạo tài khoản mới.',
      );
    }

    if (!body.email || !body.fullName || !body.roleName) {
      throw new BadRequestException('Vui lòng cung cấp đầy đủ họ tên, email và vai trò');
    }

    const isFacilityScopedRole =
      body.roleName === UserRole.FACILITY_STAFF || body.roleName === UserRole.FACILITY_MANAGER;

    if (isFacilityScopedRole && !body.facilityId) {
      throw new BadRequestException(
        'Vai trò Nhân viên vận hành và Quản lý chi nhánh bắt buộc phải chọn cơ sở kho trực thuộc',
      );
    }

    const existing = await this.usersService.findByEmail(body.email);
    if (existing) {
      throw new BadRequestException('Email này đã tồn tại trong hệ thống');
    }

    const role = await this.usersService.findRoleByName(body.roleName);
    const password = body.password || 'Storage@2026';
    const passwordHash = await bcrypt.hash(password, 10);
    const actorId = adminUser?.id || '6ac4e8ad2edd770fa05d7265';

    const newUser = await this.usersService.createUser({
      fullName: body.fullName,
      email: body.email,
      phone: body.phone,
      passwordHash,
      roleId: role.id,
      status: UserStatus.ACTIVE,
    });

    let facilityLogInfo = ' | Phạm vi: Toàn hệ thống (Global)';

    if (isFacilityScopedRole && body.facilityId) {
      if (body.roleName === UserRole.FACILITY_MANAGER) {
        await this.usersService.endExistingManagersAtFacility(body.facilityId, newUser.id);
      }

      const assignment = await this.usersService.assignFacilityAccess(
        newUser.id,
        body.facilityId,
        body.roleName === UserRole.FACILITY_MANAGER ? 'MANAGER' : 'STAFF',
      );
      const facName = (assignment as any)?.facility?.name || body.facilityId;
      facilityLogInfo = ` | Cơ sở: ${facName}`;
    }

    const reasonInfo = body.reason?.trim() ? ` | Ghi chú: ${body.reason.trim()}` : '';
    await this.usersService.logActivity({
      userId: actorId,
      action: 'CREATE_USER',
      entityType: 'USER',
      entityId: newUser.id,
      description: `Khởi tạo tài khoản ${newUser.email} (${newUser.fullName}) | Vai trò: [${body.roleName}]${facilityLogInfo}${reasonInfo}`,
    });

    const fullUser = await this.usersService.findById(newUser.id);
    return this.usersService.sanitizeUser(fullUser || newUser);
  }

  @ApiOperation({ summary: 'Thay đổi vai trò người dùng và tự động đồng bộ phạm vi cơ sở (Admin)' })
  @Public()
  @Patch(':id/role')
  async updateUserRole(
    @Param('id') userId: string,
    @Body()
    body: {
      roleName: string;
      facilityId?: string;
      reason?: string;
    },
    @CurrentUser() adminUser: any,
  ) {
    if (!body?.roleName) {
      throw new BadRequestException('Vui lòng cung cấp tên vai trò roleName');
    }
    return this.usersService.updateUserRole(
      userId,
      body.roleName,
      adminUser?.id || '6ac4e8ad2edd770fa05d7265',
      {
        facilityId: body.facilityId,
        reason: body.reason,
        actorRole: adminUser?.role,
      },
    );
  }

  @ApiOperation({ summary: 'Cập nhật trạng thái người dùng (Khóa / Mở khóa)' })
  @Public()
  @Patch(':id/status')
  async updateUserStatus(
    @Param('id') userId: string,
    @Body('status') status: UserStatus,
    @CurrentUser() adminUser: any,
  ) {
    if (!status || !Object.values(UserStatus).includes(status)) {
      throw new BadRequestException('Trạng thái không hợp lệ (ACTIVE, INACTIVE, SUSPENDED)');
    }
    return this.usersService.updateUserStatus(userId, status, adminUser?.id || '6ac4e8ad2edd770fa05d7265');
  }

  @ApiOperation({ summary: 'Phân công quyền truy cập cơ sở cho người dùng (Admin)' })
  @Public()
  @Post(':id/assign-facility')
  async assignFacilityAccess(
    @Param('id') userId: string,
    @Body() body: { facilityId: string; roleInFacility?: string },
    @CurrentUser() adminUser: any,
  ) {
    if (!body.facilityId) {
      throw new BadRequestException('Vui lòng cung cấp ID cơ sở (facilityId)');
    }
    return this.usersService.assignFacilityAccess(
      userId,
      body.facilityId,
      body.roleInFacility || 'STAFF',
      adminUser?.id || '6ac4e8ad2edd770fa05d7265',
    );
  }

  @ApiOperation({ summary: 'Thu hồi quyền truy cập cơ sở của người dùng (Admin)' })
  @Public()
  @Delete(':id/revoke-facility')
  async revokeFacilityAccess(
    @Param('id') userId: string,
    @CurrentUser() adminUser: any,
  ) {
    return this.usersService.removeFacilityAccess(userId, adminUser?.id || '6ac4e8ad2edd770fa05d7265');
  }
}
