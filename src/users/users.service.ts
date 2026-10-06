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
    return this.prisma.user.update({
      where: { id },
      data: { lastLoginAt: new Date() },
    });
  }

  async updateProfile(userId: string, data: { fullName?: string; phone?: string }) {
    const existing = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!existing) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(data.fullName !== undefined ? { fullName: data.fullName.trim() } : {}),
        ...(data.phone !== undefined ? { phone: data.phone?.trim() || null } : {}),
      },
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
    const { passwordHash, role, roleId, staffFacilityAssignments, ...sanitized } = user;
    let roleName = typeof role === 'object' && role !== null ? role.name : role;
    if (roleName === 'CUSTOMER') roleName = UserRole.STORAGE_CUSTOMER;
    if (roleName === 'OPERATIONS_STAFF') roleName = UserRole.FACILITY_STAFF;

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
}
