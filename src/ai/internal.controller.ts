import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Headers,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiExcludeEndpoint } from '@nestjs/swagger';
import { PrismaService } from '../database/prisma.service';
import { InternalKeyGuard } from './guards/internal-key.guard';
import { ContractStatus, StorageUnitStatus } from '@prisma/client';

@ApiTags('Internal APIs (For AI Service Only)')
@UseGuards(InternalKeyGuard)
@Controller('internal')
export class InternalController {
  private readonly logger = new Logger(InternalController.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Tra cứu danh sách ngăn kho còn trống, tính toán thể tích và đơn giá tháng
   */
  @ApiOperation({ summary: 'Internal: Tra cứu kho còn trống theo thể tích' })
  @Get('units/available')
  async getAvailableUnits(
    @Query('minVolume') minVolume?: string,
    @Query('facilityId') facilityId?: string,
  ) {
    const minVol = minVolume ? parseFloat(minVolume) : 0;
    const where: any = {
      status: StorageUnitStatus.AVAILABLE,
    };

    if (facilityId) {
      where.facilityId = facilityId;
    }

    const units = await this.prisma.storageUnit.findMany({
      where,
      include: {
        facility: { select: { id: true, name: true, code: true, address: true } },
        unitType: {
          include: {
            pricingRules: {
              orderBy: { effectiveFrom: 'desc' },
              take: 1,
            },
          },
        },
      },
      take: 20,
    });

    const results = units
      .map((u) => {
        const sizeM2 = Number(u.unitType.size) || 1.0;
        // Chiều cao mặc định 2.0m hoặc trích xuất từ tên CBM nếu có
        const volumeM3 = sizeM2 * 2.0;
        const activePrice = u.unitType.pricingRules?.[0]?.price
          ? Number(u.unitType.pricingRules[0].price)
          : Number(u.unitType.depositAmount) || 500000;

        return {
          unitId: u.id,
          unitNumber: u.unitNumber,
          unitTypeId: u.unitTypeId,
          unitTypeName: u.unitType.name,
          facilityId: u.facilityId,
          facilityName: u.facility.name,
          sizeM2,
          volumeM3: Math.round(volumeM3 * 10) / 10,
          pricePerMonth: activePrice,
          depositAmount: Number(u.unitType.depositAmount) || 0,
        };
      })
      .filter((u) => u.volumeM3 >= minVol)
      .sort((a, b) => a.volumeM3 - b.volumeM3);

    return results;
  }

  /**
   * Tính báo giá chuẩn kèm chính sách chiết khấu kỳ hạn
   */
  @ApiOperation({ summary: 'Internal: Báo giá theo loại kho và số tháng' })
  @Post('pricing/quote')
  async getPricingQuote(@Body() body: { unitTypeId: string; months: number }) {
    const { unitTypeId, months } = body;
    const unitType = await this.prisma.storageUnitType.findUnique({
      where: { id: unitTypeId },
      include: {
        pricingRules: { orderBy: { effectiveFrom: 'desc' }, take: 1 },
      },
    });

    if (!unitType) {
      return { error: 'Không tìm thấy loại ngăn kho' };
    }

    const price = unitType.pricingRules?.[0]?.price
      ? Number(unitType.pricingRules[0].price)
      : Number(unitType.depositAmount);
    const depositAmount = Number(unitType.depositAmount);

    let discountPercent = 0;
    if (months >= 12) discountPercent = 15;
    else if (months >= 6) discountPercent = 10;
    else if (months >= 3) discountPercent = 5;

    const grossFee = price * months;
    const netFee = Math.round(grossFee * ((100 - discountPercent) / 100));

    return {
      unitTypeName: unitType.name,
      monthlyPrice: price,
      months,
      discountPercent,
      netRentalFee: netFee,
      depositAmount,
      totalInitialPayment: netFee + depositAmount,
    };
  }

  /**
   * Tra cứu hợp đồng của người dùng (x-user-id truyền từ NestJS JWT)
   */
  @ApiOperation({ summary: 'Internal: Tra cứu hợp đồng của khách hàng' })
  @Get('contracts/me')
  async getMyContracts(@Headers('x-user-id') userId: string) {
    if (!userId || userId === 'guest') {
      return [];
    }

    const contracts = await this.prisma.rentalContract.findMany({
      where: {
        customerId: userId,
        status: { in: [ContractStatus.ACTIVE, ContractStatus.OVERDUE] },
      },
      include: {
        contractItems: {
          include: {
            unit: {
              include: {
                facility: { select: { name: true } },
                unitType: { select: { name: true, size: true } },
              },
            },
          },
        },
      },
      orderBy: { endDate: 'asc' },
    });

    return contracts.map((c) => ({
      contractId: c.id,
      contractCode: c.contractCode,
      status: c.status,
      startDate: c.startDate.toISOString().slice(0, 10),
      endDate: c.endDate.toISOString().slice(0, 10),
      facilityName: c.contractItems[0]?.unit?.facility?.name || '',
      unitNumber: c.contractItems[0]?.unit?.unitNumber || '',
      unitTypeName: c.contractItems[0]?.unit?.unitType?.name || '',
    }));
  }

  /**
   * Trích xuất vector đặc trưng hợp đồng cho mô hình Machine Learning
   */
  @ApiOperation({ summary: 'Internal: Lấy đặc trưng hợp đồng cho model ML' })
  @Get('contracts/me/features')
  async getContractFeatures(@Headers('x-user-id') userId: string) {
    if (!userId || userId === 'guest') {
      return [];
    }

    const contracts = await this.prisma.rentalContract.findMany({
      where: {
        customerId: userId,
        status: { in: [ContractStatus.ACTIVE, ContractStatus.OVERDUE] },
      },
      include: {
        contractItems: {
          include: { unit: { include: { unitType: true } } },
        },
        overdueRecords: true,
      },
    });

    const featuresList = [];

    for (const c of contracts) {
      const now = new Date();
      const start = new Date(c.startDate);
      const rentedMonths = Math.max(
        1,
        Math.round((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30)),
      );

      const sizeM2 = c.contractItems[0]?.unit?.unitType?.size || 6.0;
      const overdueCount = c.overdueRecords.length;

      featuresList.push({
        contractId: c.id,
        contractCode: c.contractCode,
        endDate: c.endDate.toISOString().slice(0, 10),
        rented_months: rentedMonths,
        unit_size_m2: Number(sizeM2),
        price_per_m2_ratio: 1.0,
        late_payments_count: overdueCount,
        overdue_fees_count: overdueCount,
        access_count_last_30d: 4,
        days_since_last_access: 5,
        support_tickets_count: 0,
        has_discount: 1,
        month_of_year: c.endDate.getMonth() + 1,
        facility_occupancy_rate: 0.85,
      });
    }

    return featuresList;
  }
}
