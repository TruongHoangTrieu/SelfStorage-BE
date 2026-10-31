import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CheckInDto } from './dto/check-in.dto';
import { CheckOutDto } from './dto/check-out.dto';
import { LogCccdAccessDto } from './dto/log-cccd-access.dto';
import {
  ReservationStatus,
  ReservationRentalPeriodUnit,
  StorageUnitStatus,
  ContractStatus,
  ContractItemStatus,
  HandoverType,
  AccessCodeStatus,
  PaymentStatus,
  PaymentType,
  PaymentMethod,
  ExtraChargeStatus,
  Prisma,
} from '@prisma/client';
import { UserRole } from '../common/enums/role.enum';
import { encryptCccd, decryptCccd, maskCccd, hashCccd } from '../common/utils/crypto.util';
import { CloudinaryService } from '../common/cloudinary/cloudinary.service';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class HandoversService {
  private readonly logger = new Logger(HandoversService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  /**
   * Helper to calculate contract end date based on period and unit
   */
  private calculateEndDate(
    startDate: Date,
    period: number,
    unit: ReservationRentalPeriodUnit,
  ): Date {
    const endDate = new Date(startDate.getTime());
    switch (unit) {
      case ReservationRentalPeriodUnit.DAYS:
        endDate.setDate(endDate.getDate() + period);
        break;
      case ReservationRentalPeriodUnit.WEEKS:
        endDate.setDate(endDate.getDate() + period * 7);
        break;
      case ReservationRentalPeriodUnit.YEARS:
        endDate.setFullYear(endDate.getFullYear() + period);
        break;
      case ReservationRentalPeriodUnit.MONTHS:
      default:
        endDate.setMonth(endDate.getMonth() + period);
        break;
    }
    // Chu kỳ hợp đồng: Ngày kết thúc chu kỳ thuê là trước ngày tới hạn thanh toán 1 ngày (ví dụ: bắt đầu 29/10 thì kết thúc 28/11)
    endDate.setDate(endDate.getDate() - 1);
    endDate.setHours(23, 59, 59, 999);
    return endDate;
  }

  /**
   * Helper to verify facility staff assignment scope
   */
  private async verifyStaffFacilityScope(
    userId: string,
    userRole: string,
    facilityId: string,
    facilityName?: string,
  ): Promise<void> {
    if (userRole === UserRole.FACILITY_STAFF) {
      const now = new Date();
      const assignment = await this.prisma.staffFacilityAssignment.findFirst({
        where: {
          userId,
          facilityId,
          OR: [{ endedAt: null }, { endedAt: { gte: now } }],
        },
      });

      if (!assignment) {
        throw new ForbiddenException(
          `Staff is not assigned to facility '${facilityName || facilityId}'`,
        );
      }
    }
  }

  /**
   * Get reservation details prepared for check-in verification
   */
  async getReservationForCheckIn(reservationId: string, user: any) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      include: {
        facility: {
          select: {
            id: true,
            name: true,
            code: true,
            address: true,
            phone: true,
            email: true,
          },
        },
        customer: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
            status: true,
            identityType: true,
            identityNumber: true,
            identityIssueDate: true,
            identityIssuePlace: true,
            identityAddress: true,
            identityFrontUrl: true,
            identityBackUrl: true,
            isIdentityVerified: true,
          },
        },
        items: {
          include: {
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
            unit: {
              select: {
                id: true,
                unitNumber: true,
                floor: true,
                status: true,
                condition: true,
              },
            },
          },
        },
        rentalContract: {
          select: {
            id: true,
            contractCode: true,
            status: true,
            startDate: true,
            endDate: true,
          },
        },
      },
    });

    if (!reservation) {
      throw new NotFoundException(
        `Reservation with ID ${reservationId} not found`,
      );
    }

    const userRole = typeof user.role === 'string' ? user.role : user.role?.name;
    await this.verifyStaffFacilityScope(
      user.id,
      userRole,
      reservation.facilityId,
      reservation.facility.name,
    );

    // Audit Logging for customer handover profile access
    try {
      if (user?.id) {
        await this.prisma.activityLog.create({
          data: {
            userId: user.id,
            action: 'VIEW_CUSTOMER_HANDOVER_PROFILE',
            entityType: 'RESERVATION',
            entityId: reservation.id,
            description: `Nhân viên đã truy cập hồ sơ bàn giao cho đơn #${reservation.reservationCode || reservation.id}`,
          },
        });
      }
    } catch (logErr: any) {
      this.logger.warn(`Could not record ActivityLog for handover profile access: ${logErr.message}`);
    }

    // Mask identityNumber before returning to prevent unauthorized plain leak
    if (reservation.customer?.identityNumber) {
      (reservation.customer as any).maskedIdentityNumber = maskCccd(reservation.customer.identityNumber);
      delete (reservation.customer as any).identityNumber;
    }

    // Generate fresh signed URLs for CCCD front and back (valid 5 minutes)
    if (reservation.customer?.identityFrontUrl) {
      reservation.customer.identityFrontUrl = this.cloudinaryService.generateSignedCccdUrl(
        reservation.customer.identityFrontUrl,
        300,
      );
    }
    if (reservation.customer?.identityBackUrl) {
      reservation.customer.identityBackUrl = this.cloudinaryService.generateSignedCccdUrl(
        reservation.customer.identityBackUrl,
        300,
      );
    }

    return reservation;
  }

  /**
   * Perform Check-in and Handover for a reservation
   * Creates RentalContract, ContractItem(s), HandoverRecord, updates StorageUnit to OCCUPIED and Reservation to COMPLETED.
   * All wrapped in an atomic Prisma transaction with concurrency protection.
   */
  async checkIn(dto: CheckInDto, user: any) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: dto.reservationId },
      include: {
        facility: true,
        customer: true,
        items: {
          include: {
            unit: true,
            unitType: true,
          },
        },
        rentalContract: true,
      },
    });

    if (!reservation) {
      throw new NotFoundException(
        `Reservation with ID ${dto.reservationId} not found`,
      );
    }

    // 1. Validate reservation status
    if (reservation.status === ReservationStatus.CANCELLED) {
      throw new BadRequestException('Cannot check in a cancelled reservation');
    }

    if (reservation.status === ReservationStatus.EXPIRED) {
      throw new BadRequestException('Cannot check in an expired reservation');
    }

    if (
      reservation.status === ReservationStatus.COMPLETED ||
      reservation.rentalContract !== null
    ) {
      throw new BadRequestException(
        'Reservation has already been checked in and completed',
      );
    }

    if (
      reservation.status !== ReservationStatus.PENDING &&
      reservation.status !== ReservationStatus.CONFIRMED
    ) {
      throw new BadRequestException(
        `Reservation has invalid status for check-in: '${reservation.status}'`,
      );
    }

    // 2. Validate reservation items
    if (!reservation.items || reservation.items.length === 0) {
      throw new BadRequestException(
        'Reservation does not contain any items to check in',
      );
    }

    for (const item of reservation.items) {
      if (!item.unitId) {
        throw new BadRequestException(
          `Reservation item (ID ${item.id}) does not have an assigned storage unit`,
        );
      }
    }

    // 3. Verify Staff Facility Scope
    const userRole = typeof user.role === 'string' ? user.role : user.role?.name;
    await this.verifyStaffFacilityScope(
      user.id,
      userRole,
      reservation.facilityId,
      reservation.facility.name,
    );

    // 4. Calculate contract dates
    const startDate = new Date();
    const endDate = this.calculateEndDate(
      startDate,
      reservation.rentalPeriod,
      reservation.rentalPeriodUnit,
    );

    // 5. Generate unique contract code: CON-YYYYMMDD-XXXXXX
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase();
    const contractCode = `CON-${datePart}-${randomPart}`;

    // 6. Execute atomic transaction
    return this.prisma.$transaction(async (tx) => {
      // Validate all storage units are currently RESERVED and atomically lock them to OCCUPIED
      for (const item of reservation.items) {
        const unit = await tx.storageUnit.findUnique({
          where: { id: item.unitId! },
        });

        if (!unit) {
          throw new NotFoundException(
            `Storage unit with ID ${item.unitId} not found`,
          );
        }

        if (unit.status !== StorageUnitStatus.RESERVED) {
          throw new ConflictException(
            `Storage unit '${unit.unitNumber}' is not in RESERVED status (current status: ${unit.status})`,
          );
        }

        // Conditional atomic update
        const lockResult = await tx.storageUnit.updateMany({
          where: {
            id: item.unitId!,
            status: StorageUnitStatus.RESERVED,
          },
          data: {
            status: StorageUnitStatus.OCCUPIED,
          },
        });

        if (lockResult.count === 0) {
          throw new ConflictException(
            `Storage unit '${unit.unitNumber}' could not be checked in due to concurrent modification`,
          );
        }
      }

      // Resolve customer identity info for contract snapshot
      let customerIdentityType = reservation.customer?.identityType;
      let customerIdentityNumber = reservation.customer?.identityNumber;
      let customerAddress = reservation.customer?.identityAddress;
      let customerIdentityFrontUrl = dto.identityFrontUrl || reservation.customer?.identityFrontUrl;
      let customerIdentityBackUrl = dto.identityBackUrl || reservation.customer?.identityBackUrl;

      const userIdentityUpdate: any = {};
      if (dto.identityNumber && dto.identityNumber.trim()) {
        const cleanId = dto.identityNumber.trim();
        customerIdentityType = dto.identityType || customerIdentityType || 'CCCD';
        customerIdentityNumber = encryptCccd(cleanId);
        customerAddress = dto.identityAddress?.trim() || customerAddress;
        userIdentityUpdate.identityType = customerIdentityType;
        userIdentityUpdate.identityNumber = customerIdentityNumber;
        userIdentityUpdate.identityHash = hashCccd(cleanId);
        userIdentityUpdate.identityAddress = customerAddress;
      }
      if (dto.identityFrontUrl) {
        userIdentityUpdate.identityFrontUrl = dto.identityFrontUrl;
      }
      if (dto.identityBackUrl) {
        userIdentityUpdate.identityBackUrl = dto.identityBackUrl;
      }
      if (dto.isIdentityVerified !== undefined) {
        userIdentityUpdate.isIdentityVerified = dto.isIdentityVerified;
      } else if (dto.identityNumber || dto.identityFrontUrl) {
        userIdentityUpdate.isIdentityVerified = true;
      }

      if (Object.keys(userIdentityUpdate).length > 0) {
        await tx.user.update({
          where: { id: reservation.customerId },
          data: userIdentityUpdate,
        });
      }

      // Create RentalContract with identity snapshot
      const contract = await tx.rentalContract.create({
        data: {
          contractCode,
          reservationId: reservation.id,
          customerId: reservation.customerId,
          startDate,
          endDate,
          status: ContractStatus.ACTIVE,
          signedAt: new Date(),
          customerIdentityType,
          customerIdentityNumber,
          customerIdentityFrontUrl,
          customerIdentityBackUrl,
          customerAddress,
        },
      });

      const contractItems = [];
      const handoverRecords = [];

      // Create ContractItem and HandoverRecord for each reservation item
      for (const item of reservation.items) {
        // Generate secure 6-digit access code PIN
        const accessCode = Math.floor(100000 + Math.random() * 900000).toString();

        const contractItem = await tx.contractItem.create({
          data: {
            contractId: contract.id,
            unitId: item.unitId!,
            rentalPrice: item.price,
            depositAmount: item.depositAmount,
            accessCode,
            accessCodeStatus: AccessCodeStatus.ACTIVE,
            status: ContractItemStatus.ACTIVE,
          },
          include: {
            unit: {
              select: {
                id: true,
                unitNumber: true,
                floor: true,
                status: true,
              },
            },
          },
        });
        contractItems.push(contractItem);

        const handoverRecord = await tx.handoverRecord.create({
          data: {
            contractItemId: contractItem.id,
            staffId: user.id,
            type: HandoverType.CHECK_IN,
            condition: dto.condition,
            notes: dto.notes || null,
            photos: dto.photos
              ? (dto.photos as Prisma.InputJsonValue)
              : null,
            inspectionDate: new Date(),
          },
        });
        handoverRecords.push(handoverRecord);
      }

      // Update any pending payment records for this reservation to PAID
      await tx.payment.updateMany({
        where: {
          reservationId: reservation.id,
          status: PaymentStatus.PENDING,
        },
        data: {
          status: PaymentStatus.PAID,
          paidAt: new Date(),
        },
      });

      // Transition reservation status to COMPLETED
      const updatedReservation = await tx.reservation.update({
        where: { id: reservation.id },
        data: {
          status: ReservationStatus.COMPLETED,
        },
        include: {
          facility: {
            select: {
              id: true,
              name: true,
              code: true,
              address: true,
            },
          },
          customer: {
            select: {
              id: true,
              fullName: true,
              email: true,
              phone: true,
            },
          },
        },
      });

      return {
        message: 'Check-in and handover completed successfully',
        reservation: {
          id: updatedReservation.id,
          reservationCode: updatedReservation.reservationCode,
          status: updatedReservation.status,
          facility: updatedReservation.facility,
          customer: updatedReservation.customer,
        },
        contract: {
          id: contract.id,
          contractCode: contract.contractCode,
          status: contract.status,
          startDate: contract.startDate,
          endDate: contract.endDate,
          signedAt: contract.signedAt,
        },
        contractItems: contractItems.map((ci) => ({
          id: ci.id,
          unitId: ci.unitId,
          unitNumber: ci.unit.unitNumber,
          rentalPrice: ci.rentalPrice,
          depositAmount: ci.depositAmount,
          accessCode: ci.accessCode,
          accessCodeStatus: ci.accessCodeStatus,
          status: ci.status,
        })),
        handoverRecords: handoverRecords.map((hr) => ({
          id: hr.id,
          contractItemId: hr.contractItemId,
          staffId: hr.staffId,
          type: hr.type,
          condition: hr.condition,
          notes: hr.notes,
          inspectionDate: hr.inspectionDate,
        })),
      };
    });
  }

  /**
   * Tra cứu thông tin hợp đồng để chuẩn bị Check-out / Trả kho và đối soát hiện trạng
   */
  async getContractForCheckOut(contractId: string, user: any) {
    const contract = await this.prisma.rentalContract.findUnique({
      where: { id: contractId },
      include: {
        reservation: {
          include: {
            facility: {
              select: {
                id: true,
                name: true,
                code: true,
                address: true,
                phone: true,
                email: true,
              },
            },
          },
        },
        customer: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
            identityType: true,
            identityNumber: true,
            identityAddress: true,
          },
        },
        contractItems: {
          include: {
            unit: {
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
            },
            storedItems: true,
            handoverRecords: {
              where: { type: HandoverType.CHECK_IN },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        },
        extraCharges: {
          include: {
            feeType: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
          },
        },
      },
    });

    if (!contract) {
      throw new NotFoundException(`Hợp đồng #${contractId} không tồn tại`);
    }

    const userRole = typeof user.role === 'string' ? user.role : user.role?.name;
    await this.verifyStaffFacilityScope(
      user.id,
      userRole,
      contract.reservation.facilityId,
      contract.reservation.facility.name,
    );

    // Tính toán tài chính
    const totalDepositAmount = contract.contractItems.reduce(
      (sum, item) => sum + (item.depositAmount || 0),
      0,
    );
    const pendingExtraCharges = contract.extraCharges.filter(
      (ec) => ec.status === ExtraChargeStatus.PENDING,
    );
    const unpaidExtraChargesAmount = pendingExtraCharges.reduce(
      (sum, ec) => sum + (ec.amount || 0),
      0,
    );

    // Mask số CCCD nếu có
    let maskedIdentity = null;
    if (contract.customer?.identityNumber) {
      try {
        const raw = decryptCccd(contract.customer.identityNumber);
        maskedIdentity = maskCccd(raw);
      } catch {
        maskedIdentity = '***';
      }
    }

    return {
      contract: {
        id: contract.id,
        contractCode: contract.contractCode,
        status: contract.status,
        startDate: contract.startDate,
        endDate: contract.endDate,
        signedAt: contract.signedAt,
      },
      facility: contract.reservation.facility,
      customer: {
        id: contract.customer.id,
        fullName: contract.customer.fullName,
        email: contract.customer.email,
        phone: contract.customer.phone,
        identityType: contract.customer.identityType,
        identityNumberMasked: maskedIdentity,
        identityAddress: contract.customer.identityAddress,
      },
      financialSummary: {
        totalDepositAmount,
        unpaidExtraChargesAmount,
        estimatedRefundAmount: Math.max(0, totalDepositAmount - unpaidExtraChargesAmount),
        pendingExtraCharges: pendingExtraCharges.map((ec) => ({
          id: ec.id,
          feeType: ec.feeType?.name,
          amount: ec.amount,
          reason: ec.reason,
          status: ec.status,
        })),
      },
      units: contract.contractItems.map((ci) => ({
        contractItemId: ci.id,
        unitId: ci.unitId,
        unitNumber: ci.unit.unitNumber,
        floor: ci.unit.floor,
        unitStatus: ci.unit.status,
        unitType: ci.unit.unitType,
        itemStatus: ci.status,
        accessCodeStatus: ci.accessCodeStatus,
        depositAmount: ci.depositAmount,
        storedItemsCount: ci.storedItems.length,
        storedItems: ci.storedItems.map((si) => ({
          id: si.id,
          name: si.name,
          category: si.category,
          quantity: si.quantity,
          photoUrl: si.photoUrl,
        })),
        checkInInspection: ci.handoverRecords[0]
          ? {
              condition: ci.handoverRecords[0].condition,
              notes: ci.handoverRecords[0].notes,
              photos: ci.handoverRecords[0].photos,
              inspectionDate: ci.handoverRecords[0].inspectionDate,
            }
          : null,
      })),
      canCheckOut:
        contract.status === ContractStatus.ACTIVE ||
        contract.status === ContractStatus.OVERDUE,
    };
  }

  /**
   * Thực hiện Check-out & Bàn giao hoàn trả kho (Lập biên bản trả kho, thu hồi mã PIN, giải phóng kho và thanh toán cọc)
   */
  async checkOut(dto: CheckOutDto, user: any) {
    const contract = await this.prisma.rentalContract.findUnique({
      where: { id: dto.contractId },
      include: {
        reservation: {
          include: {
            facility: true,
          },
        },
        customer: {
          select: { id: true, fullName: true, email: true, phone: true },
        },
        contractItems: {
          include: {
            unit: true,
          },
        },
        extraCharges: true,
      },
    });

    if (!contract) {
      throw new NotFoundException(`Hợp đồng #${dto.contractId} không tồn tại`);
    }

    const userRole = typeof user.role === 'string' ? user.role : user.role?.name;
    await this.verifyStaffFacilityScope(
      user.id,
      userRole,
      contract.reservation.facilityId,
      contract.reservation.facility.name,
    );

    if (
      contract.status !== ContractStatus.ACTIVE &&
      contract.status !== ContractStatus.OVERDUE
    ) {
      throw new BadRequestException(
        `Không thể thực hiện trả kho cho hợp đồng có trạng thái '${contract.status}' (Chỉ cho phép ACTIVE hoặc OVERDUE)`,
      );
    }

    const activeItems = contract.contractItems.filter(
      (i) => i.status !== ContractItemStatus.RETURNED,
    );
    if (activeItems.length === 0) {
      throw new BadRequestException(
        'Tất cả ngăn kho trong hợp đồng này đã được hoàn trả trước đó',
      );
    }

    const totalDeposit = contract.contractItems.reduce(
      (sum, item) => sum + (item.depositAmount || 0),
      0,
    );
    const unpaidExtraCharges = contract.extraCharges
      .filter((ec) => ec.status === ExtraChargeStatus.PENDING)
      .reduce((sum, ec) => sum + (ec.amount || 0), 0);

    const damageFee = dto.damageFee || 0;
    const cleaningFee = dto.cleaningFee || 0;
    const netRefundAmount =
      dto.refundAmount !== undefined
        ? dto.refundAmount
        : Math.max(0, totalDeposit - damageFee - cleaningFee - unpaidExtraCharges);

    return this.prisma.$transaction(async (tx) => {
      const handoverRecords = [];
      const targetUnitStatus =
        dto.unitCondition || StorageUnitStatus.AVAILABLE;

      for (const item of activeItems) {
        // 1. Tạo HandoverRecord CHECK_OUT
        const hr = await tx.handoverRecord.create({
          data: {
            contractItemId: item.id,
            staffId: user.id,
            type: HandoverType.CHECK_OUT,
            condition: dto.condition,
            notes: dto.notes || null,
            photos: dto.photos
              ? (dto.photos as Prisma.InputJsonValue)
              : null,
            inspectionDate: new Date(),
          },
        });
        handoverRecords.push(hr);

        // 2. Cập nhật ContractItem -> RETURNED & thu hồi mã PIN
        await tx.contractItem.update({
          where: { id: item.id },
          data: {
            status: ContractItemStatus.RETURNED,
            accessCodeStatus: AccessCodeStatus.REVOKED,
          },
        });

        // 3. Giải phóng StorageUnit -> AVAILABLE (hoặc UNDER_MAINTENANCE)
        await tx.storageUnit.update({
          where: { id: item.unitId },
          data: {
            status: targetUnitStatus,
          },
        });
      }

      // 4. Tạo ExtraCharge nếu có phí hư hại hoặc vệ sinh
      const createdCharges = [];
      if (damageFee > 0) {
        const feeType = await tx.feeType.findFirst({
          where: { status: 'ACTIVE' },
        });
        if (feeType) {
          const ec = await tx.extraCharge.create({
            data: {
              contractId: contract.id,
              feeTypeId: feeType.id,
              amount: damageFee,
              reason: 'Khấu trừ tiền cọc: Phí bồi thường hư hỏng trang thiết bị khi trả kho',
              status: ExtraChargeStatus.PAID,
              createdBy: user.id,
            },
          });
          createdCharges.push(ec);
        }
      }

      if (cleaningFee > 0) {
        const feeType = await tx.feeType.findFirst({
          where: { status: 'ACTIVE' },
        });
        if (feeType) {
          const ec = await tx.extraCharge.create({
            data: {
              contractId: contract.id,
              feeTypeId: feeType.id,
              amount: cleaningFee,
              reason: 'Khấu trừ tiền cọc: Phí dọn dẹp vệ sinh rác thải khi trả kho',
              status: ExtraChargeStatus.PAID,
              createdBy: user.id,
            },
          });
          createdCharges.push(ec);
        }
      }

      // 5. Tạo Payment record hoàn trả cọc
      let refundPayment = null;
      if (dto.refundDeposit !== false && netRefundAmount > 0) {
        const paymentCode = `PAY-REF-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
        refundPayment = await tx.payment.create({
          data: {
            paymentCode,
            contractId: contract.id,
            paymentType: PaymentType.REFUND,
            amount: netRefundAmount,
            paymentMethod: PaymentMethod.BANK_TRANSFER,
            status: PaymentStatus.PAID,
            paidAt: new Date(),
          },
        });
      }

      // 6. Cập nhật RentalContract -> COMPLETED
      const updatedContract = await tx.rentalContract.update({
        where: { id: contract.id },
        data: {
          status: ContractStatus.COMPLETED,
        },
      });

      return {
        message: 'Thủ tục trả kho và bàn giao hoàn tất thành công',
        contract: {
          id: updatedContract.id,
          contractCode: updatedContract.contractCode,
          status: updatedContract.status,
        },
        customer: contract.customer,
        facility: contract.reservation.facility,
        handoverRecords: handoverRecords.map((hr) => ({
          id: hr.id,
          contractItemId: hr.contractItemId,
          type: hr.type,
          condition: hr.condition,
          notes: hr.notes,
          photos: hr.photos,
          inspectionDate: hr.inspectionDate,
        })),
        unitsReturned: activeItems.map((item) => ({
          contractItemId: item.id,
          unitId: item.unitId,
          unitNumber: item.unit.unitNumber,
          unitStatus: targetUnitStatus,
          itemStatus: ContractItemStatus.RETURNED,
          accessCodeStatus: AccessCodeStatus.REVOKED,
        })),
        financialSettlement: {
          totalDeposit,
          damageFee,
          cleaningFee,
          unpaidExtraCharges,
          refundDepositAmount: netRefundAmount,
          refundPayment: refundPayment
            ? {
                id: refundPayment.id,
                paymentCode: refundPayment.paymentCode,
                amount: refundPayment.amount,
                status: refundPayment.status,
              }
            : null,
        },
      };
    });
  }

  /**
   * Record Audit Log when staff unmasks or prints contract with CCCD and return decrypted value
   */
  async logCccdAccess(dto: LogCccdAccessDto, user: any, clientIp?: string) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: dto.reservationId },
      include: {
        customer: true,
        facility: true,
      },
    });

    if (!reservation) {
      throw new NotFoundException(`Reservation #${dto.reservationId} not found`);
    }

    const userRole = typeof user.role === 'string' ? user.role : user.role?.name;
    await this.verifyStaffFacilityScope(
      user.id,
      userRole,
      reservation.facilityId,
      reservation.facility?.name,
    );

    const isPrint = dto.action === 'PRINT_CONTRACT_WITH_CCCD';
    const actionDesc = isPrint
      ? `Nhân viên đã xuất in hợp đồng chứa thông tin CCCD cho đơn #${reservation.reservationCode || reservation.id} (Khách: ${dto.customerName || reservation.customer?.fullName || 'N/A'}) | IP: ${clientIp || 'N/A'}`
      : `Nhân viên đã mở xem toàn bộ số CCCD cho đơn #${reservation.reservationCode || reservation.id} (Khách: ${dto.customerName || reservation.customer?.fullName || 'N/A'}) | IP: ${clientIp || 'N/A'}`;

    await this.prisma.activityLog.create({
      data: {
        userId: user.id,
        action: isPrint ? 'PRINT_CONTRACT_WITH_CCCD' : 'VIEW_UNMASKED_CCCD',
        entityType: 'RESERVATION',
        entityId: reservation.id,
        description: actionDesc,
      },
    });

    const decryptedNumber = reservation.customer?.identityNumber
      ? decryptCccd(reservation.customer.identityNumber)
      : null;

    // Generate fresh 5-minute signed URLs for private authenticated CCCD images
    const frontSignedUrl = reservation.customer?.identityFrontUrl
      ? this.cloudinaryService.generateSignedCccdUrl(reservation.customer.identityFrontUrl, 300)
      : null;
    const backSignedUrl = reservation.customer?.identityBackUrl
      ? this.cloudinaryService.generateSignedCccdUrl(reservation.customer.identityBackUrl, 300)
      : null;

    return {
      success: true,
      identityType: reservation.customer?.identityType || 'CCCD',
      identityNumber: decryptedNumber,
      identityIssueDate: reservation.customer?.identityIssueDate,
      identityIssuePlace: reservation.customer?.identityIssuePlace,
      identityAddress: reservation.customer?.identityAddress,
      identityFrontUrl: frontSignedUrl,
      identityBackUrl: backSignedUrl,
    };
  }

  /**
   * Tự động xóa vĩnh viễn ảnh CCCD của các hợp đồng đã hoàn tất / thanh lý quá 30 ngày
   * Tuân thủ quy định về giới hạn thời gian lưu trữ dữ liệu cá nhân (Nghị định 13/2023/NĐ-CP)
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanupExpiredCccdPhotos() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    try {
      const expiredContracts = await this.prisma.rentalContract.findMany({
        where: {
          status: { in: [ContractStatus.COMPLETED, ContractStatus.TERMINATED] },
          endDate: { lte: thirtyDaysAgo },
          OR: [
            { customerIdentityFrontUrl: { not: null } },
            { customerIdentityBackUrl: { not: null } },
          ],
        },
        select: {
          id: true,
          contractCode: true,
          customerIdentityFrontUrl: true,
          customerIdentityBackUrl: true,
        },
      });

      for (const contract of expiredContracts) {
        if (contract.customerIdentityFrontUrl) {
          await this.cloudinaryService.deleteImage(contract.customerIdentityFrontUrl, 'authenticated');
        }
        if (contract.customerIdentityBackUrl) {
          await this.cloudinaryService.deleteImage(contract.customerIdentityBackUrl, 'authenticated');
        }

        await this.prisma.rentalContract.update({
          where: { id: contract.id },
          data: {
            customerIdentityFrontUrl: null,
            customerIdentityBackUrl: null,
          },
        });

        this.logger.log(
          `[Auto-deletion] Đã tự động xóa vĩnh viễn 2 ảnh CCCD của hợp đồng #${contract.contractCode} (Hết hạn lưu trữ 30 ngày)`,
        );
      }
    } catch (err: any) {
      this.logger.error(`Error running cleanupExpiredCccdPhotos: ${err.message}`);
    }
  }
}

