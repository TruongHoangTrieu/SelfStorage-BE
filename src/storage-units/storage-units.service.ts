import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateStorageUnitDto } from './dto/create-storage-unit.dto';
import { UpdateStorageUnitDto } from './dto/update-storage-unit.dto';
import { FilterStorageUnitDto } from './dto/filter-storage-unit.dto';
import { StorageUnitStatus } from '@prisma/client';

@Injectable()
export class StorageUnitsService {
  private readonly logger = new Logger(StorageUnitsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(filter: FilterStorageUnitDto = {}) {
    const whereClause: any = {};

    if (filter.facilityId) {
      whereClause.facilityId = filter.facilityId;
    }

    if (filter.unitTypeId) {
      whereClause.unitTypeId = filter.unitTypeId;
    }

    if (filter.status) {
      whereClause.status = filter.status;
    }

    return this.prisma.storageUnit.findMany({
      where: whereClause,
      include: {
        facility: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        unitType: {
          select: {
            id: true,
            name: true,
            code: true,
            size: true,
            sizeUnit: true,
            depositAmount: true,
          },
        },
      },
      orderBy: [{ facilityId: 'asc' }, { unitNumber: 'asc' }],
    });
  }

  async findById(id: number) {
    const unit = await this.prisma.storageUnit.findUnique({
      where: { id },
      include: {
        facility: true,
        unitType: true,
      },
    });

    if (!unit) {
      throw new NotFoundException(`Storage unit with ID ${id} not found`);
    }

    return unit;
  }

  async create(dto: CreateStorageUnitDto) {
    // 1. Verify Facility exists
    const facility = await this.prisma.facility.findUnique({
      where: { id: dto.facilityId },
    });

    if (!facility) {
      throw new NotFoundException(
        `Facility with ID ${dto.facilityId} not found`,
      );
    }

    // 2. Verify StorageUnitType exists
    const unitType = await this.prisma.storageUnitType.findUnique({
      where: { id: dto.unitTypeId },
    });

    if (!unitType) {
      throw new NotFoundException(
        `Storage unit type with ID ${dto.unitTypeId} not found`,
      );
    }

    // 3. CRITICAL BUSINESS VALIDATION: StorageUnitType must belong to the same Facility
    if (unitType.facilityId !== dto.facilityId) {
      throw new BadRequestException(
        `Storage unit type (ID ${dto.unitTypeId}) belongs to facility ID ${unitType.facilityId}, not to facility ID ${dto.facilityId}`,
      );
    }

    const unitNumber = dto.unitNumber.trim();

    // 4. Verify uniqueness of [facilityId, unitNumber]
    const existingUnit = await this.prisma.storageUnit.findUnique({
      where: {
        facilityId_unitNumber: {
          facilityId: dto.facilityId,
          unitNumber,
        },
      },
    });

    if (existingUnit) {
      throw new ConflictException(
        `Storage unit '${unitNumber}' already exists in facility '${facility.name}'`,
      );
    }

    // 5. Create StorageUnit
    return this.prisma.storageUnit.create({
      data: {
        facilityId: dto.facilityId,
        unitTypeId: dto.unitTypeId,
        unitNumber,
        floor: dto.floor?.trim() || null,
        status: dto.status || StorageUnitStatus.AVAILABLE,
        condition: dto.condition?.trim() || 'GOOD',
      },
      include: {
        facility: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        unitType: {
          select: {
            id: true,
            name: true,
            code: true,
            size: true,
            sizeUnit: true,
            depositAmount: true,
          },
        },
      },
    });
  }

  async update(id: number, dto: UpdateStorageUnitDto) {
    const existing = await this.prisma.storageUnit.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException(`Storage unit with ID ${id} not found`);
    }

    // If unitTypeId is being updated, verify it belongs to the same facility
    if (dto.unitTypeId && dto.unitTypeId !== existing.unitTypeId) {
      const targetUnitType = await this.prisma.storageUnitType.findUnique({
        where: { id: dto.unitTypeId },
      });

      if (!targetUnitType) {
        throw new NotFoundException(
          `Storage unit type with ID ${dto.unitTypeId} not found`,
        );
      }

      if (targetUnitType.facilityId !== existing.facilityId) {
        throw new BadRequestException(
          `Storage unit type (ID ${dto.unitTypeId}) does not belong to facility ID ${existing.facilityId}`,
        );
      }
    }

    // If unitNumber is being updated, check uniqueness within facility
    let unitNumber = existing.unitNumber;
    if (dto.unitNumber && dto.unitNumber.trim() !== existing.unitNumber) {
      unitNumber = dto.unitNumber.trim();
      const duplicate = await this.prisma.storageUnit.findUnique({
        where: {
          facilityId_unitNumber: {
            facilityId: existing.facilityId,
            unitNumber,
          },
        },
      });

      if (duplicate && duplicate.id !== id) {
        throw new ConflictException(
          `Storage unit '${unitNumber}' already exists in this facility`,
        );
      }
    }

    return this.prisma.storageUnit.update({
      where: { id },
      data: {
        unitTypeId: dto.unitTypeId || undefined,
        unitNumber: dto.unitNumber ? unitNumber : undefined,
        floor:
          dto.floor !== undefined ? dto.floor?.trim() || null : undefined,
        status: dto.status || undefined,
        condition: dto.condition ? dto.condition.trim() : undefined,
      },
      include: {
        facility: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        unitType: {
          select: {
            id: true,
            name: true,
            code: true,
            size: true,
            sizeUnit: true,
            depositAmount: true,
          },
        },
      },
    });
  }
}
