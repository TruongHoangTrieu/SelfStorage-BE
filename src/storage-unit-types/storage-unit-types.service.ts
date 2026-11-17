import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
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

  private async getActiveDepositPercent(facilityId?: string): Promise<number> {
    const policies = await this.prisma.policy.findMany({
      where: {
        policyType: 'DEPOSIT',
        status: 'ACTIVE',
      },
      orderBy: { effectiveFrom: 'desc' },
    });

    const specific = facilityId
      ? policies.find((p) => p.facilityId === facilityId)
      : null;
    const global = policies.find((p) => !p.facilityId);
    const chosen = specific || global || policies[0];
    const val: any = chosen?.value || {};
    const rawPercent = Number(
      val.depositPercent ?? val.reservation_deposit_percent ?? 25,
    );
    return Number.isFinite(rawPercent) && rawPercent > 0 ? rawPercent : 25;
  }

  private async getFacilityAreaMetrics(facilityId: string) {
    const [facility, units] = await Promise.all([
      this.prisma.facility.findUnique({ where: { id: facilityId } }),
      this.prisma.storageUnit.findMany({
        where: { facilityId },
        include: { unitType: { select: { size: true } } },
      }),
    ]);
    const usedArea = Number(
      units
        .reduce((sum, u) => sum + (Number(u.unitType?.size) || 0), 0)
        .toFixed(2),
    );
    const totalArea = Number(
      (facility as any)?.totalArea ?? Math.max(300, Math.ceil(usedArea * 1.5)),
    );
    const remainingArea = Math.max(
      0,
      Number((totalArea - usedArea).toFixed(2)),
    );
    return { totalArea, usedArea, remainingArea };
  }

  async findAll(facilityId?: string) {
    const whereClause: any = {};
    if (facilityId) {
      const isObjectId = /^[0-9a-fA-F]{24}$/.test(facilityId);
      if (isObjectId) {
        whereClause.facilityId = facilityId;
      } else {
        // Try resolving by facility code
        const fac = await this.prisma.facility.findUnique({
          where: { code: facilityId },
        });
        if (fac) {
          whereClause.facilityId = fac.id;
        } else {
          // Neither ObjectId nor valid facility code -> return empty list safely
          return [];
        }
      }
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

    // Add availability count, computed deposit from policy %, and facility area metrics
    const metricsCache = new Map<string, Promise<any>>();
    const percentCache = new Map<string, Promise<number>>();

    const unitTypesWithAvailability = await Promise.all(
      unitTypes.map(async (unitType) => {
        if (!metricsCache.has(unitType.facilityId)) {
          metricsCache.set(
            unitType.facilityId,
            this.getFacilityAreaMetrics(unitType.facilityId),
          );
        }
        if (!percentCache.has(unitType.facilityId)) {
          percentCache.set(
            unitType.facilityId,
            this.getActiveDepositPercent(unitType.facilityId),
          );
        }

        const [availableUnits, areaMetrics, depositPercent] = await Promise.all([
          this.prisma.storageUnit.count({
            where: {
              unitTypeId: unitType.id,
              status: StorageUnitStatus.AVAILABLE,
            },
          }),
          metricsCache.get(unitType.facilityId),
          percentCache.get(unitType.facilityId),
        ]);

        const activePrice = unitType.pricingRules?.[0]?.price
          ? Number(unitType.pricingRules[0].price)
          : Number(unitType.depositAmount);

        const computedDepositAmount = Math.round(
          activePrice * ((depositPercent || 25) / 100),
        );
        const unitSize = Number(unitType.size) || 0;
        const maxTotalUnitsAtSize =
          unitSize > 0 ? Math.floor(areaMetrics.totalArea / unitSize) : 0;
        const maxAddableUnits =
          unitSize > 0 ? Math.floor(areaMetrics.remainingArea / unitSize) : 0;

        const { pricingRules, ...rest } = unitType;

        return {
          ...rest,
          depositAmount: computedDepositAmount,
          depositPercent,
          price: activePrice,
          totalUnits: (unitType as any)._count?.storageUnits ?? 0,
          availableUnits,
          facilityTotalArea: areaMetrics.totalArea,
          facilityUsedArea: areaMetrics.usedArea,
          facilityRemainingArea: areaMetrics.remainingArea,
          maxTotalUnitsAtSize,
          maxAddableUnits,
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

    const [availableUnits, areaMetrics, depositPercent] = await Promise.all([
      this.prisma.storageUnit.count({
        where: {
          unitTypeId: id,
          status: StorageUnitStatus.AVAILABLE,
        },
      }),
      this.getFacilityAreaMetrics(unitType.facilityId),
      this.getActiveDepositPercent(unitType.facilityId),
    ]);

    const activePrice = unitType.pricingRules?.[0]?.price
      ? Number(unitType.pricingRules[0].price)
      : Number(unitType.depositAmount);

    const computedDepositAmount = Math.round(
      activePrice * (depositPercent / 100),
    );
    const unitSize = Number(unitType.size) || 0;

    const { pricingRules, ...rest } = unitType;

    return {
      ...rest,
      depositAmount: computedDepositAmount,
      depositPercent,
      price: activePrice,
      totalUnits: (unitType as any)._count?.storageUnits ?? 0,
      availableUnits,
      facilityTotalArea: areaMetrics.totalArea,
      facilityUsedArea: areaMetrics.usedArea,
      facilityRemainingArea: areaMetrics.remainingArea,
      maxTotalUnitsAtSize:
        unitSize > 0 ? Math.floor(areaMetrics.totalArea / unitSize) : 0,
      maxAddableUnits:
        unitSize > 0 ? Math.floor(areaMetrics.remainingArea / unitSize) : 0,
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

    const depositPercent = await this.getActiveDepositPercent(dto.facilityId);
    const rentalPrice =
      dto.price !== undefined ? Number(dto.price) : Number(dto.depositAmount ?? 0);
    const computedDepositAmount = Math.round(
      rentalPrice * (depositPercent / 100),
    );

    return this.prisma.$transaction(async (tx) => {
      const createdUnitType = await tx.storageUnitType.create({
        data: {
          facilityId: dto.facilityId,
          name: dto.name.trim(),
          code,
          description: dto.description?.trim() || null,
          size: dto.size,
          sizeUnit: dto.sizeUnit?.trim() || 'm2',
          depositAmount: computedDepositAmount,
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
        depositPercent,
        price: Number(pricingRule.price),
      };
    });
  }

  async update(id: string, dto: UpdateStorageUnitTypeDto) {
    const unitType = await this.prisma.storageUnitType.findUnique({
      where: { id },
      include: {
        _count: { select: { storageUnits: true } },
      },
    });

    if (!unitType) {
      throw new NotFoundException(`Storage unit type with ID ${id} not found`);
    }

    // Kiểm tra diện tích cơ sở nếu thay đổi kích thước loại kho đã có ô kho vật lý
    if (dto.size !== undefined && Number(dto.size) !== Number(unitType.size)) {
      const unitsOfType = (unitType as any)._count?.storageUnits ?? 0;
      if (unitsOfType > 0) {
        const areaMetrics = await this.getFacilityAreaMetrics(unitType.facilityId);
        const currentTypeArea = Number(unitType.size) * unitsOfType;
        const otherUsedArea = Math.max(0, areaMetrics.usedArea - currentTypeArea);
        const nextTotalUsed = otherUsedArea + Number(dto.size) * unitsOfType;
        if (nextTotalUsed > areaMetrics.totalArea + 0.001) {
          throw new BadRequestException(
            `Không thể tăng kích thước lên ${dto.size} m² vì ${unitsOfType} ô kho hiện có sẽ làm tổng diện tích vượt quá giới hạn cơ sở (${areaMetrics.totalArea} m²)!`,
          );
        }
      }
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

    const depositPercent = await this.getActiveDepositPercent(unitType.facilityId);

    return this.prisma.$transaction(async (tx) => {
      let activePrice = Number(unitType.depositAmount);
      const existingRule = await tx.pricingRule.findFirst({
        where: { unitTypeId: id },
        orderBy: { effectiveFrom: 'desc' },
      });
      if (existingRule) {
        activePrice = Number(existingRule.price);
      }

      if (dto.price !== undefined) {
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
      }

      // Tiền cọc luôn tự động tính theo % tiền thuê từ Operation Manager
      const computedDepositAmount = Math.round(
        activePrice * (depositPercent / 100),
      );

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
          depositAmount: computedDepositAmount,
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

      return {
        ...updatedUnitType,
        depositPercent,
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
