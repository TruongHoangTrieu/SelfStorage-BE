import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { UpdateReservationDto } from './dto/update-reservation.dto';
import { CancelReservationDto } from './dto/cancel-reservation.dto';
import { FilterReservationDto } from './dto/filter-reservation.dto';
import { CheckAvailabilityDto } from './dto/check-availability.dto';
import {
  ReservationStatus,
  ReservationRentalPeriodUnit,
  StorageUnitStatus,
  FacilityStatus,
  Prisma,
} from '@prisma/client';
import { UserRole } from '../common/enums/role.enum';

@Injectable()
export class ReservationsService {
  private readonly logger = new Logger(ReservationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Check storage unit availability for a given facility and unit type
   */
  async checkAvailability(dto: CheckAvailabilityDto) {
    // 1. Verify Facility exists and is active
    const facility = await this.prisma.facility.findUnique({
      where: { id: dto.facilityId },
    });

    if (!facility) {
      throw new NotFoundException(`Facility with ID ${dto.facilityId} not found`);
    }

    if (facility.status !== FacilityStatus.ACTIVE) {
      throw new BadRequestException(`Facility '${facility.name}' is currently not active`);
    }

    // 2. Verify StorageUnitType exists
    const unitType = await this.prisma.storageUnitType.findUnique({
      where: { id: dto.unitTypeId },
    });

    if (!unitType) {
      throw new NotFoundException(`Storage unit type with ID ${dto.unitTypeId} not found`);
    }

    // 3. Verify UnitType belongs to the specified Facility
    if (unitType.facilityId !== dto.facilityId) {
      throw new BadRequestException(
        `Storage unit type (ID ${dto.unitTypeId}) belongs to facility ID ${unitType.facilityId}, not to facility ID ${dto.facilityId}`,
      );
    }

    // 4. Query available storage units
    const availableUnits = await this.prisma.storageUnit.findMany({
      where: {
        facilityId: dto.facilityId,
        unitTypeId: dto.unitTypeId,
        status: StorageUnitStatus.AVAILABLE,
      },
      select: {
        id: true,
        unitNumber: true,
        floor: true,
        status: true,
        condition: true,
      },
      orderBy: { unitNumber: 'asc' },
    });

    // 5. Query active PricingRule for this unit type
    const now = new Date();
    let activePricingRule = await this.prisma.pricingRule.findFirst({
      where: {
        unitTypeId: dto.unitTypeId,
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
      },
      orderBy: { effectiveFrom: 'desc' },
    });

    // Fallback to any recent pricing rule if none matches current window
    if (!activePricingRule) {
      activePricingRule = await this.prisma.pricingRule.findFirst({
        where: { unitTypeId: dto.unitTypeId },
        orderBy: { effectiveFrom: 'desc' },
      });
    }

    const unitPrice = activePricingRule ? activePricingRule.price : new Prisma.Decimal(0);
    const depositAmount = unitType.depositAmount;

    let estimatedTotal: Prisma.Decimal | null = null;
    if (dto.rentalPeriod && dto.rentalPeriod > 0) {
      estimatedTotal = unitPrice.mul(dto.rentalPeriod).add(depositAmount);
    }

    return {
      facility: {
        id: facility.id,
        name: facility.name,
        code: facility.code,
        address: facility.address,
        phone: facility.phone,
        email: facility.email,
      },
      unitType: {
        id: unitType.id,
        name: unitType.name,
        code: unitType.code,
        size: unitType.size,
        sizeUnit: unitType.sizeUnit,
        depositAmount: unitType.depositAmount,
      },
      availableCount: availableUnits.length,
      availableUnits,
      pricing: {
        rentalPricePerPeriod: unitPrice,
        depositAmount,
        estimatedTotal,
      },
    };
  }

  /**
   * Create a new reservation for the authenticated customer.
   * Uses Prisma transaction and atomic status updates to prevent race conditions / double bookings.
   */
  async create(customerId: number, dto: CreateReservationDto) {
    // 1. Verify Facility exists and is active
    const facility = await this.prisma.facility.findUnique({
      where: { id: dto.facilityId },
    });

    if (!facility) {
      throw new NotFoundException(`Facility with ID ${dto.facilityId} not found`);
    }

    if (facility.status !== FacilityStatus.ACTIVE) {
      throw new BadRequestException(`Facility '${facility.name}' is currently not active`);
    }

    // 2. Verify StorageUnitType exists and is active
    const unitType = await this.prisma.storageUnitType.findUnique({
      where: { id: dto.unitTypeId },
    });

    if (!unitType) {
      throw new NotFoundException(`Storage unit type with ID ${dto.unitTypeId} not found`);
    }

    // 3. Verify UnitType belongs to the specified Facility
    if (unitType.facilityId !== dto.facilityId) {
      throw new BadRequestException(
        `Storage unit type (ID ${dto.unitTypeId}) belongs to facility ID ${unitType.facilityId}, not to facility ID ${dto.facilityId}`,
      );
    }

    // 4. Validate appointment date
    const appointmentDate = new Date(dto.appointmentDate);
    if (isNaN(appointmentDate.getTime())) {
      throw new BadRequestException('appointmentDate must be a valid ISO 8601 date string');
    }

    // Allow a 5-minute buffer in the past to account for network latency
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    if (appointmentDate < fiveMinutesAgo) {
      throw new BadRequestException('appointmentDate cannot be in the past');
    }

    // 5. Calculate pricing
    const now = new Date();
    let pricingRule = await this.prisma.pricingRule.findFirst({
      where: {
        unitTypeId: dto.unitTypeId,
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
      },
      orderBy: { effectiveFrom: 'desc' },
    });

    if (!pricingRule) {
      pricingRule = await this.prisma.pricingRule.findFirst({
        where: { unitTypeId: dto.unitTypeId },
        orderBy: { effectiveFrom: 'desc' },
      });
    }

    const price = pricingRule ? pricingRule.price : new Prisma.Decimal(0);
    const depositAmount = unitType.depositAmount;
    const totalAmount = price.mul(dto.rentalPeriod).add(depositAmount);

    // 6. Execute atomic transaction to hold unit and create reservation
    return this.prisma.$transaction(async (tx) => {
      // Find an available storage unit
      const availableUnit = await tx.storageUnit.findFirst({
        where: {
          facilityId: dto.facilityId,
          unitTypeId: dto.unitTypeId,
          status: StorageUnitStatus.AVAILABLE,
        },
        orderBy: { id: 'asc' },
      });

      if (!availableUnit) {
        throw new ConflictException(
          `No available storage unit of type '${unitType.name}' in facility '${facility.name}'`,
        );
      }

      // Optimistically lock & reserve the unit
      const lockResult = await tx.storageUnit.updateMany({
        where: {
          id: availableUnit.id,
          status: StorageUnitStatus.AVAILABLE,
        },
        data: {
          status: StorageUnitStatus.RESERVED,
        },
      });

      if (lockResult.count === 0) {
        throw new ConflictException(
          'The selected storage unit was reserved by another request. Please try again.',
        );
      }

      // Generate a unique reservation code: RSV-YYYYMMDD-XXXXXX
      const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase();
      const reservationCode = `RSV-${datePart}-${randomPart}`;

      // Create Reservation and ReservationItem
      const reservation = await tx.reservation.create({
        data: {
          reservationCode,
          customerId,
          facilityId: dto.facilityId,
          rentalPeriod: dto.rentalPeriod,
          rentalPeriodUnit: dto.rentalPeriodUnit || ReservationRentalPeriodUnit.MONTHS,
          appointmentDate,
          status: ReservationStatus.PENDING,
          totalAmount,
          items: {
            create: {
              unitTypeId: dto.unitTypeId,
              unitId: availableUnit.id,
              price,
              depositAmount,
            },
          },
        },
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
            },
          },
        },
      });

      return reservation;
    });
  }

  /**
   * Get list of reservations with pagination, filtering, and role-based access control.
   */
  async findAll(filter: FilterReservationDto = {}, user: any) {
    const page = Number(filter.page) || 1;
    const limit = Number(filter.limit) || 10;
    const skip = (page - 1) * limit;

    const where: Prisma.ReservationWhereInput = {};

    const userRole = typeof user.role === 'string' ? user.role : user.role?.name;

    // Customers can ONLY see their own reservations
    if (userRole === UserRole.STORAGE_CUSTOMER) {
      where.customerId = user.id;
    } else {
      // Staff / Manager / Admin can filter by customerId or facilityId
      if (filter.customerId) {
        where.customerId = filter.customerId;
      }
      if (filter.facilityId) {
        where.facilityId = filter.facilityId;
      }
    }

    if (filter.status) {
      where.status = filter.status;
    }

    if (filter.phone) {
      where.customer = {
        ...((where.customer as Prisma.UserWhereInput) || {}),
        phone: { contains: filter.phone.trim() },
      };
    }

    if (filter.search) {
      const search = filter.search.trim();
      where.OR = [
        { reservationCode: { contains: search, mode: 'insensitive' } },
        { customer: { phone: { contains: search } } },
        { customer: { fullName: { contains: search, mode: 'insensitive' } } },
        { customer: { email: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [total, data] = await Promise.all([
      this.prisma.reservation.count({ where }),
      this.prisma.reservation.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          facility: {
            select: {
              id: true,
              name: true,
              code: true,
              address: true,
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
            },
          },
        },
      }),
    ]);

    return {
      data,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Get a single reservation by ID with ownership enforcement
   */
  async findById(id: number, user: any) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id },
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

    if (!reservation) {
      throw new NotFoundException(`Reservation with ID ${id} not found`);
    }

    const userRole = typeof user.role === 'string' ? user.role : user.role?.name;

    // Enforce ownership for STORAGE_CUSTOMER
    if (userRole === UserRole.STORAGE_CUSTOMER && reservation.customerId !== user.id) {
      throw new ForbiddenException('You do not have permission to view this reservation');
    }

    return reservation;
  }

  /**
   * Update a reservation with ownership and status validation
   */
  async update(id: number, dto: UpdateReservationDto, user: any) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id },
      include: {
        items: true,
      },
    });

    if (!reservation) {
      throw new NotFoundException(`Reservation with ID ${id} not found`);
    }

    const userRole = typeof user.role === 'string' ? user.role : user.role?.name;

    // Ownership check
    if (userRole === UserRole.STORAGE_CUSTOMER && reservation.customerId !== user.id) {
      throw new ForbiddenException('You do not have permission to modify this reservation');
    }

    // Status check
    if (
      reservation.status === ReservationStatus.CANCELLED ||
      reservation.status === ReservationStatus.COMPLETED ||
      reservation.status === ReservationStatus.EXPIRED
    ) {
      throw new BadRequestException(
        `Cannot update reservation with status '${reservation.status}'`,
      );
    }

    let appointmentDate = reservation.appointmentDate;
    if (dto.appointmentDate) {
      const parsedDate = new Date(dto.appointmentDate);
      if (isNaN(parsedDate.getTime())) {
        throw new BadRequestException('appointmentDate must be a valid ISO 8601 date string');
      }
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      if (parsedDate < fiveMinutesAgo) {
        throw new BadRequestException('appointmentDate cannot be in the past');
      }
      appointmentDate = parsedDate;
    }

    let totalAmount = reservation.totalAmount;
    if (dto.rentalPeriod && dto.rentalPeriod !== reservation.rentalPeriod) {
      const firstItem = reservation.items[0];
      if (firstItem) {
        totalAmount = firstItem.price.mul(dto.rentalPeriod).add(firstItem.depositAmount);
      }
    }

    return this.prisma.reservation.update({
      where: { id },
      data: {
        appointmentDate: dto.appointmentDate ? appointmentDate : undefined,
        rentalPeriod: dto.rentalPeriod || undefined,
        rentalPeriodUnit: dto.rentalPeriodUnit || undefined,
        totalAmount: dto.rentalPeriod ? totalAmount : undefined,
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
          },
        },
      },
    });
  }

  /**
   * Cancel a reservation and release the held storage unit back to AVAILABLE.
   */
  async cancel(id: number, user: any, dto?: CancelReservationDto) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id },
      include: {
        items: true,
      },
    });

    if (!reservation) {
      throw new NotFoundException(`Reservation with ID ${id} not found`);
    }

    const userRole = typeof user.role === 'string' ? user.role : user.role?.name;

    // Ownership check
    if (userRole === UserRole.STORAGE_CUSTOMER && reservation.customerId !== user.id) {
      throw new ForbiddenException('You do not have permission to cancel this reservation');
    }

    // Status validation
    if (reservation.status === ReservationStatus.CANCELLED) {
      throw new BadRequestException('Reservation is already cancelled');
    }

    if (reservation.status === ReservationStatus.COMPLETED) {
      throw new BadRequestException('Cannot cancel a completed reservation');
    }

    if (reservation.status === ReservationStatus.EXPIRED) {
      throw new BadRequestException('Cannot cancel an expired reservation');
    }

    // Transaction to release units and update status
    return this.prisma.$transaction(async (tx) => {
      // Release any held storage unit
      for (const item of reservation.items) {
        if (item.unitId) {
          await tx.storageUnit.updateMany({
            where: {
              id: item.unitId,
              status: StorageUnitStatus.RESERVED,
            },
            data: {
              status: StorageUnitStatus.AVAILABLE,
            },
          });
        }
      }

      // Update reservation status to CANCELLED
      const updatedReservation = await tx.reservation.update({
        where: { id },
        data: {
          status: ReservationStatus.CANCELLED,
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
            },
          },
        },
      });

      return updatedReservation;
    });
  }
}
