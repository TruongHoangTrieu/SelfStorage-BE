import { Test, TestingModule } from '@nestjs/testing';
import { ReservationsService } from './reservations.service';
import { PrismaService } from '../database/prisma.service';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import {
  FacilityStatus,
  StorageUnitStatus,
  ReservationStatus,
  ReservationRentalPeriodUnit,
  Prisma,
} from '@prisma/client';
import { UserRole } from '../common/enums/role.enum';

describe('ReservationsService', () => {
  let service: ReservationsService;
  let prisma: PrismaService;

  const mockFacility = {
    id: 1,
    name: 'Main Facility',
    code: 'FAC-001',
    address: '123 Test St',
    status: FacilityStatus.ACTIVE,
  };

  const mockUnitType = {
    id: 10,
    facilityId: 1,
    name: 'Small Storage',
    code: 'S-01',
    depositAmount: new Prisma.Decimal(500000),
    status: 'ACTIVE',
  };

  const mockPricingRule = {
    id: 100,
    unitTypeId: 10,
    price: new Prisma.Decimal(1000000),
    effectiveFrom: new Date('2026-01-01'),
    effectiveTo: null,
  };

  const mockStorageUnit = {
    id: 200,
    facilityId: 1,
    unitTypeId: 10,
    unitNumber: 'A-101',
    status: StorageUnitStatus.AVAILABLE,
  };

  const mockPrismaService = {
    facility: {
      findUnique: jest.fn(),
    },
    storageUnitType: {
      findUnique: jest.fn(),
    },
    storageUnit: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
    },
    pricingRule: {
      findFirst: jest.fn(),
    },
    reservation: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn((callback) => callback(mockPrismaService)),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReservationsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<ReservationsService>(ReservationsService);
    prisma = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();
  });

  describe('checkAvailability', () => {
    it('should return availability info when facility and unit type exist', async () => {
      mockPrismaService.facility.findUnique.mockResolvedValue(mockFacility);
      mockPrismaService.storageUnitType.findUnique.mockResolvedValue(mockUnitType);
      mockPrismaService.storageUnit.findMany.mockResolvedValue([mockStorageUnit]);
      mockPrismaService.pricingRule.findFirst.mockResolvedValue(mockPricingRule);

      const result = await service.checkAvailability({
        facilityId: 1,
        unitTypeId: 10,
        rentalPeriod: 2,
      });

      expect(result.availableCount).toBe(1);
      expect(result.facility.id).toBe(1);
      expect(result.unitType.id).toBe(10);
      expect(result.pricing.rentalPricePerPeriod).toEqual(new Prisma.Decimal(1000000));
      expect(result.pricing.estimatedTotal).toEqual(new Prisma.Decimal(2500000)); // 1M*2 + 500k deposit
    });

    it('should throw 404 if facility is not found', async () => {
      mockPrismaService.facility.findUnique.mockResolvedValue(null);

      await expect(
        service.checkAvailability({ facilityId: 999, unitTypeId: 10 }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw 400 if unitType belongs to another facility', async () => {
      mockPrismaService.facility.findUnique.mockResolvedValue(mockFacility);
      mockPrismaService.storageUnitType.findUnique.mockResolvedValue({
        ...mockUnitType,
        facilityId: 2, // mismatch
      });

      await expect(
        service.checkAvailability({ facilityId: 1, unitTypeId: 10 }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('create', () => {
    const validDto = {
      facilityId: 1,
      unitTypeId: 10,
      appointmentDate: new Date(Date.now() + 86400000).toISOString(),
      rentalPeriod: 3,
    };

    it('should successfully create a reservation and hold the unit atomically', async () => {
      mockPrismaService.facility.findUnique.mockResolvedValue(mockFacility);
      mockPrismaService.storageUnitType.findUnique.mockResolvedValue(mockUnitType);
      mockPrismaService.pricingRule.findFirst.mockResolvedValue(mockPricingRule);
      mockPrismaService.storageUnit.findFirst.mockResolvedValue(mockStorageUnit);
      mockPrismaService.storageUnit.updateMany.mockResolvedValue({ count: 1 });
      mockPrismaService.reservation.create.mockResolvedValue({
        id: 1,
        reservationCode: 'RSV-20260918-ABCDEF',
        customerId: 5,
        status: ReservationStatus.PENDING,
        totalAmount: new Prisma.Decimal(3500000), // 1M * 3 + 500k
      });

      const result = await service.create(5, validDto);

      expect(result.id).toBe(1);
      expect(mockPrismaService.storageUnit.updateMany).toHaveBeenCalledWith({
        where: { id: mockStorageUnit.id, status: StorageUnitStatus.AVAILABLE },
        data: { status: StorageUnitStatus.RESERVED },
      });
    });

    it('should throw ConflictException if no storage unit is available', async () => {
      mockPrismaService.facility.findUnique.mockResolvedValue(mockFacility);
      mockPrismaService.storageUnitType.findUnique.mockResolvedValue(mockUnitType);
      mockPrismaService.pricingRule.findFirst.mockResolvedValue(mockPricingRule);
      mockPrismaService.storageUnit.findFirst.mockResolvedValue(null);

      await expect(service.create(5, validDto)).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException if concurrent request reserved the unit (race condition protection)', async () => {
      mockPrismaService.facility.findUnique.mockResolvedValue(mockFacility);
      mockPrismaService.storageUnitType.findUnique.mockResolvedValue(mockUnitType);
      mockPrismaService.pricingRule.findFirst.mockResolvedValue(mockPricingRule);
      mockPrismaService.storageUnit.findFirst.mockResolvedValue(mockStorageUnit);
      // Simulate another request got the unit first
      mockPrismaService.storageUnit.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.create(5, validDto)).rejects.toThrow(ConflictException);
    });
  });

  describe('ownership and authorization', () => {
    it('should throw ForbiddenException if customer views someone elses reservation', async () => {
      mockPrismaService.reservation.findUnique.mockResolvedValue({
        id: 1,
        customerId: 99, // Owned by user 99
      });

      const customerUser = { id: 5, role: UserRole.STORAGE_CUSTOMER };

      await expect(service.findById(1, customerUser)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should allow customer to view their own reservation', async () => {
      mockPrismaService.reservation.findUnique.mockResolvedValue({
        id: 1,
        customerId: 5,
      });

      const customerUser = { id: 5, role: UserRole.STORAGE_CUSTOMER };
      const result = await service.findById(1, customerUser);

      expect(result.id).toBe(1);
    });

    it('should allow staff or manager to view any reservation', async () => {
      mockPrismaService.reservation.findUnique.mockResolvedValue({
        id: 1,
        customerId: 99,
      });

      const staffUser = { id: 2, role: UserRole.FACILITY_STAFF };
      const result = await service.findById(1, staffUser);

      expect(result.id).toBe(1);
    });
  });

  describe('findAll', () => {
    it('should filter by search keyword (phone/name/code) for staff', async () => {
      mockPrismaService.reservation.count.mockResolvedValue(1);
      mockPrismaService.reservation.findMany.mockResolvedValue([
        { id: 1, reservationCode: 'RSV-123' },
      ]);

      const staffUser = { id: 2, role: UserRole.FACILITY_STAFF };
      const result = await service.findAll(
        { search: '0901234567', page: 1, limit: 10 },
        staffUser,
      );

      expect(result.data.length).toBe(1);
      expect(mockPrismaService.reservation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.any(Array),
          }),
        }),
      );
    });
  });

  describe('update', () => {
    const validFutureDate = new Date(Date.now() + 86400000 * 5).toISOString();
    const existingReservation = {
      id: 1,
      customerId: 5,
      rentalPeriod: 3,
      appointmentDate: new Date('2026-10-01'),
      status: ReservationStatus.PENDING,
      totalAmount: new Prisma.Decimal(3500000),
      items: [
        {
          id: 10,
          price: new Prisma.Decimal(1000000),
          depositAmount: new Prisma.Decimal(500000),
          unitId: 200,
        },
      ],
    };

    it('should update appointmentDate without affecting assigned StorageUnit', async () => {
      mockPrismaService.reservation.findUnique.mockResolvedValue(existingReservation);
      mockPrismaService.reservation.update.mockResolvedValue({
        ...existingReservation,
        appointmentDate: new Date(validFutureDate),
      });

      const customerUser = { id: 5, role: UserRole.STORAGE_CUSTOMER };
      const result = await service.update(
        1,
        { appointmentDate: validFutureDate },
        customerUser,
      );

      expect(mockPrismaService.reservation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: expect.objectContaining({
            appointmentDate: new Date(validFutureDate),
          }),
        }),
      );
      // Verify storage unit was NOT modified or released
      expect(mockPrismaService.storageUnit.updateMany).not.toHaveBeenCalled();
    });

    it('should update rentalPeriod and recalculate totalAmount correctly without changing unit assignment', async () => {
      mockPrismaService.reservation.findUnique.mockResolvedValue(existingReservation);
      // 1M * 6 + 500k deposit = 6.5M
      const expectedNewTotal = new Prisma.Decimal(6500000);
      mockPrismaService.reservation.update.mockResolvedValue({
        ...existingReservation,
        rentalPeriod: 6,
        totalAmount: expectedNewTotal,
      });

      const customerUser = { id: 5, role: UserRole.STORAGE_CUSTOMER };
      const result = await service.update(
        1,
        { rentalPeriod: 6 },
        customerUser,
      );

      expect(mockPrismaService.reservation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: expect.objectContaining({
            rentalPeriod: 6,
            totalAmount: expectedNewTotal,
          }),
        }),
      );
      // Storage unit assignment remains intact
      expect(mockPrismaService.storageUnit.updateMany).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException if appointmentDate is in the past', async () => {
      mockPrismaService.reservation.findUnique.mockResolvedValue(existingReservation);
      const pastDate = new Date(Date.now() - 86400000).toISOString();

      const customerUser = { id: 5, role: UserRole.STORAGE_CUSTOMER };
      await expect(
        service.update(1, { appointmentDate: pastDate }, customerUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if updating a cancelled reservation', async () => {
      mockPrismaService.reservation.findUnique.mockResolvedValue({
        ...existingReservation,
        status: ReservationStatus.CANCELLED,
      });

      const customerUser = { id: 5, role: UserRole.STORAGE_CUSTOMER };
      await expect(
        service.update(1, { rentalPeriod: 6 }, customerUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ForbiddenException if customer attempts to update someone elses reservation', async () => {
      mockPrismaService.reservation.findUnique.mockResolvedValue(existingReservation); // customerId is 5

      const otherCustomer = { id: 99, role: UserRole.STORAGE_CUSTOMER };
      await expect(
        service.update(1, { rentalPeriod: 6 }, otherCustomer),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('cancel', () => {
    it('should cancel reservation and release held unit back to AVAILABLE', async () => {
      mockPrismaService.reservation.findUnique.mockResolvedValue({
        id: 1,
        customerId: 5,
        status: ReservationStatus.PENDING,
        items: [{ id: 10, unitId: 200 }],
      });
      mockPrismaService.storageUnit.updateMany.mockResolvedValue({ count: 1 });
      mockPrismaService.reservation.update.mockResolvedValue({
        id: 1,
        status: ReservationStatus.CANCELLED,
      });

      const customerUser = { id: 5, role: UserRole.STORAGE_CUSTOMER };
      const result = await service.cancel(1, customerUser);

      expect(result.status).toBe(ReservationStatus.CANCELLED);
      expect(mockPrismaService.storageUnit.updateMany).toHaveBeenCalledWith({
        where: { id: 200, status: StorageUnitStatus.RESERVED },
        data: { status: StorageUnitStatus.AVAILABLE },
      });
    });

    it('should throw BadRequestException if reservation is already cancelled', async () => {
      mockPrismaService.reservation.findUnique.mockResolvedValue({
        id: 1,
        customerId: 5,
        status: ReservationStatus.CANCELLED,
        items: [],
      });

      const customerUser = { id: 5, role: UserRole.STORAGE_CUSTOMER };
      await expect(service.cancel(1, customerUser)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
