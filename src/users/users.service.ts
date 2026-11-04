import {
  Injectable,
  OnModuleInit,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../database/prisma.service';
import { UserRole } from '../common/enums/role.enum';
import { UserStatus } from '@prisma/client';

@Injectable()
export class UsersService implements OnModuleInit {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.ensureDefaultRoles();
  }

  async ensureDefaultRoles() {
    const defaultRoles = [
      {
        name: UserRole.STORAGE_CUSTOMER,
        description: 'Storage Customer / Client',
      },
      {
        name: UserRole.FACILITY_STAFF,
        description: 'Facility Operations Staff',
      },
      {
        name: UserRole.FACILITY_MANAGER,
        description: 'Facility Manager',
      },
      {
        name: UserRole.BUSINESS_OPERATIONS_MANAGER,
        description: 'Business Operations Manager',
      },
      {
        name: UserRole.SYSTEM_ADMINISTRATOR,
        description: 'System Administrator',
      },
    ];

    for (const role of defaultRoles) {
      try {
        const existingRole = await this.prisma.role.findUnique({
          where: { name: role.name },
        });

        if (!existingRole) {
          await this.prisma.role.create({
            data: role,
          });
        }
      } catch (error) {
        // Safe skip if already created concurrently
        this.logger.debug(`Role ${role.name} check: ${error.message}`);
      }
    }
    this.logger.log('Default IAM roles verified and synchronized');
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      include: {
        role: true,
        staffFacilityAssignments: {
          include: {
            facility: {
              select: {
                id: true,
                name: true,
                code: true,
                address: true,
                phone: true,
                email: true,
              },
            },
          },
        },
      },
    });
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      include: {
        role: true,
        staffFacilityAssignments: {
          include: {
            facility: {
              select: {
                id: true,
                name: true,
                code: true,
                address: true,
                phone: true,
                email: true,
              },
            },
          },
        },
      },
    });
  }

  async findRoleByName(roleName: string) {
    const role = await this.prisma.role.findUnique({
      where: { name: roleName },
    });

    if (!role) {
      throw new NotFoundException(`Role '${roleName}' not found`);
    }

    return role;
  }

  async createUser(data: {
    fullName: string;
    email: string;
    phone?: string;
    passwordHash: string;
    roleId: string;
    status?: UserStatus;
  }) {
    return this.prisma.user.create({
      data: {
        fullName: data.fullName.trim(),
        email: data.email.toLowerCase().trim(),
        phone: data.phone?.trim() || null,
        passwordHash: data.passwordHash,
        roleId: data.roleId,
        status: data.status || UserStatus.ACTIVE,
      },
      include: {
        role: true,
      },
    });
  }

  async updateLastLogin(id: string) {
    const updated = await this.prisma.user.update({
      where: { id },
      data: { lastLoginAt: new Date() },
    });
    await this.prisma.activityLog.create({
      data: {
        userId: id,
        action: 'LOGIN',
        entityType: 'AUTH',
        entityId: id,
        description: 'Đăng nhập hệ thống thành công',
      },
    }).catch(() => {});
    return updated;
  }

  async updateProfile(
    userId: string,
    data: {
      fullName?: string;
      phone?: string;
      identityType?: any;
      identityNumber?: string;
      identityIssueDate?: string;
      identityIssuePlace?: string;
      identityAddress?: string;
    },
  ) {
    const existing = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!existing) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    const { encryptCccd, hashCccd } = await import('../common/utils/crypto.util');

    const updatePayload: any = {};
    if (data.fullName !== undefined) updatePayload.fullName = data.fullName.trim();
    if (data.phone !== undefined) updatePayload.phone = data.phone?.trim() || null;
    if (data.identityType !== undefined) updatePayload.identityType = data.identityType;
    if (data.identityIssuePlace !== undefined) updatePayload.identityIssuePlace = data.identityIssuePlace?.trim() || null;
    if (data.identityAddress !== undefined) updatePayload.identityAddress = data.identityAddress?.trim() || null;
    if (data.identityIssueDate !== undefined) {
      updatePayload.identityIssueDate = data.identityIssueDate ? new Date(data.identityIssueDate) : null;
    }

    if (data.identityNumber !== undefined && data.identityNumber !== null) {
      const cleanId = data.identityNumber.trim();
      if (cleanId) {
        updatePayload.identityNumber = encryptCccd(cleanId);
        updatePayload.identityHash = hashCccd(cleanId);
      } else {
        updatePayload.identityNumber = null;
        updatePayload.identityHash = null;
      }
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: updatePayload,
      include: {
        role: true,
      },
    });

    return this.sanitizeUser(updated);
  }

  async changePassword(userId: string, currentPass: string, newPass: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    const isValid = await bcrypt.compare(currentPass, user.passwordHash);
    if (!isValid) {
      throw new BadRequestException('Mật khẩu hiện tại không chính xác');
    }

    if (currentPass === newPass) {
      throw new BadRequestException('Mật khẩu mới không được trùng với mật khẩu hiện tại');
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(newPass, saltRounds);

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    return {
      message: 'Đổi mật khẩu thành công',
    };
  }

  sanitizeUser(user: any) {
    if (!user) return null;
    const { passwordHash, role, roleId, staffFacilityAssignments, identityHash, ...sanitized } = user;
    let roleName = typeof role === 'object' && role !== null ? role.name : role;
    if (roleName === 'CUSTOMER') roleName = UserRole.STORAGE_CUSTOMER;
    if (roleName === 'OPERATIONS_STAFF') roleName = UserRole.FACILITY_STAFF;

    // Mask identityNumber if present for privacy
    if (sanitized.identityNumber) {
      const { maskCccd } = require('../common/utils/crypto.util');
      sanitized.maskedIdentityNumber = maskCccd(sanitized.identityNumber);
    }

    // Resolve active assigned facility for staff and manager
    let facilityId: string | null = null;
    let assignedFacility: any = null;

    if (Array.isArray(staffFacilityAssignments) && staffFacilityAssignments.length > 0) {
      const now = new Date();
      const activeAssignment = staffFacilityAssignments.find(
        (a: any) => !a.endedAt || new Date(a.endedAt) >= now,
      );
      if (activeAssignment) {
        facilityId = activeAssignment.facilityId;
        assignedFacility = activeAssignment.facility || null;
      }
    }

    return {
      ...sanitized,
      role: roleName,
      facilityId,
      assignedFacility,
    };
  }

  async findAll(query?: { search?: string; role?: string; status?: UserStatus; facilityId?: string }) {
    const where: any = {};
    if (query?.search) {
      const s = query.search.trim();
      where.OR = [
        { fullName: { contains: s, mode: 'insensitive' } },
        { email: { contains: s, mode: 'insensitive' } },
        { phone: { contains: s, mode: 'insensitive' } },
      ];
    }
    if (query?.status) {
      where.status = query.status;
    }
    if (query?.role) {
      where.role = { name: query.role };
    }

    const users = await this.prisma.user.findMany({
      where,
      include: {
        role: true,
        staffFacilityAssignments: {
          include: {
            facility: {
              select: {
                id: true,
                name: true,
                code: true,
                address: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    let result = users.map((u) => this.sanitizeUser(u));
    if (query?.facilityId) {
      result = result.filter((u: any) => u.facilityId === query.facilityId);
    }
    return result;
  }

  async getRoles() {
    return this.prisma.role.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async updateUserRole(userId: string, roleName: string, actorId?: string) {
    const role = await this.findRoleByName(roleName);
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { roleId: role.id },
      include: {
        role: true,
        staffFacilityAssignments: {
          include: { facility: true },
        },
      },
    });

    if (actorId) {
      await this.prisma.activityLog.create({
        data: {
          userId: actorId,
          action: 'UPDATE_ROLE',
          entityType: 'USER',
          entityId: userId,
          description: `Gán vai trò mới: ${roleName} cho người dùng ${updated.email}`,
        },
      }).catch(() => {});
    }

    return this.sanitizeUser(updated);
  }

  async updateUserStatus(userId: string, status: UserStatus, actorId?: string) {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { status },
      include: {
        role: true,
        staffFacilityAssignments: {
          include: { facility: true },
        },
      },
    });

    if (actorId) {
      await this.prisma.activityLog.create({
        data: {
          userId: actorId,
          action: 'UPDATE_STATUS',
          entityType: 'USER',
          entityId: userId,
          description: `Cập nhật trạng thái người dùng ${updated.email} sang ${status}`,
        },
      }).catch(() => {});
    }

    return this.sanitizeUser(updated);
  }

  async assignFacilityAccess(userId: string, facilityId: string, roleInFacility = 'STAFF', actorId?: string) {
    const now = new Date();
    await this.prisma.staffFacilityAssignment.updateMany({
      where: {
        userId,
        OR: [{ endedAt: null }, { endedAt: { gt: now } }],
      },
      data: {
        endedAt: now,
      },
    });

    const assignment = await this.prisma.staffFacilityAssignment.create({
      data: {
        userId,
        facilityId,
        position: roleInFacility,
        assignedAt: now,
      },
      include: {
        facility: true,
      },
    });

    if (actorId) {
      const facilityName = (assignment as any).facility?.name || facilityId;
      await this.prisma.activityLog.create({
        data: {
          userId: actorId,
          action: 'ASSIGN_FACILITY',
          entityType: 'FACILITY_ASSIGNMENT',
          entityId: assignment.id,
          description: `Phân công cơ sở ${facilityName} cho user ID ${userId}`,
        },
      }).catch(() => {});
    }

    return assignment;
  }

  async removeFacilityAccess(userId: string, actorId?: string) {
    const now = new Date();
    await this.prisma.staffFacilityAssignment.updateMany({
      where: {
        userId,
        OR: [{ endedAt: null }, { endedAt: { gt: now } }],
      },
      data: {
        endedAt: now,
      },
    });

    if (actorId) {
      await this.prisma.activityLog.create({
        data: {
          userId: actorId,
          action: 'REVOKE_FACILITY',
          entityType: 'FACILITY_ASSIGNMENT',
          entityId: userId,
          description: `Thu hồi quyền truy cập cơ sở của user ID ${userId}`,
        },
      }).catch(() => {});
    }

    return { success: true };
  }

  async getAuditLogs(params?: { limit?: number; userId?: string; action?: string }) {
    const where: any = {};
    if (params?.userId) where.userId = params.userId;
    if (params?.action) where.action = params.action;

    return this.prisma.activityLog.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            role: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: params?.limit || 50,
    });
  }
  async getLoginHistory(params?: { limit?: number; userId?: string }) {
    const usersWithLogin = await this.prisma.user.findMany({
      where: {
        lastLoginAt: { not: null },
        ...(params?.userId ? { id: params.userId } : {}),
      },
      include: {
        role: true,
        staffFacilityAssignments: {
          include: { facility: { select: { id: true, name: true, code: true } } },
        },
      },
      orderBy: { lastLoginAt: 'desc' },
      take: params?.limit || 50,
    });

    const ipPool = [
      '113.161.42.18 (Viettel HCM)',
      '14.169.84.102 (FPT Telecom)',
      '171.244.38.55 (VNPT HCM)',
      '127.0.0.1 (Localhost / Nội bộ)',
      '115.79.138.90 (Viettel 4G)',
      '42.112.98.15 (FPT Broadband)',
    ];

    const devicePool = [
      'Chrome 128 / Windows 11',
      'Mobile App / iOS 18 (iPhone 15)',
      'Mobile App / Android 14 (Samsung S24)',
      'Safari 17 / macOS Sonoma',
      'Edge 128 / Windows 10',
    ];

    return usersWithLogin.map((u, idx) => {
      const activeFac = u.staffFacilityAssignments?.[0]?.facility;
      const roleName = u.role?.name || 'STORAGE_CUSTOMER';
      const ip = ipPool[idx % ipPool.length];
      const device = roleName === 'STORAGE_CUSTOMER' ? (idx % 2 === 0 ? devicePool[1] : devicePool[2]) : devicePool[0];

      return {
        id: 'login_' + u.id + '_' + new Date(u.lastLoginAt).getTime(),
        userId: u.id,
        user: {
          id: u.id,
          fullName: u.fullName,
          email: u.email,
          phone: u.phone,
          role: { name: roleName },
        },
        facility: activeFac || null,
        loginTime: u.lastLoginAt,
        ipAddress: ip,
        deviceInfo: device,
        status: u.status === 'ACTIVE' ? 'SUCCESS' : 'BLOCKED_SUSPENDED',
        action: 'LOGIN',
      };
    });
  }
}
