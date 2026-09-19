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
import {
  ReservationStatus,
  ReservationRentalPeriodUnit,
  StorageUnitStatus,
  ContractStatus,
  ContractItemStatus,
  HandoverType,
  AccessCodeStatus,
  Prisma,
} from '@prisma/client';
import { UserRole } from '../common/enums/role.enum';

@Injectable()
export class HandoversService {
  private readonly logger = new Logger(HandoversService.name);

  constructor(private readonly prisma: PrismaService) {}

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
    return endDate;
  }

  /**
   * Helper to verify facility staff assignment scope
   */
  private async verifyStaffFacilityScope(
    userId: number,
    userRole: string,
    facilityId: number,
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
  async getReservationForCheckIn(reservationId: number, user: any) {
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

      // Create RentalContract
      const contract = await tx.rentalContract.create({
        data: {
          contractCode,
          reservationId: reservation.id,
          customerId: reservation.customerId,
          startDate,
          endDate,
          status: ContractStatus.ACTIVE,
          signedAt: new Date(),
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
              : Prisma.JsonNull,
            inspectionDate: new Date(),
          },
        });
        handoverRecords.push(handoverRecord);
      }

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
}
