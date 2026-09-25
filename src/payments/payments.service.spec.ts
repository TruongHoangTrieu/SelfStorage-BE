import { Test, TestingModule } from '@nestjs/testing';
import { PaymentsService } from './payments.service';
import { PrismaService } from '../database/prisma.service';
import { SePayService } from './sepay/sepay.service';
import { ConfigService } from '@nestjs/config';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  PaymentStatus,
  PaymentType,
  PaymentMethod,
  ReservationStatus,
  Prisma,
} from '@prisma/client';
import { UserRole } from '../common/enums/role.enum';

describe('PaymentsService', () => {
  let service: PaymentsService;
  let prisma: PrismaService;
  let sePayService: SePayService;

  const mockReservation = {
    id: 101,
    reservationCode: 'RSV-20260925-ABC123',
    customerId: 5,
    facilityId: 1,
    rentalPeriod: 3,
    status: ReservationStatus.PENDING,
    totalAmount: new Prisma.Decimal(3500000),
    facility: {
      id: 1,
      name: 'Main Facility Alpha',
    },
    items: [
      {
        id: 1,
        reservationId: 101,
        unitTypeId: 1,
        unitId: 10,
        price: new Prisma.Decimal(1000000),
        depositAmount: new Prisma.Decimal(500000),
        unitType: { id: 1, name: 'Small Unit' },
        unit: { id: 10, unitNumber: 'A-101' },
      },
    ],
    payments: [],
    rentalContract: null,
  };

  const mockPrismaService = {
    reservation: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    payment: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn((callback) => callback(mockPrismaService)),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'SEPAY_API_KEY') return 'test-sepay-api-key';
      if (key === 'SEPAY_BANK_CODE') return 'MBBank';
      if (key === 'SEPAY_ACCOUNT_NUMBER') return '0901234567';
      if (key === 'SEPAY_ACCOUNT_NAME') return 'SELF STORAGE TEST';
      return null;
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        SePayService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
    prisma = module.get<PrismaService>(PrismaService);
    sePayService = module.get<SePayService>(SePayService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
    expect(sePayService).toBeDefined();
  });

  // =========================================================================
  // FLOW 1: DEPOSIT PAYMENT CREATION TESTS
  // =========================================================================
  describe('Flow 1: createDepositPayment', () => {
    it('should successfully create a DEPOSIT payment with unique code and VietQR info', async () => {
      mockPrismaService.reservation.findUnique.mockResolvedValue({
        ...mockReservation,
        payments: [],
      });

      mockPrismaService.payment.create.mockImplementation(({ data }) =>
        Promise.resolve({
          id: 1,
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      );

      const result = await service.createDepositPayment(
        5,
        { reservationId: 101, paymentMethod: PaymentMethod.BANK_TRANSFER },
        UserRole.STORAGE_CUSTOMER,
      );

      expect(result).toBeDefined();
      expect(result.payment.paymentType).toBe(PaymentType.DEPOSIT);
      expect(result.payment.amount).toEqual(new Prisma.Decimal(500000));
      expect(result.payment.status).toBe(PaymentStatus.PENDING);
      expect(result.payment.paymentCode).toMatch(/^SSDEP101[A-Z0-9]+$/);
      expect(result.qr).toBeDefined();
      expect(result.qr.qrCodeUrl).toContain('MBBank-0901234567');
      expect(mockPrismaService.payment.create).toHaveBeenCalledTimes(1);
    });

    it('should throw NotFoundException if reservation does not exist', async () => {
      mockPrismaService.reservation.findUnique.mockResolvedValue(null);

      await expect(
        service.createDepositPayment(5, { reservationId: 999 }, UserRole.STORAGE_CUSTOMER),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if customer attempts to pay for another user reservation', async () => {
      mockPrismaService.reservation.findUnique.mockResolvedValue({
        ...mockReservation,
        customerId: 99, // Owned by another user
      });

      await expect(
        service.createDepositPayment(5, { reservationId: 101 }, UserRole.STORAGE_CUSTOMER),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException if reservation is cancelled or expired', async () => {
      mockPrismaService.reservation.findUnique.mockResolvedValue({
        ...mockReservation,
        status: ReservationStatus.CANCELLED,
      });

      await expect(
        service.createDepositPayment(5, { reservationId: 101 }, UserRole.STORAGE_CUSTOMER),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException if deposit payment is already PAID', async () => {
      mockPrismaService.reservation.findUnique.mockResolvedValue({
        ...mockReservation,
        payments: [
          {
            id: 10,
            paymentCode: 'SSDEP101PAID',
            paymentType: PaymentType.DEPOSIT,
            amount: new Prisma.Decimal(500000),
            status: PaymentStatus.PAID,
          },
        ],
      });

      await expect(
        service.createDepositPayment(5, { reservationId: 101 }, UserRole.STORAGE_CUSTOMER),
      ).rejects.toThrow(ConflictException);
    });

    it('should reuse existing PENDING deposit payment without creating duplicate records', async () => {
      const existingPending = {
        id: 10,
        paymentCode: 'SSDEP101PENDING',
        paymentType: PaymentType.DEPOSIT,
        amount: new Prisma.Decimal(500000),
        status: PaymentStatus.PENDING,
      };

      mockPrismaService.reservation.findUnique.mockResolvedValue({
        ...mockReservation,
        payments: [existingPending],
      });

      const result = await service.createDepositPayment(
        5,
        { reservationId: 101 },
        UserRole.STORAGE_CUSTOMER,
      );

      expect(result.payment.id).toBe(10);
      expect(result.payment.paymentCode).toBe('SSDEP101PENDING');
      expect(mockPrismaService.payment.create).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // SEPAY WEBHOOK & IDEMPOTENCY & AMOUNT VERIFICATION TESTS
  // =========================================================================
  describe('SePay Webhook Processing', () => {
    const validWebhookPayload = {
      id: 998877,
      gateway: 'MBBank',
      transactionDate: '2026-09-25 15:30:00',
      accountNumber: '0901234567',
      code: 'SSDEP101A2B3',
      content: 'SSDEP101A2B3 dat coc thue kho',
      transferType: 'in' as const,
      transferAmount: 500000,
    };

    const mockPendingPayment = {
      id: 1,
      paymentCode: 'SSDEP101A2B3',
      reservationId: 101,
      contractId: null,
      paymentType: PaymentType.DEPOSIT,
      amount: new Prisma.Decimal(500000),
      status: PaymentStatus.PENDING,
      transactionReference: null,
      reservation: {
        id: 101,
        status: ReservationStatus.PENDING,
      },
    };

    it('should successfully process webhook, mark Payment as PAID, and update Reservation to CONFIRMED', async () => {
      mockPrismaService.payment.findUnique.mockResolvedValue(mockPendingPayment);
      mockPrismaService.payment.update.mockResolvedValue({
        ...mockPendingPayment,
        status: PaymentStatus.PAID,
        transactionReference: '998877',
      });
      mockPrismaService.reservation.update.mockResolvedValue({
        id: 101,
        status: ReservationStatus.CONFIRMED,
      });

      const response = await service.handleSePayWebhook(
        validWebhookPayload,
        'Apikey test-sepay-api-key',
      );

      expect(response.success).toBe(true);
      expect(response.status).toBe(PaymentStatus.PAID);
      expect(mockPrismaService.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: expect.objectContaining({
            status: PaymentStatus.PAID,
            transactionReference: '998877',
          }),
        }),
      );
      expect(mockPrismaService.reservation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 101 },
          data: { status: ReservationStatus.CONFIRMED },
        }),
      );
    });

    it('should throw UnauthorizedException if API key is invalid', async () => {
      await expect(
        service.handleSePayWebhook(validWebhookPayload, 'Apikey invalid-key'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should reject underpayment (amount mismatch) and NOT confirm reservation', async () => {
      mockPrismaService.payment.findUnique.mockResolvedValue(mockPendingPayment);

      const underpaidPayload = {
        ...validWebhookPayload,
        transferAmount: 300000, // Expected 500000, received only 300000
      };

      const response = await service.handleSePayWebhook(
        underpaidPayload,
        'Apikey test-sepay-api-key',
      );

      expect(response.success).toBe(false);
      expect(response.message).toContain('Underpayment');
      expect(mockPrismaService.payment.update).not.toHaveBeenCalled();
      expect(mockPrismaService.reservation.update).not.toHaveBeenCalled();
    });

    it('IDEMPOTENCY: should safely handle duplicate webhook calls without re-processing or corrupting state', async () => {
      // Setup payment as ALREADY PAID
      mockPrismaService.payment.findUnique.mockResolvedValue({
        ...mockPendingPayment,
        status: PaymentStatus.PAID,
        transactionReference: '998877',
      });

      // Call 1
      const res1 = await service.handleSePayWebhook(
        validWebhookPayload,
        'Apikey test-sepay-api-key',
      );
      // Call 2
      const res2 = await service.handleSePayWebhook(
        validWebhookPayload,
        'Apikey test-sepay-api-key',
      );

      expect(res1.success).toBe(true);
      expect(res1.message).toContain('already been processed');
      expect(res2.success).toBe(true);
      expect(res2.message).toContain('already been processed');
      expect(mockPrismaService.payment.update).not.toHaveBeenCalled();
      expect(mockPrismaService.reservation.update).not.toHaveBeenCalled();
    });

    it('should safely ignore outgoing transfers (transferType === "out")', async () => {
      const outPayload = {
        ...validWebhookPayload,
        transferType: 'out' as const,
      };

      const response = await service.handleSePayWebhook(
        outPayload,
        'Apikey test-sepay-api-key',
      );

      expect(response.success).toBe(true);
      expect(response.message).toContain('Ignored outbound');
      expect(mockPrismaService.payment.findUnique).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // FLOW 2: CHECK-IN PAYMENT SUMMARY & RENTAL PAYMENT TESTS
  // =========================================================================
  describe('Flow 2: Payment Summary and Rental Payment', () => {
    it('should return correct payment summary showing Deposit paid and remaining rental amount', async () => {
      mockPrismaService.reservation.findUnique.mockResolvedValue({
        ...mockReservation,
        payments: [
          {
            id: 1,
            paymentCode: 'SSDEP101',
            paymentType: PaymentType.DEPOSIT,
            amount: new Prisma.Decimal(500000),
            status: PaymentStatus.PAID,
          },
        ],
      });

      const summary = await service.getReservationPaymentSummary(
        101,
        5,
        UserRole.STORAGE_CUSTOMER,
      );

      expect(summary.depositPaid).toBe(true);
      expect(summary.depositAmount).toEqual(new Prisma.Decimal(500000));
      expect(summary.rentalPaid).toBe(false);
      expect(summary.rentalAmount).toEqual(new Prisma.Decimal(3000000)); // 1,000,000 * 3 months
      expect(summary.remainingAmountToPay).toEqual(new Prisma.Decimal(3000000));
      expect(summary.isReadyForCheckIn).toBe(true);
    });

    it('should create RENTAL payment for remaining amount without charging deposit twice', async () => {
      mockPrismaService.reservation.findUnique.mockResolvedValue({
        ...mockReservation,
        payments: [
          {
            id: 1,
            paymentCode: 'SSDEP101',
            paymentType: PaymentType.DEPOSIT,
            amount: new Prisma.Decimal(500000),
            status: PaymentStatus.PAID,
          },
        ],
      });

      mockPrismaService.payment.create.mockImplementation(({ data }) =>
        Promise.resolve({
          id: 2,
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      );

      const result = await service.createRentalPayment(
        5,
        { reservationId: 101 },
        UserRole.STORAGE_CUSTOMER,
      );

      expect(result.payment.paymentType).toBe(PaymentType.RENTAL);
      expect(result.payment.amount).toEqual(new Prisma.Decimal(3000000)); // Only rental price, no deposit added
      expect(result.payment.paymentCode).toMatch(/^SSREN101[A-Z0-9]+$/);
    });

    it('should throw ConflictException if RENTAL payment is already completed', async () => {
      mockPrismaService.reservation.findUnique.mockResolvedValue({
        ...mockReservation,
        payments: [
          {
            id: 2,
            paymentCode: 'SSREN101',
            paymentType: PaymentType.RENTAL,
            amount: new Prisma.Decimal(3000000),
            status: PaymentStatus.PAID,
          },
        ],
      });

      await expect(
        service.createRentalPayment(5, { reservationId: 101 }, UserRole.STORAGE_CUSTOMER),
      ).rejects.toThrow(ConflictException);
    });
  });
});
