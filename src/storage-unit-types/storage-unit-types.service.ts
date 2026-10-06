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

  async findAll(facilityId?: string) {
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
        pricingRules: {
          orderBy: { effectiveFrom: 'desc' },
          take: 1,
        },
        _count: {
          select: {
            storageUnits: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Add availability count and active price for each unit type
    const unitTypesWithAvailability = await Promise.all(
      unitTypes.map(async (unitType) => {
        const availableUnits = await this.prisma.storageUnit.count({
          where: {
            unitTypeId: unitType.id,
            status: StorageUnitStatus.AVAILABLE,
          },
        });

        const activePrice = unitType.pricingRules?.[0]?.price
          ? Number(unitType.pricingRules[0].price)
          : Number(unitType.depositAmount);

        const { pricingRules, ...rest } = unitType;

        return {
          ...rest,
          price: activePrice,
          totalUnits: (unitType as any)._count?.storageUnits ?? 0,
          availableUnits,
        };
      }),
    );

    return unitTypesWithAvailability;
  }

  async findById(id: string) {
    const unitType = await this.prisma.storageUnitType.findUnique({
      where: { id },
      include: {
        facility: true,
        pricingRules: {
          orderBy: { effectiveFrom: 'desc' },
          take: 1,
        },
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

    const activePrice = unitType.pricingRules?.[0]?.price
      ? Number(unitType.pricingRules[0].price)
      : Number(unitType.depositAmount);

    const { pricingRules, ...rest } = unitType;

    return {
      ...rest,
      price: activePrice,
      totalUnits: (unitType as any)._count?.storageUnits ?? 0,
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

    const rentalPrice = dto.price !== undefined ? dto.price : dto.depositAmount;

    return this.prisma.$transaction(async (tx) => {
      const createdUnitType = await tx.storageUnitType.create({
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

      const pricingRule = await tx.pricingRule.create({
        data: {
          unitTypeId: createdUnitType.id,
          price: rentalPrice,
          effectiveFrom: new Date(),
        },
      });

      return {
        ...createdUnitType,
        price: Number(pricingRule.price),
      };
    });
  }

  async update(id: string, dto: UpdateStorageUnitTypeDto) {
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

    return this.prisma.$transaction(async (tx) => {
      const updatedUnitType = await tx.storageUnitType.update({
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

      let activePrice = Number(updatedUnitType.depositAmount);

      if (dto.price !== undefined) {
        const existingRule = await tx.pricingRule.findFirst({
          where: { unitTypeId: id },
          orderBy: { effectiveFrom: 'desc' },
        });

        if (existingRule) {
          const updatedRule = await tx.pricingRule.update({
            where: { id: existingRule.id },
            data: {
              price: dto.price,
              updatedAt: new Date(),
            },
          });
          activePrice = Number(updatedRule.price);
        } else {
          const newRule = await tx.pricingRule.create({
            data: {
              unitTypeId: id,
              price: dto.price,
              effectiveFrom: new Date(),
            },
          });
          activePrice = Number(newRule.price);
        }
      } else {
        const existingRule = await tx.pricingRule.findFirst({
          where: { unitTypeId: id },
          orderBy: { effectiveFrom: 'desc' },
        });
        if (existingRule) {
          activePrice = Number(existingRule.price);
        }
      }

      return {
        ...updatedUnitType,
        price: activePrice,
      };
    });
  }

  async delete(id: string) {
    const unitType = await this.prisma.storageUnitType.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            storageUnits: true,
            reservationItems: true,
          },
        },
      },
    });

    if (!unitType) {
      throw new NotFoundException(`Storage unit type with ID ${id} not found`);
    }

    const unitsCount = (unitType as any)._count?.storageUnits ?? 0;
    const resCount = (unitType as any)._count?.reservationItems ?? 0;

    if (unitsCount > 0 || resCount > 0) {
      throw new ConflictException(
        `Không thể xóa loại ngăn kho này vì đang có ${unitsCount} ô kho hoặc liên kết đặt chỗ liên quan. Vui lòng chuyển trạng thái sang INACTIVE để ngừng cung cấp.`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.pricingRule.deleteMany({
        where: { unitTypeId: id },
      });
      return tx.storageUnitType.delete({
        where: { id },
      });
    });
  }
}
