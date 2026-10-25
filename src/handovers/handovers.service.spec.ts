import { Test, TestingModule } from '@nestjs/testing';
import { HandoversService } from './handovers.service';
import { PrismaService } from '../database/prisma.service';
import { CloudinaryService } from '../common/cloudinary/cloudinary.service';
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
} from '@prisma/client';
import { UserRole } from '../common/enums/role.enum';

describe('HandoversService', () => {
  let service: HandoversService;
  let prisma: PrismaService;

  const mockFacility = {
    id: 'fac_1',
    name: 'District 1 Storage Hub',
    code: 'FAC-D1',
    address: '123 Nguyen Hue, D1',
    status: FacilityStatus.ACTIVE,
  };

  const mockCustomer = {
    id: 'cust_5',
    fullName: 'Nguyen Van A',
    email: 'customer@example.com',
    phone: '0901234567',
  };

  const mockStorageUnit = {
    id: 'unit_200',
    facilityId: 'fac_1',
    unitTypeId: 'type_10',
    unitNumber: 'A-102',
    floor: '1',
    status: StorageUnitStatus.RESERVED,
    condition: 'GOOD',
  };

  const mockReservation = {
    id: 'res_50',
    reservationCode: 'RSV-20260918-XYZ123',
    customerId: 'cust_5',
    facilityId: 'fac_1',
    rentalPeriod: 3,
    rentalPeriodUnit: ReservationRentalPeriodUnit.MONTHS,
    appointmentDate: new Date('2026-10-01'),
    status: ReservationStatus.PENDING,
    totalAmount: 3500000,
    facility: mockFacility,
    customer: mockCustomer,
    rentalContract: null,
    items: [
      {
        id: 'item_101',
        reservationId: 'res_50',
        unitTypeId: 'type_10',
        unitId: 'unit_200',
        price: 1000000,
        depositAmount: 500000,
        unit: mockStorageUnit,
        unitType: {
          id: 'type_10',
          name: 'Small Storage',
          code: 'S-01',
          size: 5,
          sizeUnit: 'm2',
          depositAmount: 500000,
        },
      },
    ],
  };

  const mockStaffUser = {
    id: 'staff_2',
    role: UserRole.FACILITY_STAFF,
  };

  const mockManagerUser = {
    id: 'mgr_3',
    role: UserRole.FACILITY_MANAGER,
  };

  const mockStaffAssignment = {
    id: 'assign_1',
    userId: 'staff_2',
    facilityId: 'fac_1',
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
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    rentalContract: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    contractItem: {
      create: jest.fn(),
      update: jest.fn(),
    },
    handoverRecord: {
      create: jest.fn(),
    },
    payment: {
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    extraCharge: {
      create: jest.fn(),
    },
    feeType: {
      findFirst: jest.fn(),
    },
    user: {
      update: jest.fn(),
    },
    $transaction: jest.fn((callback) => callback(mockPrismaService)),
  };

  const mockCloudinaryService = {
    uploadImage: jest.fn(),
    deleteImage: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HandoversService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: CloudinaryService,
          useValue: mockCloudinaryService,
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

      const result = await service.getReservationForCheckIn('res_50', mockStaffUser);

      expect(result.id).toBe('res_50');
      expect(result.facility.id).toBe('fac_1');
      expect(result.items[0].unitId).toBe('unit_200');
    });

    it('should throw NotFoundException if reservation does not exist', async () => {
      mockPrismaService.reservation.findUnique.mockResolvedValue(null);

      await expect(
        service.getReservationForCheckIn('res_999', mockStaffUser),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if staff is not assigned to the reservation facility', async () => {
      mockPrismaService.reservation.findUnique.mockResolvedValue(mockReservation);
      mockPrismaService.staffFacilityAssignment.findFirst.mockResolvedValue(null);

      await expect(
        service.getReservationForCheckIn('res_50', mockStaffUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow facility manager to access without facility assignment record', async () => {
      mockPrismaService.reservation.findUnique.mockResolvedValue(mockReservation);

      const result = await service.getReservationForCheckIn('res_50', mockManagerUser);

      expect(result.id).toBe('res_50');
      expect(
        mockPrismaService.staffFacilityAssignment.findFirst,
      ).not.toHaveBeenCalled();
    });
  });

  describe('checkIn', () => {
    const validCheckInDto = {
      reservationId: 'res_50',
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
        id: 'con_10',
        contractCode: 'CON-20260918-ABC123',
        reservationId: 'res_50',
        customerId: 'cust_5',
        startDate: new Date(),
        endDate: new Date('2027-01-01'),
        status: ContractStatus.ACTIVE,
        signedAt: new Date(),
      };
      mockPrismaService.rentalContract.create.mockResolvedValue(mockContract);

      const mockContractItem = {
        id: 'ci_300',
        contractId: 'con_10',
        unitId: 'unit_200',
        rentalPrice: 1000000,
        depositAmount: 500000,
        accessCode: '123456',
        accessCodeStatus: AccessCodeStatus.ACTIVE,
        status: ContractItemStatus.ACTIVE,
        unit: mockStorageUnit,
      };
      mockPrismaService.contractItem.create.mockResolvedValue(mockContractItem);

      const mockHandoverRecord = {
        id: 'hr_400',
        contractItemId: 'ci_300',
        staffId: 'staff_2',
        type: HandoverType.CHECK_IN,
        condition: validCheckInDto.condition,
        notes: validCheckInDto.notes,
        inspectionDate: new Date(),
      };
      mockPrismaService.handoverRecord.create.mockResolvedValue(mockHandoverRecord);

      const mockUpdatedReservation = {
        ...mockReservation,
        status: ReservationStatus.COMPLETED,
      };
      mockPrismaService.reservation.update.mockResolvedValue(mockUpdatedReservation);

      const result = await service.checkIn(validCheckInDto, mockStaffUser);

      expect(result.contract.id).toBe('con_10');
      expect(result.reservation.status).toBe(ReservationStatus.COMPLETED);
      expect(result.contractItems[0].accessCodeStatus).toBe(AccessCodeStatus.ACTIVE);
      expect(result.handoverRecords[0].type).toBe(HandoverType.CHECK_IN);
    });
  });

  describe('Check-out (Trả kho)', () => {
    const mockActiveContract = {
      id: 'con_10',
      contractCode: 'CON-20260918-ABC123',
      status: ContractStatus.ACTIVE,
      startDate: new Date('2026-09-01'),
      endDate: new Date('2026-12-01'),
      signedAt: new Date('2026-09-01'),
      reservation: {
        facilityId: 'fac_1',
        facility: mockFacility,
      },
      customer: mockCustomer,
      contractItems: [
        {
          id: 'ci_300',
          contractId: 'con_10',
          unitId: 'unit_200',
          rentalPrice: 1000000,
          depositAmount: 500000,
          accessCode: '123456',
          accessCodeStatus: AccessCodeStatus.ACTIVE,
          status: ContractItemStatus.ACTIVE,
          unit: {
            ...mockStorageUnit,
            status: StorageUnitStatus.OCCUPIED,
            unitType: { id: 'type_10', name: 'Small Storage' },
          },
          storedItems: [],
          handoverRecords: [
            {
              type: HandoverType.CHECK_IN,
              condition: 'Good',
              notes: 'Clean',
              photos: [],
              inspectionDate: new Date('2026-09-01'),
            },
          ],
        },
      ],
      extraCharges: [],
      payments: [],
    };

    it('getContractForCheckOut should return contract details with financial summary', async () => {
      mockPrismaService.rentalContract.findUnique.mockResolvedValue(mockActiveContract);
      mockPrismaService.staffFacilityAssignment.findFirst.mockResolvedValue(mockStaffAssignment);

      const result = await service.getContractForCheckOut('con_10', mockStaffUser);

      expect(result.contract.id).toBe('con_10');
      expect(result.financialSummary.totalDepositAmount).toBe(500000);
      expect(result.canCheckOut).toBe(true);
    });

    it('checkOut should return unit, revoke access PIN and transition contract to COMPLETED', async () => {
      mockPrismaService.rentalContract.findUnique.mockResolvedValue(mockActiveContract);
      mockPrismaService.staffFacilityAssignment.findFirst.mockResolvedValue(mockStaffAssignment);

      const mockCompletedContract = {
        ...mockActiveContract,
        status: ContractStatus.COMPLETED,
      };
      mockPrismaService.rentalContract.update.mockResolvedValue(mockCompletedContract);
      mockPrismaService.handoverRecord.create.mockResolvedValue({
        id: 'hr_500',
        type: HandoverType.CHECK_OUT,
        condition: 'Returned clean',
      });
      mockPrismaService.contractItem.update.mockResolvedValue({});
      mockPrismaService.storageUnit.update.mockResolvedValue({});
      mockPrismaService.payment.create.mockResolvedValue({
        id: 'pay_ref_1',
        amount: 500000,
      });

      const checkOutDto = {
        contractId: 'con_10',
        condition: 'Kho da don sach se, nguyen ven',
        notes: 'Khach ban giao dung han',
        photos: ['https://example.com/checkout.jpg'],
        damageFee: 0,
        cleaningFee: 0,
        refundDeposit: true,
      };

      const result = await service.checkOut(checkOutDto, mockStaffUser);

      expect(result.contract.status).toBe(ContractStatus.COMPLETED);
      expect(result.unitsReturned[0].unitStatus).toBe(StorageUnitStatus.AVAILABLE);
      expect(result.unitsReturned[0].accessCodeStatus).toBe(AccessCodeStatus.REVOKED);
      expect(result.financialSettlement.refundDepositAmount).toBe(500000);
    });
  });
});
