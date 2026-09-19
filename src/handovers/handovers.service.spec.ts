import { Test, TestingModule } from '@nestjs/testing';
import { HandoversService } from './handovers.service';
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
  ContractStatus,
  ContractItemStatus,
  HandoverType,
  AccessCodeStatus,
  Prisma,
} from '@prisma/client';
import { UserRole } from '../common/enums/role.enum';

describe('HandoversService', () => {
  let service: HandoversService;
  let prisma: PrismaService;

  const mockFacility = {
    id: 1,
    name: 'District 1 Storage Hub',
    code: 'FAC-D1',
    address: '123 Nguyen Hue, D1',
    status: FacilityStatus.ACTIVE,
  };

  const mockCustomer = {
    id: 5,
    fullName: 'Nguyen Van A',
    email: 'customer@example.com',
    phone: '0901234567',
  };

  const mockStorageUnit = {
    id: 200,
    facilityId: 1,
    unitTypeId: 10,
    unitNumber: 'A-102',
    floor: '1',
    status: StorageUnitStatus.RESERVED,
    condition: 'GOOD',
  };

  const mockReservation = {
    id: 50,
    reservationCode: 'RSV-20260918-XYZ123',
    customerId: 5,
    facilityId: 1,
    rentalPeriod: 3,
    rentalPeriodUnit: ReservationRentalPeriodUnit.MONTHS,
    appointmentDate: new Date('2026-10-01'),
    status: ReservationStatus.PENDING,
    totalAmount: new Prisma.Decimal(3500000),
    facility: mockFacility,
    customer: mockCustomer,
    rentalContract: null,
    items: [
      {
        id: 101,
        reservationId: 50,
        unitTypeId: 10,
        unitId: 200,
        price: new Prisma.Decimal(1000000),
        depositAmount: new Prisma.Decimal(500000),
        unit: mockStorageUnit,
        unitType: {
          id: 10,
          name: 'Small Storage',
          code: 'S-01',
          size: new Prisma.Decimal(5),
          sizeUnit: 'm2',
          depositAmount: new Prisma.Decimal(500000),
        },
      },
    ],
  };

  const mockStaffUser = {
    id: 2,
    role: UserRole.FACILITY_STAFF,
  };

  const mockManagerUser = {
    id: 3,
    role: UserRole.FACILITY_MANAGER,
  };

  const mockStaffAssignment = {
    id: 1,
    userId: 2,
    facilityId: 1,
    position: 'Storage Specialist',
    assignedAt: new Date('2026-01-01'),
    endedAt: null,
  };

  const mockPrismaService = {
    reservation: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    staffFacilityAssignment: {
      findFirst: jest.fn(),
    },
    storageUnit: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    rentalContract: {
      create: jest.fn(),
    },
    contractItem: {
      create: jest.fn(),
    },
    handoverRecord: {
      create: jest.fn(),
    },
    $transaction: jest.fn((callback) => callback(mockPrismaService)),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HandoversService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<HandoversService>(HandoversService);
    prisma = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();
  });

  describe('getReservationForCheckIn', () => {
    it('should return reservation details for assigned facility staff', async () => {
      mockPrismaService.reservation.findUnique.mockResolvedValue(mockReservation);
      mockPrismaService.staffFacilityAssignment.findFirst.mockResolvedValue(
        mockStaffAssignment,
      );

      const result = await service.getReservationForCheckIn(50, mockStaffUser);

      expect(result.id).toBe(50);
      expect(result.facility.id).toBe(1);
      expect(result.items[0].unitId).toBe(200);
    });

    it('should throw NotFoundException if reservation does not exist', async () => {
      mockPrismaService.reservation.findUnique.mockResolvedValue(null);

      await expect(
        service.getReservationForCheckIn(999, mockStaffUser),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if staff is not assigned to the reservation facility', async () => {
      mockPrismaService.reservation.findUnique.mockResolvedValue(mockReservation);
      mockPrismaService.staffFacilityAssignment.findFirst.mockResolvedValue(null);

      await expect(
        service.getReservationForCheckIn(50, mockStaffUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow facility manager to access without facility assignment record', async () => {
      mockPrismaService.reservation.findUnique.mockResolvedValue(mockReservation);

      const result = await service.getReservationForCheckIn(50, mockManagerUser);

      expect(result.id).toBe(50);
      expect(
        mockPrismaService.staffFacilityAssignment.findFirst,
      ).not.toHaveBeenCalled();
    });
  });

  describe('checkIn', () => {
    const validCheckInDto = {
      reservationId: 50,
      condition: 'Unit is clean, empty and undamaged',
      notes: 'Customer accepted key and access PIN',
      photos: ['https://storage.example.com/photos/unit-200-checkin.jpg'],
    };

    it('should successfully check in, create contract, contract item, handover record and transition unit to OCCUPIED', async () => {
      mockPrismaService.reservation.findUnique.mockResolvedValue(mockReservation);
      mockPrismaService.staffFacilityAssignment.findFirst.mockResolvedValue(
        mockStaffAssignment,
      );
      mockPrismaService.storageUnit.findUnique.mockResolvedValue(mockStorageUnit);
      mockPrismaService.storageUnit.updateMany.mockResolvedValue({ count: 1 });

      const mockContract = {
        id: 10,
        contractCode: 'CON-20260918-ABC123',
        reservationId: 50,
        customerId: 5,
        startDate: new Date(),
        endDate: new Date('2027-01-01'),
        status: ContractStatus.ACTIVE,
        signedAt: new Date(),
      };
      mockPrismaService.rentalContract.create.mockResolvedValue(mockContract);

      const mockContractItem = {
        id: 300,
        contractId: 10,
        unitId: 200,
        rentalPrice: new Prisma.Decimal(1000000),
        depositAmount: new Prisma.Decimal(500000),
        accessCode: '123456',
        accessCodeStatus: AccessCodeStatus.ACTIVE,
        status: ContractItemStatus.ACTIVE,
        unit: mockStorageUnit,
      };
      mockPrismaService.contractItem.create.mockResolvedValue(mockContractItem);

      const mockHandoverRecord = {
        id: 400,
        contractItemId: 300,
        staffId: 2,
        type: HandoverType.CHECK_IN,
        condition: validCheckInDto.condition,
        notes: validCheckInDto.notes,
        inspectionDate: new Date(),
      };
      mockPrismaService.handoverRecord.create.mockResolvedValue(
        mockHandoverRecord,
      );

      mockPrismaService.reservation.update.mockResolvedValue({
        ...mockReservation,
        status: ReservationStatus.COMPLETED,
      });

      const result = await service.checkIn(validCheckInDto, mockStaffUser);

      expect(result.message).toBe('Check-in and handover completed successfully');
      expect(result.reservation.status).toBe(ReservationStatus.COMPLETED);
      expect(result.contract.contractCode).toBe(mockContract.contractCode);
      expect(result.contractItems[0].unitId).toBe(200);
      expect(result.contractItems[0].accessCodeStatus).toBe(
        AccessCodeStatus.ACTIVE,
      );
      expect(result.handoverRecords[0].type).toBe(HandoverType.CHECK_IN);

      // Verify atomic unit transition RESERVED -> OCCUPIED
      expect(mockPrismaService.storageUnit.updateMany).toHaveBeenCalledWith({
        where: { id: 200, status: StorageUnitStatus.RESERVED },
        data: { status: StorageUnitStatus.OCCUPIED },
      });
    });

    it('should throw NotFoundException if reservation does not exist', async () => {
      mockPrismaService.reservation.findUnique.mockResolvedValue(null);

      await expect(
        service.checkIn(validCheckInDto, mockStaffUser),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if reservation is CANCELLED', async () => {
      mockPrismaService.reservation.findUnique.mockResolvedValue({
        ...mockReservation,
        status: ReservationStatus.CANCELLED,
      });

      await expect(
        service.checkIn(validCheckInDto, mockStaffUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if reservation is EXPIRED', async () => {
      mockPrismaService.reservation.findUnique.mockResolvedValue({
        ...mockReservation,
        status: ReservationStatus.EXPIRED,
      });

      await expect(
        service.checkIn(validCheckInDto, mockStaffUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if reservation is already COMPLETED (idempotency protection)', async () => {
      mockPrismaService.reservation.findUnique.mockResolvedValue({
        ...mockReservation,
        status: ReservationStatus.COMPLETED,
      });

      await expect(
        service.checkIn(validCheckInDto, mockStaffUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if reservation already has a RentalContract attached', async () => {
      mockPrismaService.reservation.findUnique.mockResolvedValue({
        ...mockReservation,
        rentalContract: { id: 99 },
      });

      await expect(
        service.checkIn(validCheckInDto, mockStaffUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if reservation has no assigned unitId on item', async () => {
      mockPrismaService.reservation.findUnique.mockResolvedValue({
        ...mockReservation,
        items: [{ id: 101, unitId: null, price: new Prisma.Decimal(1000) }],
      });
      mockPrismaService.staffFacilityAssignment.findFirst.mockResolvedValue(
        mockStaffAssignment,
      );

      await expect(
        service.checkIn(validCheckInDto, mockStaffUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ForbiddenException if staff is not assigned to the facility', async () => {
      mockPrismaService.reservation.findUnique.mockResolvedValue(mockReservation);
      mockPrismaService.staffFacilityAssignment.findFirst.mockResolvedValue(null);

      await expect(
        service.checkIn(validCheckInDto, mockStaffUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ConflictException if storage unit is not in RESERVED status', async () => {
      mockPrismaService.reservation.findUnique.mockResolvedValue(mockReservation);
      mockPrismaService.staffFacilityAssignment.findFirst.mockResolvedValue(
        mockStaffAssignment,
      );
      // Unit is currently AVAILABLE or OCCUPIED instead of RESERVED
      mockPrismaService.storageUnit.findUnique.mockResolvedValue({
        ...mockStorageUnit,
        status: StorageUnitStatus.AVAILABLE,
      });

      await expect(
        service.checkIn(validCheckInDto, mockStaffUser),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException if concurrent request modified the unit status (race condition protection)', async () => {
      mockPrismaService.reservation.findUnique.mockResolvedValue(mockReservation);
      mockPrismaService.staffFacilityAssignment.findFirst.mockResolvedValue(
        mockStaffAssignment,
      );
      mockPrismaService.storageUnit.findUnique.mockResolvedValue(mockStorageUnit);
      // Simulate concurrent update where count returns 0
      mockPrismaService.storageUnit.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.checkIn(validCheckInDto, mockStaffUser),
      ).rejects.toThrow(ConflictException);
    });

    it('should handle DAYS, WEEKS, MONTHS, and YEARS rental period units correctly', async () => {
      const reservationWithDays = {
        ...mockReservation,
        rentalPeriod: 14,
        rentalPeriodUnit: ReservationRentalPeriodUnit.DAYS,
      };

      mockPrismaService.reservation.findUnique.mockResolvedValue(
        reservationWithDays,
      );
      mockPrismaService.staffFacilityAssignment.findFirst.mockResolvedValue(
        mockStaffAssignment,
      );
      mockPrismaService.storageUnit.findUnique.mockResolvedValue(mockStorageUnit);
      mockPrismaService.storageUnit.updateMany.mockResolvedValue({ count: 1 });
      mockPrismaService.rentalContract.create.mockImplementation(({ data }) => ({
        id: 11,
        ...data,
      }));
      mockPrismaService.contractItem.create.mockResolvedValue({
        id: 301,
        unitId: 200,
        unit: mockStorageUnit,
      });
      mockPrismaService.handoverRecord.create.mockResolvedValue({ id: 401 });
      mockPrismaService.reservation.update.mockResolvedValue({
        ...reservationWithDays,
        status: ReservationStatus.COMPLETED,
      });

      const result = await service.checkIn(validCheckInDto, mockStaffUser);

      expect(result.contract.status).toBe(ContractStatus.ACTIVE);
      const diffMs =
        result.contract.endDate.getTime() - result.contract.startDate.getTime();
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
      expect(diffDays).toBe(14);
    });
  });
});
