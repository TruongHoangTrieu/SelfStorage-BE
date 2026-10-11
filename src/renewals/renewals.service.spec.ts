import { Test, TestingModule } from '@nestjs/testing';
import { RenewalsService } from './renewals.service';
import { PrismaService } from '../database/prisma.service';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import {
  ContractStatus,
  RenewalStatus,
  OverdueStatus,
  AccessCodeStatus,
} from '@prisma/client';
import { UserRole } from '../common/enums/role.enum';

describe('RenewalsService', () => {
  let service: RenewalsService;
  let prisma: PrismaService;

  const mockContract = {
    id: 'contract-123',
    contractCode: 'CON-20261011-ABCDEF',
    customerId: 'cust-1',
    startDate: new Date('2026-01-01'),
    endDate: new Date('2026-10-01'),
    status: ContractStatus.ACTIVE,
    customer: {
      id: 'cust-1',
      fullName: 'Nguyen Van Customer',
      email: 'customer@example.com',
      phone: '0901234567',
    },
    contractItems: [
      {
        id: 'item-1',
        rentalPrice: 1500000,
        accessCodeStatus: AccessCodeStatus.ACTIVE,
        unit: {
          id: 'unit-1',
          unitNumber: 'A-101',
          facilityId: 'fac-1',
          facility: { id: 'fac-1', name: 'Kho Q1', code: 'FAC-Q1' },
          unitType: { id: 'type-1', name: 'Kho Vừa', size: '10m2' },
        },
      },
    ],
    overdueRecords: [],
  };

  const mockPrismaService = {
    rentalContract: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    contractRenewal: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    overdueRecord: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
    },
    contractItem: {
      updateMany: jest.fn(),
    },
    policy: {
      findFirst: jest.fn(),
    },
    $transaction: jest.fn((callback) => callback(mockPrismaService)),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RenewalsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<RenewalsService>(RenewalsService);
    prisma = module.get<PrismaService>(PrismaService);

    jest.clearAllMocks();
  });

  describe('requestRenewal', () => {
    it('should throw NotFoundException if contract not found', async () => {
      mockPrismaService.rentalContract.findUnique.mockResolvedValue(null);

      await expect(
        service.requestRenewal('cust-1', UserRole.STORAGE_CUSTOMER, {
          contractId: 'non-existing',
          months: 3,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if customer requests renewal for another user contract', async () => {
      mockPrismaService.rentalContract.findUnique.mockResolvedValue(mockContract);

      await expect(
        service.requestRenewal('other-user', UserRole.STORAGE_CUSTOMER, {
          contractId: 'contract-123',
          months: 3,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ConflictException if already has pending renewal', async () => {
      mockPrismaService.rentalContract.findUnique.mockResolvedValue(mockContract);
      mockPrismaService.contractRenewal.findFirst.mockResolvedValue({
        id: 'renewal-pending',
        status: RenewalStatus.PENDING,
      });

      await expect(
        service.requestRenewal('cust-1', UserRole.STORAGE_CUSTOMER, {
          contractId: 'contract-123',
          months: 3,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should create renewal request with calculated fee and discount', async () => {
      mockPrismaService.rentalContract.findUnique.mockResolvedValue(mockContract);
      mockPrismaService.contractRenewal.findFirst.mockResolvedValue(null);
      mockPrismaService.policy.findFirst.mockResolvedValue(null); // fallback discount: 3 months = 5%
      mockPrismaService.contractRenewal.create.mockResolvedValue({
        id: 'new-renewal-id',
        contractId: 'contract-123',
        status: RenewalStatus.PENDING,
        renewalFee: 4275000, // 1.500.000 * 3 * 0.95 = 4.275.000
      });

      const result = await service.requestRenewal('cust-1', UserRole.STORAGE_CUSTOMER, {
        contractId: 'contract-123',
        months: 3,
      });

      expect(result.feeCalculation.totalMonthlyRent).toBe(1500000);
      expect(result.feeCalculation.discountPercent).toBe(5);
      expect(result.feeCalculation.renewalFee).toBe(4275000);
      expect(mockPrismaService.contractRenewal.create).toHaveBeenCalled();
    });
  });

  describe('approveRenewal', () => {
    it('should approve renewal, extend contract endDate, and reactivate smart lock', async () => {
      const mockPendingRenewal = {
        id: 'renewal-1',
        contractId: 'contract-123',
        status: RenewalStatus.PENDING,
        newEndDate: new Date('2027-01-01'),
        contract: {
          ...mockContract,
          status: ContractStatus.OVERDUE,
          overdueRecords: [{ id: 'overdue-1', status: OverdueStatus.OPEN }],
        },
      };

      mockPrismaService.contractRenewal.findUnique.mockResolvedValue(mockPendingRenewal);
      mockPrismaService.contractRenewal.update.mockResolvedValue({
        ...mockPendingRenewal,
        status: RenewalStatus.APPROVED,
      });
      mockPrismaService.rentalContract.update.mockResolvedValue({
        ...mockContract,
        endDate: mockPendingRenewal.newEndDate,
        status: ContractStatus.ACTIVE,
      });

      const result = await service.approveRenewal(
        'renewal-1',
        { id: 'manager-1' },
        { notes: 'Đã nhận chuyển khoản' },
      );

      expect(result.message).toContain('thành công');
      expect(mockPrismaService.contractItem.updateMany).toHaveBeenCalledWith({
        where: { contractId: 'contract-123' },
        data: { accessCodeStatus: AccessCodeStatus.ACTIVE },
      });
      expect(mockPrismaService.overdueRecord.updateMany).toHaveBeenCalled();
    });
  });

  describe('scanAndProcessOverdueContracts (Flow 6 Overdue Job)', () => {
    it('should detect overdue contracts, revoke access code PIN and generate overdue fee', async () => {
      const pastEndDate = new Date();
      pastEndDate.setDate(pastEndDate.getDate() - 5); // 5 days overdue

      const overdueContractMock = {
        id: 'overdue-contract-1',
        contractCode: 'CON-OVERDUE-1',
        status: ContractStatus.ACTIVE,
        endDate: pastEndDate,
        customer: { fullName: 'Tran Thi B', phone: '0912345678' },
        contractItems: [
          {
            id: 'item-overdue-1',
            rentalPrice: 3000000,
            accessCodeStatus: AccessCodeStatus.ACTIVE,
            unit: { id: 'u-1', unitNumber: 'B-202', facilityId: 'fac-1' },
          },
        ],
        overdueRecords: [],
      };

      mockPrismaService.rentalContract.findMany
        .mockResolvedValueOnce([]) // warning query day 3
        .mockResolvedValueOnce([]) // warning query day 7
        .mockResolvedValueOnce([overdueContractMock]); // overdue query

      mockPrismaService.contractItem.updateMany.mockResolvedValue({ count: 1 });
      mockPrismaService.overdueRecord.create.mockResolvedValue({ id: 'rec-1' });

      const result = await service.scanAndProcessOverdueContracts();

      expect(result.totalOverdueFound).toBe(1);
      expect(result.newlyOverdueContracts).toBe(1);
      expect(result.smartLocksRevoked).toBe(1);
      expect(mockPrismaService.rentalContract.update).toHaveBeenCalledWith({
        where: { id: 'overdue-contract-1' },
        data: { status: ContractStatus.OVERDUE },
      });
      expect(mockPrismaService.contractItem.updateMany).toHaveBeenCalledWith({
        where: {
          contractId: 'overdue-contract-1',
          accessCodeStatus: AccessCodeStatus.ACTIVE,
        },
        data: { accessCodeStatus: AccessCodeStatus.REVOKED },
      });
      expect(mockPrismaService.overdueRecord.create).toHaveBeenCalled();
    });
  });

  describe('resolveOverdue', () => {
    it('should resolve overdue record and restore access code', async () => {
      const overdueRecordMock = {
        id: 'rec-123',
        contractId: 'contract-123',
        status: OverdueStatus.OPEN,
        contract: mockContract,
      };

      mockPrismaService.overdueRecord.findUnique.mockResolvedValue(overdueRecordMock);
      mockPrismaService.overdueRecord.update.mockResolvedValue({
        ...overdueRecordMock,
        status: OverdueStatus.RESOLVED,
      });

      const result = await service.resolveOverdue(
        'rec-123',
        { id: 'staff-1' },
        { notes: 'Đã đóng tiền phạt' },
      );

      expect(result.message).toContain('thành công');
      expect(mockPrismaService.contractItem.updateMany).toHaveBeenCalledWith({
        where: { contractId: 'contract-123' },
        data: { accessCodeStatus: AccessCodeStatus.ACTIVE },
      });
    });
  });
});
