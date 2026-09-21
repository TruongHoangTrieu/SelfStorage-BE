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
import { ExtraChargeStatus, DiscountStatus } from '@prisma/client';

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

  async getPolicies(policyType?: string, facilityId?: number) {
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

  async getPolicyById(id: number) {
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

  async createExtraCharge(userId: number, dto: CreateExtraChargeDto) {
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

  async getExtraCharges(contractId?: number, reservationId?: number) {
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

    if (discount.maxUsage && discount._count.discountUsages >= discount.maxUsage) {
      throw new BadRequestException('Mã giảm giá đã hết lượt sử dụng');
    }

    return discount;
  }
}
