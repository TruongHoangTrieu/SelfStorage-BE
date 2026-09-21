import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateFacilityDto } from './dto/create-facility.dto';
import { UpdateFacilityDto } from './dto/update-facility.dto';
import { AssignStaffDto, EndStaffAssignmentDto } from './dto/assign-staff.dto';
import { FacilityStatus, StorageUnitStatus, UserStatus } from '@prisma/client';

@Injectable()
export class FacilitiesService {
  private readonly logger = new Logger(FacilitiesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const facilities = await this.prisma.facility.findMany({
      include: {
        _count: {
          select: {
            storageUnits: true,
            storageUnitTypes: true,
          },
        },
      },
      orderBy: { id: 'asc' },
    });

    // Compute available units for each facility
    const facilitiesWithAvailability = await Promise.all(
      facilities.map(async (facility) => {
        const availableUnits = await this.prisma.storageUnit.count({
          where: {
            facilityId: facility.id,
            status: StorageUnitStatus.AVAILABLE,
          },
        });

        return {
          ...facility,
          totalUnits: facility._count.storageUnits,
          availableUnits,
          totalUnitTypes: facility._count.storageUnitTypes,
        };
      }),
    );

    return facilitiesWithAvailability;
  }

  async findById(id: number) {
    const facility = await this.prisma.facility.findUnique({
      where: { id },
      include: {
        storageUnitTypes: {
          where: { status: 'ACTIVE' },
          orderBy: { id: 'asc' },
        },
        _count: {
          select: {
            storageUnits: true,
            storageUnitTypes: true,
          },
        },
      },
    });

    if (!facility) {
      throw new NotFoundException(`Facility with ID ${id} not found`);
    }

    const availableUnits = await this.prisma.storageUnit.count({
      where: {
        facilityId: id,
        status: StorageUnitStatus.AVAILABLE,
      },
    });

    return {
      ...facility,
      totalUnits: facility._count.storageUnits,
      availableUnits,
      totalUnitTypes: facility._count.storageUnitTypes,
    };
  }

  async create(dto: CreateFacilityDto) {
    const code = dto.code.trim().toUpperCase();

    const existing = await this.prisma.facility.findUnique({
      where: { code },
    });

    if (existing) {
      throw new ConflictException(`Facility code '${code}' already exists`);
    }

    return this.prisma.facility.create({
      data: {
        name: dto.name.trim(),
        code,
        description: dto.description?.trim() || null,
        phone: dto.phone?.trim() || null,
        email: dto.email?.trim().toLowerCase() || null,
        address: dto.address.trim(),
        status: dto.status || FacilityStatus.ACTIVE,
      },
    });
  }

  async update(id: number, dto: UpdateFacilityDto) {
    const facility = await this.prisma.facility.findUnique({
      where: { id },
    });

    if (!facility) {
      throw new NotFoundException(`Facility with ID ${id} not found`);
    }

    let code = facility.code;
    if (dto.code && dto.code.trim().toUpperCase() !== facility.code) {
      code = dto.code.trim().toUpperCase();
      const existing = await this.prisma.facility.findUnique({
        where: { code },
      });

      if (existing && existing.id !== id) {
        throw new ConflictException(`Facility code '${code}' already exists`);
      }
    }

    return this.prisma.facility.update({
      where: { id },
      data: {
        name: dto.name ? dto.name.trim() : undefined,
        code: dto.code ? code : undefined,
        description:
          dto.description !== undefined
            ? dto.description?.trim() || null
            : undefined,
        phone:
          dto.phone !== undefined ? dto.phone?.trim() || null : undefined,
        email:
          dto.email !== undefined
            ? dto.email?.trim().toLowerCase() || null
            : undefined,
        address: dto.address ? dto.address.trim() : undefined,
        status: dto.status || undefined,
      },
    });
  }

  // ==================== FLOW 5: STAFF MANAGEMENT ====================

  /**
   * Phân công nhân viên vào cơ sở kho
   */
  async assignStaff(facilityId: number, dto: AssignStaffDto) {
    const facility = await this.prisma.facility.findUnique({
      where: { id: facilityId },
    });
    if (!facility) {
      throw new NotFoundException(`Facility with ID ${facilityId} not found`);
    }

    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
      include: { role: true },
    });
    if (!user) {
      throw new NotFoundException(`User with ID ${dto.userId} not found`);
    }

    // Kiểm tra nhân viên đã được phân công tại cơ sở này chưa (chưa kết thúc)
    const existingActive = await this.prisma.staffFacilityAssignment.findFirst({
      where: {
        userId: dto.userId,
        facilityId: facilityId,
        endedAt: null,
      },
    });
    if (existingActive) {
      throw new ConflictException(
        `User '${user.fullName}' is already assigned to this facility as '${existingActive.position}'`,
      );
    }

    const assignment = await this.prisma.staffFacilityAssignment.create({
      data: {
        userId: dto.userId,
        facilityId: facilityId,
        position: dto.position.trim().toUpperCase(),
      },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
            status: true,
            role: { select: { name: true } },
          },
        },
        facility: {
          select: { id: true, name: true, code: true },
        },
      },
    });

    return {
      message: `Đã phân công '${user.fullName}' vào cơ sở '${facility.name}' với vị trí '${dto.position}'`,
      assignment,
    };
  }

  /**
   * Lấy danh sách nhân viên đang làm việc tại một cơ sở
   */
  async getStaffByFacility(facilityId: number, includeEnded: boolean = false) {
    const facility = await this.prisma.facility.findUnique({
      where: { id: facilityId },
    });
    if (!facility) {
      throw new NotFoundException(`Facility with ID ${facilityId} not found`);
    }

    const where: any = { facilityId };
    if (!includeEnded) {
      where.endedAt = null;
    }

    const assignments = await this.prisma.staffFacilityAssignment.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
            status: true,
            lastLoginAt: true,
            role: { select: { name: true } },
          },
        },
      },
      orderBy: { assignedAt: 'desc' },
    });

    return {
      facility: { id: facility.id, name: facility.name, code: facility.code },
      totalStaff: assignments.length,
      staff: assignments,
    };
  }

  /**
   * Kết thúc phân công nhân viên (rời khỏi cơ sở)
   */
  async endStaffAssignment(
    assignmentId: number,
    dto: EndStaffAssignmentDto,
  ) {
    const assignment = await this.prisma.staffFacilityAssignment.findUnique({
      where: { id: assignmentId },
      include: {
        user: { select: { id: true, fullName: true } },
        facility: { select: { id: true, name: true } },
      },
    });

    if (!assignment) {
      throw new NotFoundException(`Staff assignment with ID ${assignmentId} not found`);
    }

    if (assignment.endedAt) {
      throw new BadRequestException('This staff assignment has already ended');
    }

    const updated = await this.prisma.staffFacilityAssignment.update({
      where: { id: assignmentId },
      data: {
        endedAt: dto.endedAt ? new Date(dto.endedAt) : new Date(),
      },
      include: {
        user: { select: { id: true, fullName: true } },
        facility: { select: { id: true, name: true } },
      },
    });

    return {
      message: `Đã kết thúc phân công '${updated.user.fullName}' khỏi cơ sở '${updated.facility.name}'`,
      assignment: updated,
    };
  }

  // ==================== FLOW 5: STORAGE LAYOUT (SƠ ĐỒ NGĂN KHO) ====================

  /**
   * Sơ đồ tổng quan ngăn kho theo cơ sở (Storage Layout)
   * Nhóm theo tầng (floor), trạng thái, loại kho
   */
  async getStorageLayout(facilityId: number) {
    const facility = await this.prisma.facility.findUnique({
      where: { id: facilityId },
    });
    if (!facility) {
      throw new NotFoundException(`Facility with ID ${facilityId} not found`);
    }

    const units = await this.prisma.storageUnit.findMany({
      where: { facilityId },
      include: {
        unitType: {
          select: {
            id: true,
            name: true,
            code: true,
            size: true,
            sizeUnit: true,
          },
        },
      },
      orderBy: [{ floor: 'asc' }, { unitNumber: 'asc' }],
    });

    // Nhóm theo tầng
    const floorMap: Record<string, any[]> = {};
    const statusCount: Record<string, number> = {
      AVAILABLE: 0,
      RESERVED: 0,
      OCCUPIED: 0,
      UNDER_MAINTENANCE: 0,
      OUT_OF_SERVICE: 0,
    };

    for (const unit of units) {
      const floor = unit.floor || 'Unknown';
      if (!floorMap[floor]) {
        floorMap[floor] = [];
      }
      floorMap[floor].push({
        id: unit.id,
        unitNumber: unit.unitNumber,
        status: unit.status,
        condition: unit.condition,
        unitType: unit.unitType,
      });

      statusCount[unit.status] = (statusCount[unit.status] || 0) + 1;
    }

    const totalUnits = units.length;
    const occupancyRate =
      totalUnits > 0
        ? ((statusCount['OCCUPIED'] / totalUnits) * 100).toFixed(2)
        : '0.00';

    return {
      facility: { id: facility.id, name: facility.name, code: facility.code },
      summary: {
        totalUnits,
        occupancyRate: `${occupancyRate}%`,
        ...statusCount,
      },
      floors: Object.entries(floorMap).map(([floor, units]) => ({
        floor,
        unitCount: units.length,
        units,
      })),
    };
  }

  // ==================== FLOW 5: SUPPORT REQUESTS PER FACILITY ====================

  /**
   * Danh sách yêu cầu hỗ trợ tại một cơ sở (dành cho Staff/Manager)
   */
  async getSupportRequests(
    facilityId: number,
    status?: string,
    priority?: string,
  ) {
    const facility = await this.prisma.facility.findUnique({
      where: { id: facilityId },
    });
    if (!facility) {
      throw new NotFoundException(`Facility with ID ${facilityId} not found`);
    }

    const where: any = { facilityId };
    if (status) where.status = status;
    if (priority) where.priority = priority;

    const requests = await this.prisma.supportRequest.findMany({
      where,
      include: {
        customer: {
          select: { id: true, fullName: true, email: true, phone: true },
        },
        assignedStaff: {
          select: { id: true, fullName: true, email: true },
        },
        contractItem: {
          select: {
            id: true,
            unit: {
              select: { id: true, unitNumber: true, floor: true },
            },
          },
        },
        _count: { select: { logs: true } },
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });

    return {
      facility: { id: facility.id, name: facility.name },
      totalRequests: requests.length,
      requests,
    };
  }

  /**
   * Phân công nhân viên xử lý yêu cầu hỗ trợ
   */
  async assignSupportRequest(requestId: number, staffId: number) {
    const request = await this.prisma.supportRequest.findUnique({
      where: { id: requestId },
    });
    if (!request) {
      throw new NotFoundException(`Support request with ID ${requestId} not found`);
    }

    const staff = await this.prisma.user.findUnique({
      where: { id: staffId },
      include: { role: true },
    });
    if (!staff) {
      throw new NotFoundException(`User with ID ${staffId} not found`);
    }

    return this.prisma.supportRequest.update({
      where: { id: requestId },
      data: {
        assignedStaffId: staffId,
        status: 'IN_PROGRESS',
      },
      include: {
        customer: {
          select: { id: true, fullName: true, email: true },
        },
        assignedStaff: {
          select: { id: true, fullName: true, email: true },
        },
      },
    });
  }
}

