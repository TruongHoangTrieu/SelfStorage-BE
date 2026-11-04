import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreatePolicyDto } from './dto/create-policy.dto';
import { CreateFeeTypeDto } from './dto/create-fee-type.dto';
import { CreateExtraChargeDto } from './dto/create-extra-charge.dto';
import { CreateDiscountDto } from './dto/create-discount.dto';
import {
  ExtraChargeStatus,
  DiscountStatus,
  ContractStatus,
  AccessCodeStatus,
  StorageUnitStatus,
} from '@prisma/client';

@Injectable()
export class OperationsService {
  constructor(private readonly prisma: PrismaService) {}

  // ==================== POLICIES ====================

  async createPolicy(dto: CreatePolicyDto) {
    if (dto.facilityId) {
      const facility = await this.prisma.facility.findUnique({
        where: { id: dto.facilityId },
      });
      if (!facility) {
        throw new NotFoundException(`Facility with ID ${dto.facilityId} not found`);
      }
    }

    return this.prisma.policy.create({
      data: {
        facilityId: dto.facilityId,
        policyType: dto.policyType.toUpperCase(),
        name: dto.name,
        description: dto.description,
        value: dto.value,
        valueType: dto.valueType || 'JSON',
        effectiveFrom: new Date(dto.effectiveFrom),
        effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
        status: dto.status || 'ACTIVE',
      },
    });
  }

  async getPolicies(policyType?: string, facilityId?: string) {
    const where: any = { status: 'ACTIVE' };
    if (policyType) {
      where.policyType = policyType.toUpperCase();
    }
    if (facilityId) {
      where.OR = [{ facilityId: facilityId }, { facilityId: null }];
    }

    return this.prisma.policy.findMany({
      where,
      orderBy: { effectiveFrom: 'desc' },
      include: { facility: { select: { id: true, name: true, code: true } } },
    });
  }

  async getPolicyById(id: string) {
    const policy = await this.prisma.policy.findUnique({
      where: { id },
      include: { facility: true },
    });
    if (!policy) {
      throw new NotFoundException(`Policy with ID ${id} not found`);
    }
    return policy;
  }

  // ==================== FEE TYPES & EXTRA CHARGES ====================

  async createFeeType(dto: CreateFeeTypeDto) {
    const existing = await this.prisma.feeType.findUnique({
      where: { code: dto.code },
    });
    if (existing) {
      throw new ConflictException(`FeeType with code '${dto.code}' already exists`);
    }

    return this.prisma.feeType.create({
      data: {
        name: dto.name,
        code: dto.code.toUpperCase(),
        description: dto.description,
        defaultAmount: dto.defaultAmount,
        amountType: dto.amountType || 'FIXED',
        appliesTo: dto.appliesTo || 'GENERAL',
        status: dto.status || 'ACTIVE',
      },
    });
  }

  async getFeeTypes() {
    return this.prisma.feeType.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateFeeType(id: string, dto: Partial<CreateFeeTypeDto>) {
    let feeType = null;
    if (id && id.length === 24 && /^[0-9a-fA-F]{24}$/.test(id)) {
      feeType = await this.prisma.feeType.findUnique({
        where: { id },
      });
    }
    if (!feeType && dto.code) {
      feeType = await this.prisma.feeType.findUnique({
        where: { code: dto.code.toUpperCase() },
      });
    }
    if (!feeType) {
      throw new NotFoundException(`FeeType with ID or Code ${id} not found`);
    }

    return this.prisma.feeType.update({
      where: { id: feeType.id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.code && { code: dto.code.toUpperCase() }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.defaultAmount !== undefined && { defaultAmount: Number(dto.defaultAmount) }),
        ...(dto.amountType && { amountType: dto.amountType }),
        ...(dto.appliesTo && { appliesTo: dto.appliesTo }),
        ...(dto.status && { status: dto.status }),
      },
    });
  }

  async deleteFeeType(id: string) {
    const feeType = await this.prisma.feeType.findUnique({
      where: { id },
    });
    if (!feeType) {
      throw new NotFoundException(`FeeType with ID ${id} not found`);
    }

    return this.prisma.feeType.delete({
      where: { id },
    });
  }

  async toggleFeeTypeStatus(id: string) {
    const feeType = await this.prisma.feeType.findUnique({
      where: { id },
    });
    if (!feeType) {
      throw new NotFoundException(`FeeType with ID ${id} not found`);
    }

    const nextStatus = feeType.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    return this.prisma.feeType.update({
      where: { id },
      data: { status: nextStatus },
    });
  }

  async createExtraCharge(userId: string, dto: CreateExtraChargeDto) {
    const feeType = await this.prisma.feeType.findUnique({
      where: { id: dto.feeTypeId },
    });
    if (!feeType) {
      throw new NotFoundException(`FeeType with ID ${dto.feeTypeId} not found`);
    }

    if (!dto.contractId && !dto.reservationId) {
      throw new BadRequestException('Either contractId or reservationId must be provided');
    }

    if (dto.contractId) {
      const contract = await this.prisma.rentalContract.findUnique({
        where: { id: dto.contractId },
      });
      if (!contract) {
        throw new NotFoundException(`RentalContract with ID ${dto.contractId} not found`);
      }
    }

    if (dto.reservationId) {
      const reservation = await this.prisma.reservation.findUnique({
        where: { id: dto.reservationId },
      });
      if (!reservation) {
        throw new NotFoundException(`Reservation with ID ${dto.reservationId} not found`);
      }
    }

    return this.prisma.extraCharge.create({
      data: {
        contractId: dto.contractId,
        reservationId: dto.reservationId,
        feeTypeId: dto.feeTypeId,
        amount: dto.amount,
        reason: dto.reason,
        status: ExtraChargeStatus.PENDING,
        createdBy: userId,
      },
      include: {
        feeType: true,
        creator: { select: { id: true, fullName: true, email: true } },
      },
    });
  }

  async getExtraCharges(contractId?: string, reservationId?: string) {
    const where: any = {};
    if (contractId) where.contractId = contractId;
    if (reservationId) where.reservationId = reservationId;

    return this.prisma.extraCharge.findMany({
      where,
      include: {
        feeType: true,
        creator: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ==================== DISCOUNTS ====================

  async createDiscount(dto: CreateDiscountDto) {
    const existing = await this.prisma.discount.findUnique({
      where: { code: dto.code.toUpperCase() },
    });
    if (existing) {
      throw new ConflictException(`Discount code '${dto.code}' already exists`);
    }

    return this.prisma.discount.create({
      data: {
        code: dto.code.toUpperCase(),
        name: dto.name,
        description: dto.description,
        discountType: dto.discountType || 'PERCENTAGE',
        value: dto.value,
        startDate: new Date(dto.startDate),
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        maxUsage: dto.maxUsage,
        status: dto.status || DiscountStatus.ACTIVE,
      },
    });
  }

  async getDiscounts() {
    return this.prisma.discount.findMany({
      include: {
        _count: {
          select: { discountUsages: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async validateDiscountCode(code: string) {
    const discount = await this.prisma.discount.findUnique({
      where: { code: code.toUpperCase() },
      include: {
        _count: {
          select: { discountUsages: true },
        },
      },
    });

    if (!discount || discount.status !== DiscountStatus.ACTIVE) {
      throw new BadRequestException('Mã giảm giá không tồn tại hoặc đã hết hiệu lực');
    }

    const now = new Date();
    if (discount.startDate > now || (discount.endDate && discount.endDate < now)) {
      throw new BadRequestException('Mã giảm giá đã hết hạn sử dụng');
    }

    const usageCount = (discount as any)._count?.discountUsages ?? 0;
    if (discount.maxUsage && usageCount >= discount.maxUsage) {
      throw new BadRequestException('Mã giảm giá đã hết lượt sử dụng');
    }

    return discount;
  }

  // ==================== SYSTEM ANALYTICS & REPORTS ====================

  async getMultiBranchAnalytics() {
    const facilities = await this.prisma.facility.findMany({
      include: {
        storageUnits: {
          select: {
            id: true,
            status: true,
            unitNumber: true,
            unitTypeId: true,
          },
        },
        storageUnitTypes: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const [payments, contracts] = await Promise.all([
      this.prisma.payment.findMany({
        select: {
          id: true,
          amount: true,
          status: true,
          paymentType: true,
          paymentMethod: true,
          paymentCode: true,
          paidAt: true,
          createdAt: true,
          reservation: {
            select: {
              id: true,
              facilityId: true,
              customer: {
                select: { id: true, fullName: true, email: true },
              },
              items: {
                select: {
                  unit: { select: { id: true, unitNumber: true } },
                },
              },
            },
          },
          contract: {
            select: {
              id: true,
              contractCode: true,
              customer: {
                select: { id: true, fullName: true, email: true },
              },
              reservation: {
                select: {
                  facilityId: true,
                },
              },
              contractItems: {
                select: {
                  unit: { select: { id: true, unitNumber: true, facilityId: true } },
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.rentalContract.findMany({
        select: {
          id: true,
          contractCode: true,
          status: true,
          reservation: { select: { facilityId: true } },
          contractItems: {
            select: {
              unit: { select: { facilityId: true } },
            },
          },
          overdueRecords: {
            where: { status: 'OPEN' },
            select: {
              id: true,
              overdueDays: true,
              overdueFee: true,
            },
          },
        },
      }),
    ]);

    const branchData = (facilities as any[]).map((fac: any) => {
      const fId = String(fac.id);
      let actualRevenue = 0;
      let depositVault = 0;
      let rentalRevenue = 0;
      let pendingRevenue = 0;
      let paidCount = 0;

      (payments as any[]).forEach((p: any) => {
        const pFacId =
          p.reservation?.facilityId ||
          p.contract?.reservation?.facilityId ||
          p.contract?.contractItems?.[0]?.unit?.facilityId;

        if (pFacId && String(pFacId) === fId) {
          const amt = Number(p.amount) || 0;
          const isPaid = p.status === 'PAID';
          if (isPaid) {
            actualRevenue += amt;
            paidCount++;
            if (p.paymentType === 'DEPOSIT') {
              depositVault += amt;
            } else {
              rentalRevenue += amt;
            }
          } else if (p.status === 'PENDING') {
            pendingRevenue += amt;
          }
        }
      });

      const totalUnits = fac.storageUnits?.length || 0;
      const occupiedUnits =
        fac.storageUnits?.filter(
          (u: any) => u.status === 'OCCUPIED' || u.status === 'RENTED',
        ).length || 0;
      const occupancyRate =
        totalUnits > 0 ? (occupiedUnits / totalUnits) * 100 : 0;

      let district = fac.district || '';
      if (!district && fac.address) {
        if (fac.address.includes('Thủ Đức')) district = 'TP. Thủ Đức';
        else if (fac.address.includes('Quận 1')) district = 'Quận 1';
        else if (fac.address.includes('Quận 7')) district = 'Quận 7';
        else if (fac.address.includes('Bình Thạnh')) district = 'Q. Bình Thạnh';
        else if (fac.address.includes('Quận 6')) district = 'Quận 6';
      }

      const facContracts = (contracts as any[]).filter((c: any) => {
        const cFacId = c.reservation?.facilityId || c.contractItems?.[0]?.unit?.facilityId;
        return String(cFacId) === fId;
      });

      const activeContracts = facContracts.filter((c: any) => c.status === 'ACTIVE').length;
      const overdueContracts = facContracts.filter((c: any) => c.status === 'OVERDUE').length;
      const overdueFeeSum = facContracts.reduce((sum: number, c: any) => {
        const openOverdue = c.overdueRecords || [];
        return sum + openOverdue.reduce((s: number, o: any) => s + (Number(o.overdueFee) || 0), 0);
      }, 0);

      return {
        facilityId: fId,
        id: fId,
        name: fac.name,
        code: fac.code,
        address: fac.address,
        district,
        actualRevenue,
        depositVault,
        rentalRevenue,
        pendingRevenue,
        paidCount,
        totalUnits,
        occupiedUnits,
        occupancyRate: Math.round(occupancyRate * 10) / 10,
        activeContracts,
        overdueContracts,
        overdueFeeSum,
        storageUnitTypes: fac.storageUnitTypes || [],
        storageUnits: fac.storageUnits || [],
      };
    });

    const totalSystemRevenue = branchData.reduce((acc, b) => acc + b.actualRevenue, 0);
    const totalDeposit = branchData.reduce((acc, b) => acc + b.depositVault, 0);
    const totalRental = branchData.reduce((acc, b) => acc + b.rentalRevenue, 0);
    const totalPending = branchData.reduce((acc, b) => acc + b.pendingRevenue, 0);
    const totalPaidTransactions = branchData.reduce((acc, b) => acc + b.paidCount, 0);
    const totalUnits = branchData.reduce((acc, b) => acc + b.totalUnits, 0);
    const totalOccupiedUnits = branchData.reduce((acc, b) => acc + b.occupiedUnits, 0);
    const systemOccupancyRate =
      totalUnits > 0 ? Math.round((totalOccupiedUnits / totalUnits) * 1000) / 10 : 0;

    // Map formatted transactions for dashboard feed
    const mappedTransactions = payments.slice(0, 50).map((p) => {
      const res = p.reservation;
      const con = p.contract;
      const custName =
        con?.customer?.fullName || res?.customer?.fullName || 'Khách hàng';
      const unitNumber =
        con?.contractItems?.[0]?.unit?.unitNumber ||
        res?.items?.[0]?.unit?.unitNumber ||
        'Ô kho';
      const facId =
        res?.facilityId ||
        con?.reservation?.facilityId ||
        con?.contractItems?.[0]?.unit?.facilityId;
      const fac = facilities.find((f) => String(f.id) === String(facId));

      return {
        id: p.id,
        paymentCode: p.paymentCode,
        amount: Number(p.amount) || 0,
        status: p.status,
        paymentType: p.paymentType,
        paymentMethod: p.paymentMethod,
        paidAt: p.paidAt,
        createdAt: p.createdAt,
        tenant: custName,
        unit: unitNumber,
        facilityId: facId,
        facilityName: fac?.name || 'Hệ thống kho',
        facilityCode: fac?.code || 'FAC',
      };
    });

    return {
      success: true,
      summary: {
        totalSystemRevenue,
        totalDeposit,
        totalRental,
        totalPending,
        totalPaidTransactions,
        totalUnits,
        totalOccupiedUnits,
        systemOccupancyRate,
        totalActiveContracts: branchData.reduce((acc, b) => acc + (b.activeContracts || 0), 0),
        totalOverdueContracts: branchData.reduce((acc, b) => acc + (b.overdueContracts || 0), 0),
        totalOverdueFeeSum: branchData.reduce((acc, b) => acc + (b.overdueFeeSum || 0), 0),
      },
      branchData,
      facilities,
      payments: mappedTransactions,
    };
  }

  async getReportContracts() {
    const rawContracts = await this.prisma.rentalContract.findMany({
      include: {
        customer: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
          },
        },
        reservation: {
          select: {
            id: true,
            reservationCode: true,
            facilityId: true,
            facility: {
              select: { id: true, name: true, code: true, address: true },
            },
          },
        },
        contractItems: {
          include: {
            unit: {
              select: {
                id: true,
                unitNumber: true,
                floor: true,
                facilityId: true,
                facility: { select: { id: true, name: true, code: true, address: true } },
                unitType: { select: { id: true, name: true, code: true, size: true, sizeUnit: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const now = Date.now();
    return rawContracts.map((c) => {
      const firstItem = c.contractItems?.[0];
      const facility = c.reservation?.facility || firstItem?.unit?.facility;
      const unit = firstItem?.unit;
      const endDateMs = new Date(c.endDate).getTime();
      const overdueDays =
        endDateMs < now && c.status !== ContractStatus.TERMINATED && c.status !== 'COMPLETED'
          ? Math.ceil((now - endDateMs) / (1000 * 60 * 60 * 24))
          : 0;

      return {
        ...c,
        contractNumber: c.contractCode,
        customerName: c.customer?.fullName || 'Khách hàng',
        customerPhone: c.customer?.phone || '',
        facilityId: facility?.id || c.reservation?.facilityId || unit?.facilityId,
        facilityName: facility?.name || 'Chi nhánh kho',
        facility,
        storageUnit: unit,
        unitNumber: unit?.unitNumber || 'N/A',
        unitTypeName: unit?.unitType?.name || 'Tiêu chuẩn',
        monthlyRent: firstItem?.rentalPrice || 0,
        rentalFee: firstItem?.rentalPrice || 0,
        depositAmount: firstItem?.depositAmount || 0,
        overdueDays,
      };
    });
  }

  async terminateOverdueContract(contractId: string) {
    const contract = await this.prisma.rentalContract.findUnique({
      where: { id: contractId },
      include: { contractItems: true },
    });

    if (!contract) {
      throw new NotFoundException(`Hợp đồng #${contractId} không tồn tại`);
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.rentalContract.update({
        where: { id: contractId },
        data: { status: ContractStatus.TERMINATED },
      });

      for (const item of contract.contractItems) {
        await tx.contractItem.update({
          where: { id: item.id },
          data: {
            status: 'RETURNED',
            accessCodeStatus: AccessCodeStatus.REVOKED,
          },
        });

        await tx.storageUnit.update({
          where: { id: item.unitId },
          data: { status: StorageUnitStatus.AVAILABLE },
        });
      }

      return updated;
    });
  }
}
