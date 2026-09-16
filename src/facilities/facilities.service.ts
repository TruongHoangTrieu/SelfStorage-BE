import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateFacilityDto } from './dto/create-facility.dto';
import { UpdateFacilityDto } from './dto/update-facility.dto';
import { FacilityStatus, StorageUnitStatus } from '@prisma/client';

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
}
