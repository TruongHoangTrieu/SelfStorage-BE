import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateStorageUnitTypeDto } from './dto/create-storage-unit-type.dto';
import { UpdateStorageUnitTypeDto } from './dto/update-storage-unit-type.dto';
import { StorageUnitStatus, UnitTypeStatus } from '@prisma/client';

@Injectable()
export class StorageUnitTypesService {
  private readonly logger = new Logger(StorageUnitTypesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(facilityId?: number) {
    const whereClause: any = {};
    if (facilityId) {
      whereClause.facilityId = facilityId;
    }

    const unitTypes = await this.prisma.storageUnitType.findMany({
      where: whereClause,
      include: {
        facility: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        _count: {
          select: {
            storageUnits: true,
          },
        },
      },
      orderBy: { id: 'asc' },
    });

    // Add availability count for each unit type
    const unitTypesWithAvailability = await Promise.all(
      unitTypes.map(async (unitType) => {
        const availableUnits = await this.prisma.storageUnit.count({
          where: {
            unitTypeId: unitType.id,
            status: StorageUnitStatus.AVAILABLE,
          },
        });

        return {
          ...unitType,
          totalUnits: unitType._count.storageUnits,
          availableUnits,
        };
      }),
    );

    return unitTypesWithAvailability;
  }

  async findById(id: number) {
    const unitType = await this.prisma.storageUnitType.findUnique({
      where: { id },
      include: {
        facility: true,
        storageUnits: {
          orderBy: { unitNumber: 'asc' },
        },
        _count: {
          select: {
            storageUnits: true,
          },
        },
      },
    });

    if (!unitType) {
      throw new NotFoundException(`Storage unit type with ID ${id} not found`);
    }

    const availableUnits = await this.prisma.storageUnit.count({
      where: {
        unitTypeId: id,
        status: StorageUnitStatus.AVAILABLE,
      },
    });

    return {
      ...unitType,
      totalUnits: unitType._count.storageUnits,
      availableUnits,
    };
  }

  async create(dto: CreateStorageUnitTypeDto) {
    // 1. Verify that the Facility exists
    const facility = await this.prisma.facility.findUnique({
      where: { id: dto.facilityId },
    });

    if (!facility) {
      throw new NotFoundException(
        `Facility with ID ${dto.facilityId} not found`,
      );
    }

    const code = dto.code.trim().toUpperCase();

    // 2. Verify unique [facilityId, code]
    const existing = await this.prisma.storageUnitType.findUnique({
      where: {
        facilityId_code: {
          facilityId: dto.facilityId,
          code,
        },
      },
    });

    if (existing) {
      throw new ConflictException(
        `Storage unit type with code '${code}' already exists in facility '${facility.name}'`,
      );
    }

    return this.prisma.storageUnitType.create({
      data: {
        facilityId: dto.facilityId,
        name: dto.name.trim(),
        code,
        description: dto.description?.trim() || null,
        size: dto.size,
        sizeUnit: dto.sizeUnit?.trim() || 'm2',
        depositAmount: dto.depositAmount,
        status: dto.status || UnitTypeStatus.ACTIVE,
      },
      include: {
        facility: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
    });
  }

  async update(id: number, dto: UpdateStorageUnitTypeDto) {
    const unitType = await this.prisma.storageUnitType.findUnique({
      where: { id },
    });

    if (!unitType) {
      throw new NotFoundException(`Storage unit type with ID ${id} not found`);
    }

    let code = unitType.code;
    if (dto.code && dto.code.trim().toUpperCase() !== unitType.code) {
      code = dto.code.trim().toUpperCase();
      const existing = await this.prisma.storageUnitType.findUnique({
        where: {
          facilityId_code: {
            facilityId: unitType.facilityId,
            code,
          },
        },
      });

      if (existing && existing.id !== id) {
        throw new ConflictException(
          `Storage unit type with code '${code}' already exists in this facility`,
        );
      }
    }

    return this.prisma.storageUnitType.update({
      where: { id },
      data: {
        name: dto.name ? dto.name.trim() : undefined,
        code: dto.code ? code : undefined,
        description:
          dto.description !== undefined
            ? dto.description?.trim() || null
            : undefined,
        size: dto.size !== undefined ? dto.size : undefined,
        sizeUnit: dto.sizeUnit ? dto.sizeUnit.trim() : undefined,
        depositAmount:
          dto.depositAmount !== undefined ? dto.depositAmount : undefined,
        status: dto.status || undefined,
      },
      include: {
        facility: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
    });
  }
}
