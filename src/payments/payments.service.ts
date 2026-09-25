import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { SePayService } from './sepay/sepay.service';
import { CreateDepositPaymentDto } from './dto/create-payment.dto';
import { CreateRentalPaymentDto } from './dto/create-rental-payment.dto';
import { SePayWebhookDto } from './dto/sepay-webhook.dto';
import { FilterPaymentDto } from './dto/filter-payment.dto';
import {
  PaymentStatus,
  PaymentType,
  PaymentMethod,
  ReservationStatus,
  StorageUnitStatus,
  Prisma,
} from '@prisma/client';
import { UserRole } from '../common/enums/role.enum';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sePayService: SePayService,
  ) {}

  /**
   * FLOW 1: Create Deposit Payment for a Reservation
   * Generates a DEPOSIT payment with unique payment code and VietQR instructions.
   */
  async createDepositPayment(
    customerId: number,
    dto: CreateDepositPaymentDto,
    userRole: string = UserRole.STORAGE_CUSTOMER,
  ) {
    // 1. Find reservation with items and existing payments
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: dto.reservationId },
      include: {
        facility: true,
        items: {
          include: {
            unitType: true,
            unit: true,
          },
        },
        payments: true,
      },
    });

    if (!reservation) {
      throw new NotFoundException(
        `Reservation with ID ${dto.reservationId} not found`,
      );
    }

    // 2. Ownership verification: Customer can only pay for their own reservation
    if (
      userRole === UserRole.STORAGE_CUSTOMER &&
      reservation.customerId !== customerId
    ) {
      throw new ForbiddenException(
        'You do not have permission to create payment for this reservation',
      );
    }

    // 3. Status eligibility check
    if (reservation.status === ReservationStatus.CANCELLED) {
      throw new BadRequestException('Cannot pay for a cancelled reservation');
    }

    if (reservation.status === ReservationStatus.EXPIRED) {
      throw new BadRequestException('Cannot pay for an expired reservation');
    }

    if (reservation.status === ReservationStatus.COMPLETED) {
      throw new BadRequestException('Reservation has already been completed');
    }

    // 4. Check if a Deposit payment is already PAID
    const paidDeposit = reservation.payments.find(
      (p) =>
        p.paymentType === PaymentType.DEPOSIT &&
        p.status === PaymentStatus.PAID,
    );

    if (paidDeposit) {
      throw new ConflictException(
        'Deposit payment for this reservation has already been completed',
      );
    }

    // 5. Check if a PENDING deposit payment already exists -> reuse it with QR info
    const pendingDeposit = reservation.payments.find(
      (p) =>
        p.paymentType === PaymentType.DEPOSIT &&
        p.status === PaymentStatus.PENDING,
    );

    if (pendingDeposit) {
      const qrInfo = this.sePayService.generateQrInfo(
        Number(pendingDeposit.amount),
        pendingDeposit.paymentCode,
      );

      return {
        payment: pendingDeposit,
        qr: qrInfo,
        reservation: {
          id: reservation.id,
          reservationCode: reservation.reservationCode,
          status: reservation.status,
          facilityName: reservation.facility.name,
        },
      };
    }

    // 6. Calculate deposit amount strictly from database (ReservationItem deposit amounts)
    let totalDeposit = new Prisma.Decimal(0);
    for (const item of reservation.items) {
      totalDeposit = totalDeposit.add(item.depositAmount);
    }

    if (totalDeposit.lessThanOrEqualTo(0)) {
      throw new BadRequestException(
        'Calculated deposit amount must be greater than 0',
      );
    }

    // 7. Generate unique, clean payment code: SSDEP<reservationId><random4>
    const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase();
    const paymentCode = `SSDEP${reservation.id}${randomPart}`;

    // 8. Create Payment record in database
    const payment = await this.prisma.payment.create({
      data: {
        paymentCode,
        reservationId: reservation.id,
        paymentType: PaymentType.DEPOSIT,
        amount: totalDeposit,
        paymentMethod: dto.paymentMethod || PaymentMethod.BANK_TRANSFER,
        status: PaymentStatus.PENDING,
      },
    });

    this.logger.log(
      `Created DEPOSIT Payment ${paymentCode} for Reservation ${reservation.id} with amount ${totalDeposit}`,
    );

    // 9. Generate VietQR payment info
    const qrInfo = this.sePayService.generateQrInfo(
      Number(totalDeposit),
      paymentCode,
    );

    return {
      payment,
      qr: qrInfo,
      reservation: {
        id: reservation.id,
        reservationCode: reservation.reservationCode,
        status: reservation.status,
        facilityName: reservation.facility.name,
      },
    };
  }

  /**
   * FLOW 2: Check payment summary for a reservation
   * Checks whether Deposit is paid and calculates remaining Rental amount.
   */
  async getReservationPaymentSummary(
    reservationId: number,
    userId: number,
    userRole: string,
  ) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      include: {
        facility: true,
        items: {
          include: {
            unitType: true,
            unit: true,
          },
        },
        payments: true,
        rentalContract: true,
      },
    });

    if (!reservation) {
      throw new NotFoundException(
        `Reservation with ID ${reservationId} not found`,
      );
    }

    if (
      userRole === UserRole.STORAGE_CUSTOMER &&
      reservation.customerId !== userId
    ) {
      throw new ForbiddenException(
        'You do not have permission to view payment summary for this reservation',
      );
    }

    // Calculate total deposit and rental amounts from items
    let depositRequired = new Prisma.Decimal(0);
    let rentalPerPeriod = new Prisma.Decimal(0);

    for (const item of reservation.items) {
      depositRequired = depositRequired.add(item.depositAmount);
      rentalPerPeriod = rentalPerPeriod.add(item.price);
    }

    const totalRentalAmount = rentalPerPeriod.mul(reservation.rentalPeriod);
    const estimatedGrandTotal = totalRentalAmount.add(depositRequired);

    // Find paid deposit and rental payments
    const depositPayment = reservation.payments.find(
      (p) => p.paymentType === PaymentType.DEPOSIT && p.status === PaymentStatus.PAID,
    );
    const depositPaid = !!depositPayment;

    const rentalPayment = reservation.payments.find(
      (p) => p.paymentType === PaymentType.RENTAL && p.status === PaymentStatus.PAID,
    );
    const rentalPaid = !!rentalPayment;

    let remainingAmountToPay = estimatedGrandTotal;
    if (depositPaid) {
      remainingAmountToPay = remainingAmountToPay.sub(depositPayment.amount);
    }
    if (rentalPaid) {
      remainingAmountToPay = remainingAmountToPay.sub(rentalPayment.amount);
    }
    if (remainingAmountToPay.lessThan(0)) {
      remainingAmountToPay = new Prisma.Decimal(0);
    }

    return {
      reservationId: reservation.id,
      reservationCode: reservation.reservationCode,
      reservationStatus: reservation.status,
      depositAmount: depositRequired,
      depositPaid,
      depositPayment: depositPayment || null,
      rentalAmount: totalRentalAmount,
      rentalPaid,
      rentalPayment: rentalPayment || null,
      grandTotal: estimatedGrandTotal,
      remainingAmountToPay,
      isReadyForCheckIn: depositPaid,
      payments: reservation.payments,
    };
  }

  /**
   * FLOW 2: Create Rental Payment for Check-in / Handover
   * Prevents charging deposit twice and creates RENTAL payment for the remaining rental fee.
   */
  async createRentalPayment(
    userId: number,
    dto: CreateRentalPaymentDto,
    userRole: string = UserRole.STORAGE_CUSTOMER,
  ) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: dto.reservationId },
      include: {
        facility: true,
        items: true,
        payments: true,
      },
    });

    if (!reservation) {
      throw new NotFoundException(
        `Reservation with ID ${dto.reservationId} not found`,
      );
    }

    if (
      userRole === UserRole.STORAGE_CUSTOMER &&
      reservation.customerId !== userId
    ) {
      throw new ForbiddenException(
        'You do not have permission to create payment for this reservation',
      );
    }

    if (reservation.status === ReservationStatus.CANCELLED) {
      throw new BadRequestException('Cannot pay for a cancelled reservation');
    }

    // Check if Rental payment is already completed
    const existingPaidRental = reservation.payments.find(
      (p) =>
        p.paymentType === PaymentType.RENTAL && p.status === PaymentStatus.PAID,
    );

    if (existingPaidRental) {
      throw new ConflictException(
        'Rental payment for this reservation has already been completed',
      );
    }

    // Reuse existing PENDING rental payment if available
    const pendingRental = reservation.payments.find(
      (p) =>
        p.paymentType === PaymentType.RENTAL &&
        p.status === PaymentStatus.PENDING,
    );

    if (pendingRental) {
      const qrInfo = this.sePayService.generateQrInfo(
        Number(pendingRental.amount),
        pendingRental.paymentCode,
      );

      return {
        payment: pendingRental,
        qr: qrInfo,
        reservation: {
          id: reservation.id,
          reservationCode: reservation.reservationCode,
          status: reservation.status,
        },
      };
    }

    // Calculate rental amount (item.price * rentalPeriod)
    let totalRental = new Prisma.Decimal(0);
    for (const item of reservation.items) {
      totalRental = totalRental.add(item.price);
    }
    const rentalAmount = totalRental.mul(reservation.rentalPeriod);

    if (rentalAmount.lessThanOrEqualTo(0)) {
      throw new BadRequestException(
        'Calculated rental amount must be greater than 0',
      );
    }

    // Generate unique code: SSREN<reservationId><random4>
    const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase();
    const paymentCode = `SSREN${reservation.id}${randomPart}`;

    const payment = await this.prisma.payment.create({
      data: {
        paymentCode,
        reservationId: reservation.id,
        paymentType: PaymentType.RENTAL,
        amount: rentalAmount,
        paymentMethod: dto.paymentMethod || PaymentMethod.BANK_TRANSFER,
        status: PaymentStatus.PENDING,
      },
    });

    this.logger.log(
      `Created RENTAL Payment ${paymentCode} for Reservation ${reservation.id} with amount ${rentalAmount}`,
    );

    const qrInfo = this.sePayService.generateQrInfo(
      Number(rentalAmount),
      paymentCode,
    );

    return {
      payment,
      qr: qrInfo,
      reservation: {
        id: reservation.id,
        reservationCode: reservation.reservationCode,
        status: reservation.status,
      },
    };
  }

  /**
   * SEPAY WEBHOOK HANDLER
   * Processes bank transaction notifications securely, atomically, and idempotently.
   */
  async handleSePayWebhook(payload: SePayWebhookDto, authHeader?: string) {
    this.logger.log(
      `Received SePay Webhook - Transaction ID: ${payload.id}, Gateway: ${payload.gateway}, Amount: ${payload.transferAmount}, Content: "${payload.content}"`,
    );

    // 1. Webhook Authentication Verification
    const isAuthorized = this.sePayService.verifyWebhookAuth(authHeader);
    if (!isAuthorized) {
      this.logger.warn(`Unauthorized SePay Webhook attempt. Auth header: ${authHeader}`);
      throw new UnauthorizedException('Invalid SePay webhook authorization');
    }

    // 2. Ignore outgoing transactions (transferType === 'out')
    if (payload.transferType !== 'in') {
      this.logger.log(`Ignoring outbound transaction ${payload.id}`);
      return { success: true, message: 'Ignored outbound transaction' };
    }

    // 3. Extract Payment Code from payload (code field or content)
    const paymentCode = this.sePayService.extractPaymentCode(payload);
    if (!paymentCode) {
      this.logger.warn(
        `Could not extract recognizable payment code from SePay webhook content: "${payload.content}"`,
      );
      return {
        success: true,
        message: 'No recognizable payment code found in transaction content',
      };
    }

    // 4. Find matching Payment in database
    const payment = await this.prisma.payment.findUnique({
      where: { paymentCode },
      include: {
        reservation: {
          include: {
            items: true,
          },
        },
        contract: true,
      },
    });

    if (!payment) {
      this.logger.warn(
        `Payment record with code "${paymentCode}" not found in database.`,
      );
      return {
        success: true,
        message: `Payment code ${paymentCode} not found in system`,
      };
    }

    // 5. IDEMPOTENCY CHECK
    // If the payment is already marked as PAID, do not apply changes again.
    if (payment.status === PaymentStatus.PAID) {
      this.logger.log(
        `Payment ${paymentCode} is already PAID. Transaction reference: ${payment.transactionReference}. Idempotent response returned.`,
      );
      return {
        success: true,
        message: 'Payment has already been processed successfully',
        paymentCode,
      };
    }

    // Check if the same SePay transaction reference was already recorded
    if (payment.transactionReference === String(payload.id)) {
      this.logger.log(
        `SePay transaction ID ${payload.id} already processed for payment ${paymentCode}.`,
      );
      return {
        success: true,
        message: 'Duplicate SePay transaction ID ignored',
        paymentCode,
      };
    }

    // 6. AMOUNT VERIFICATION
    const expectedAmount = Number(payment.amount);
    const receivedAmount = Number(payload.transferAmount);

    if (receivedAmount < expectedAmount) {
      this.logger.error(
        `Amount mismatch for Payment ${paymentCode}: Expected ${expectedAmount}, Received ${receivedAmount}. Rejecting confirmation.`,
      );
      return {
        success: false,
        message: `Underpayment: received ${receivedAmount} VND, expected ${expectedAmount} VND`,
        paymentCode,
      };
    }

    // 7. ATOMIC PRISMA TRANSACTION
    // Mark Payment = PAID and (for DEPOSIT) update Reservation = CONFIRMED atomically.
    const transactionDate = payload.transactionDate
      ? new Date(payload.transactionDate)
      : new Date();

    const result = await this.prisma.$transaction(async (tx) => {
      // a) Update Payment status to PAID
      const updatedPayment = await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.PAID,
          paidAt: isNaN(transactionDate.getTime()) ? new Date() : transactionDate,
          transactionReference: String(payload.id),
        },
      });

      // b) If this is a DEPOSIT payment for a Reservation -> confirm the reservation
      if (
        payment.paymentType === PaymentType.DEPOSIT &&
        payment.reservationId &&
        payment.reservation
      ) {
        if (payment.reservation.status === ReservationStatus.PENDING) {
          await tx.reservation.update({
            where: { id: payment.reservationId },
            data: {
              status: ReservationStatus.CONFIRMED,
            },
          });
          this.logger.log(
            `Reservation ${payment.reservationId} status updated to CONFIRMED. Storage units remain RESERVED.`,
          );
        }
      }

      return updatedPayment;
    });

    this.logger.log(
      `Successfully confirmed Payment ${paymentCode} (Type: ${payment.paymentType}, Amount: ${receivedAmount}) via SePay Webhook ID ${payload.id}.`,
    );

    return {
      success: true,
      message: 'Payment processed and confirmed successfully',
      paymentId: result.id,
      paymentCode: result.paymentCode,
      paymentType: result.paymentType,
      status: result.status,
    };
  }

  /**
   * List payments with filtering and pagination
   */
  async findAll(filter: FilterPaymentDto, user: any) {
    const page = filter.page || 1;
    const limit = filter.limit || 10;
    const skip = (page - 1) * limit;

    const userRole = typeof user.role === 'string' ? user.role : user.role?.name;
    const where: Prisma.PaymentWhereInput = {};

    // Customer can only view payments of their own reservations/contracts
    if (userRole === UserRole.STORAGE_CUSTOMER) {
      where.OR = [
        { reservation: { customerId: user.id } },
        { contract: { customerId: user.id } },
      ];
    }

    if (filter.status) {
      where.status = filter.status;
    }
    if (filter.paymentType) {
      where.paymentType = filter.paymentType;
    }
    if (filter.paymentMethod) {
      where.paymentMethod = filter.paymentMethod;
    }
    if (filter.reservationId) {
      where.reservationId = filter.reservationId;
    }
    if (filter.contractId) {
      where.contractId = filter.contractId;
    }

    const [total, data] = await Promise.all([
      this.prisma.payment.count({ where }),
      this.prisma.payment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          reservation: {
            select: {
              id: true,
              reservationCode: true,
              customerId: true,
              status: true,
            },
          },
          contract: {
            select: {
              id: true,
              contractCode: true,
              customerId: true,
              status: true,
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
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get payment details by ID
   */
  async findById(id: number, user: any) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: {
        reservation: {
          include: {
            facility: true,
            items: {
              include: {
                unitType: true,
                unit: true,
              },
            },
          },
        },
        contract: true,
      },
    });

    if (!payment) {
      throw new NotFoundException(`Payment with ID ${id} not found`);
    }

    const userRole = typeof user.role === 'string' ? user.role : user.role?.name;
    if (userRole === UserRole.STORAGE_CUSTOMER) {
      const isReservationOwner =
        payment.reservation && payment.reservation.customerId === user.id;
      const isContractOwner =
        payment.contract && payment.contract.customerId === user.id;

      if (!isReservationOwner && !isContractOwner) {
        throw new ForbiddenException(
          'You do not have permission to view this payment',
        );
      }
    }

    return payment;
  }
}
