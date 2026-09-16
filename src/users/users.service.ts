import {
  Injectable,
  OnModuleInit,
  Logger,
  NotFoundException,
} from '@nestjs/common';
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
      },
    });
  }

  async findById(id: number) {
    return this.prisma.user.findUnique({
      where: { id },
      include: {
        role: true,
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
    roleId: number;
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

  async updateLastLogin(id: number) {
    return this.prisma.user.update({
      where: { id },
      data: { lastLoginAt: new Date() },
    });
  }

  sanitizeUser(user: any) {
    if (!user) return null;
    const { passwordHash, role, roleId, ...sanitized } = user;
    return {
      ...sanitized,
      role: typeof role === 'object' && role !== null ? role.name : role,
    };
  }
}
