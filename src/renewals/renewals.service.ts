import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../database/prisma.service';
import { RequestRenewalDto } from './dto/request-renewal.dto';
import {
  ApproveRenewalDto,
  RejectRenewalDto,
} from './dto/approve-renewal.dto';
import { FilterRenewalDto } from './dto/filter-renewal.dto';
import {
  FilterOverdueDto,
  ResolveOverdueDto,
  RequestLiquidationDto,
  CompleteLiquidationDto,
} from './dto/filter-overdue.dto';
import {
  ContractStatus,
  ContractItemStatus,
  RenewalStatus,
  OverdueStatus,
  AccessCodeStatus,
  NotificationType,
  HandoverType,
  StorageUnitStatus,
  ExtraChargeStatus,
  Prisma,
} from '@prisma/client';
import { UserRole } from '../common/enums/role.enum';
import { AiService } from '../ai/ai.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class RenewalsService {
  private readonly logger = new Logger(RenewalsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // =========================================================================
  // 1. CONTRACT RENEWAL (GIA HẠN HỢP ĐỒNG)
  // =========================================================================

  /**
   * Khách hàng hoặc Nhân viên gửi yêu cầu gia hạn hợp đồng thuê kho
   */
  async requestRenewal(userId: string, userRole: string, dto: RequestRenewalDto) {
    const contract = await this.prisma.rentalContract.findUnique({
      where: { id: dto.contractId },
      include: {
        customer: {
          select: { id: true, fullName: true, email: true, phone: true },
        },
        contractItems: {
          include: {
            unit: {
              include: {
                facility: { select: { id: true, name: true, code: true } },
                unitType: { select: { id: true, name: true, size: true } },
              },
            },
          },
        },
        reservation: { select: { facilityId: true } },
      },
    });

    if (!contract) {
      throw new NotFoundException(`Hợp đồng #${dto.contractId} không tồn tại`);
    }

    // Kiểm tra quyền sở hữu nếu là Khách hàng
    if (userRole === UserRole.STORAGE_CUSTOMER && contract.customerId !== userId) {
      throw new ForbiddenException('Bạn không có quyền yêu cầu gia hạn hợp đồng của người khác');
    }

    // Hợp đồng phải ở trạng thái ACTIVE hoặc OVERDUE mới được gia hạn
    if (
      contract.status !== ContractStatus.ACTIVE &&
      contract.status !== ContractStatus.OVERDUE
    ) {
      throw new BadRequestException(
        `Không thể gia hạn hợp đồng đang ở trạng thái '${contract.status}' (chỉ áp dụng cho ACTIVE hoặc OVERDUE)`,
      );
    }

    // Kiểm tra xem đã có yêu cầu gia hạn nào đang PENDING chưa
    const existingPendingRenewal = await this.prisma.contractRenewal.findFirst({
      where: {
        contractId: contract.id,
        status: RenewalStatus.PENDING,
      },
    });

    if (existingPendingRenewal) {
      throw new ConflictException(
        'Hợp đồng này đang có một yêu cầu gia hạn chưa được xử lý (trạng thái PENDING)',
      );
    }

    // Tính toán ngày kết thúc mới
    const oldEndDate = new Date(contract.endDate);
    const newEndDate = new Date(oldEndDate.getTime());
    newEndDate.setMonth(newEndDate.getMonth() + dto.months);

    // Tính tổng đơn giá thuê hàng tháng của tất cả ngăn kho trong hợp đồng
    const totalMonthlyRent = contract.contractItems.reduce(
      (sum, item) => sum + (Number(item.rentalPrice) || 0),
      0,
    );

    // Tính chiết khấu theo thời hạn gia hạn (nếu có chính sách)
    let discountPercent = 0;
    if (dto.months >= 12) discountPercent = 15;
    else if (dto.months >= 6) discountPercent = 10;
    else if (dto.months >= 3) discountPercent = 5;

    const facilityId =
      contract.contractItems[0]?.unit?.facilityId || contract.reservation?.facilityId;

    try {
      const discountPolicy = await this.prisma.policy.findFirst({
        where: {
          policyType: 'RENTAL_DURATION_DISCOUNT',
          status: 'ACTIVE',
          OR: [{ facilityId }, { facilityId: null }],
        },
        orderBy: { facilityId: 'desc' },
      });

      if (discountPolicy && Array.isArray(discountPolicy.value)) {
        const match = (discountPolicy.value as any[]).find(
          (p) => p.months === dto.months,
        );
        if (match && typeof match.discount === 'number') {
          discountPercent = match.discount;
        }
      }
    } catch {
      // Dùng chiết khấu tiêu chuẩn nếu không đọc được policy
    }

    const grossFee = totalMonthlyRent * dto.months;
    const renewalFee = Math.round(grossFee * ((100 - discountPercent) / 100));

    // Tạo bản ghi yêu cầu gia hạn ContractRenewal
    const renewal = await this.prisma.contractRenewal.create({
      data: {
        contractId: contract.id,
        oldEndDate,
        newEndDate,
        renewalFee,
        requestedBy: userId,
        status: RenewalStatus.PENDING,
      },
      include: {
        contract: {
          select: {
            id: true,
            contractCode: true,
            status: true,
            startDate: true,
            endDate: true,
          },
        },
        requester: {
          select: { id: true, fullName: true, email: true, phone: true },
        },
      },
    });

    return {
      message: 'Gửi yêu cầu gia hạn hợp đồng thành công',
      renewal,
      feeCalculation: {
        totalMonthlyRent,
        months: dto.months,
        discountPercent,
        renewalFee,
      },
    };
  }

  /**
   * Xem danh sách các yêu cầu gia hạn
   */
  async getRenewals(user: any, filterDto: FilterRenewalDto) {
    const page = Number(filterDto.page) || 1;
    const limit = Number(filterDto.limit) || 10;
    const skip = (page - 1) * limit;

    const userRole = typeof user.role === 'string' ? user.role : user.role?.name;
    const where: any = {};

    if (filterDto.status) {
      where.status = filterDto.status;
    }

    if (filterDto.contractId) {
      where.contractId = filterDto.contractId;
    }

    // Nếu là Customer: chỉ xem của mình
    if (userRole === UserRole.STORAGE_CUSTOMER) {
      where.OR = [{ requestedBy: user.id }, { contract: { customerId: user.id } }];
    } else if (
      (userRole === UserRole.FACILITY_STAFF || userRole === UserRole.FACILITY_MANAGER) &&
      user.facilityId
    ) {
      where.contract = {
        contractItems: {
          some: { unit: { facilityId: user.facilityId } },
        },
      };
    } else if (filterDto.facilityId) {
      where.contract = {
        contractItems: {
          some: { unit: { facilityId: filterDto.facilityId } },
        },
      };
    }

    const [total, data] = await Promise.all([
      this.prisma.contractRenewal.count({ where }),
      this.prisma.contractRenewal.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          contract: {
            select: {
              id: true,
              contractCode: true,
              status: true,
              startDate: true,
              endDate: true,
              customer: {
                select: { id: true, fullName: true, email: true, phone: true },
              },
            },
          },
          requester: {
            select: { id: true, fullName: true, email: true },
          },
          approver: {
            select: { id: true, fullName: true, email: true },
          },
        },
      }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Xem chi tiết một yêu cầu gia hạn
   */
  async getRenewalById(id: string, user: any) {
    const renewal = await this.prisma.contractRenewal.findUnique({
      where: { id },
      include: {
        contract: {
          include: {
            customer: {
              select: { id: true, fullName: true, email: true, phone: true },
            },
            contractItems: {
              include: {
                unit: {
                  include: {
                    facility: { select: { id: true, name: true, code: true } },
                    unitType: { select: { id: true, name: true, size: true } },
                  },
                },
              },
            },
          },
        },
        requester: {
          select: { id: true, fullName: true, email: true, phone: true },
        },
        approver: {
          select: { id: true, fullName: true, email: true, phone: true },
        },
      },
    });

    if (!renewal) {
      throw new NotFoundException(`Yêu cầu gia hạn #${id} không tồn tại`);
    }

    const userRole = typeof user.role === 'string' ? user.role : user.role?.name;
    if (
      userRole === UserRole.STORAGE_CUSTOMER &&
      renewal.contract.customerId !== user.id &&
      renewal.requestedBy !== user.id
    ) {
      throw new ForbiddenException('Bạn không có quyền xem yêu cầu gia hạn này');
    }

    return renewal;
  }

  /**
   * Khách hàng hủy yêu cầu gia hạn đang ở trạng thái PENDING
   */
  async cancelRenewal(id: string, user: any) {
    const renewal = await this.prisma.contractRenewal.findUnique({
      where: { id },
      include: { contract: true },
    });

    if (!renewal) {
      throw new NotFoundException(`Yêu cầu gia hạn #${id} không tồn tại`);
    }

    const userRole = typeof user.role === 'string' ? user.role : user.role?.name;
    if (
      userRole === UserRole.STORAGE_CUSTOMER &&
      renewal.requestedBy !== user.id &&
      renewal.contract.customerId !== user.id
    ) {
      throw new ForbiddenException('Bạn không có quyền hủy yêu cầu gia hạn này');
    }

    if (renewal.status !== RenewalStatus.PENDING) {
      throw new BadRequestException(
        `Chỉ có thể hủy yêu cầu gia hạn đang ở trạng thái PENDING (hiện tại: ${renewal.status})`,
      );
    }

    return this.prisma.contractRenewal.update({
      where: { id },
      data: { status: RenewalStatus.CANCELLED },
    });
  }

  /**
   * Nhân viên / Quản lý phê duyệt yêu cầu gia hạn
   * Cập nhật ngày hết hạn hợp đồng mới, khôi phục trạng thái ACTIVE và mở khóa truy cập nếu đang quá hạn.
   */
  async approveRenewal(id: string, user: any, dto?: ApproveRenewalDto) {
    const renewal = await this.prisma.contractRenewal.findUnique({
      where: { id },
      include: {
        contract: {
          include: {
            contractItems: true,
            overdueRecords: { where: { status: OverdueStatus.OPEN } },
          },
        },
      },
    });

    if (!renewal) {
      throw new NotFoundException(`Yêu cầu gia hạn #${id} không tồn tại`);
    }

    if (renewal.status !== RenewalStatus.PENDING) {
      throw new BadRequestException(
        `Yêu cầu gia hạn không ở trạng thái PENDING (hiện tại: ${renewal.status})`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Cập nhật bản ghi gia hạn
      const updatedRenewal = await tx.contractRenewal.update({
        where: { id },
        data: {
          status: RenewalStatus.APPROVED,
          approvedBy: user.id,
        },
      });

      // 2. Cập nhật ngày kết thúc mới cho hợp đồng
      const updatedContract = await tx.rentalContract.update({
        where: { id: renewal.contractId },
        data: {
          endDate: renewal.newEndDate,
          status: ContractStatus.ACTIVE, // Đảm bảo hợp đồng ở trạng thái ACTIVE
        },
      });

      // 3. Khôi phục quyền truy cập mã khóa số nếu trước đó bị khóa/quá hạn
      await tx.contractItem.updateMany({
        where: { contractId: renewal.contractId },
        data: { accessCodeStatus: AccessCodeStatus.ACTIVE },
      });

      // 4. Nếu có bản ghi phạt quá hạn đang mở, tự động giải quyết (RESOLVED)
      if (renewal.contract.overdueRecords.length > 0) {
        await tx.overdueRecord.updateMany({
          where: {
            contractId: renewal.contractId,
            status: OverdueStatus.OPEN,
          },
          data: {
            status: OverdueStatus.RESOLVED,
            resolvedBy: user.id,
            resolvedAt: new Date(),
          },
        });
      }

      this.logger.log(
        `Hợp đồng #${updatedContract.contractCode} đã được gia hạn thành công đến ngày ${renewal.newEndDate.toISOString()}`,
      );

      return {
        message: 'Phê duyệt gia hạn hợp đồng thành công',
        renewal: updatedRenewal,
        contract: updatedContract,
        notes: dto?.notes,
      };
    });
  }

  /**
   * Nhân viên / Quản lý từ chối yêu cầu gia hạn
   */
  async rejectRenewal(id: string, user: any, dto: RejectRenewalDto) {
    const renewal = await this.prisma.contractRenewal.findUnique({
      where: { id },
    });

    if (!renewal) {
      throw new NotFoundException(`Yêu cầu gia hạn #${id} không tồn tại`);
    }

    if (renewal.status !== RenewalStatus.PENDING) {
      throw new BadRequestException(
        `Yêu cầu gia hạn không ở trạng thái PENDING (hiện tại: ${renewal.status})`,
      );
    }

    return this.prisma.contractRenewal.update({
      where: { id },
      data: {
        status: RenewalStatus.REJECTED,
        approvedBy: user.id,
      },
    });
  }

  // =========================================================================
  // 2. CRON JOB & QUẢN LÝ QUÁ HẠN (STORAGE OVERDUE HANDLING)
  // =========================================================================

  /**
   * CRON JOB: Chạy tự động mỗi ngày vào lúc nửa đêm (00:00:00)
   * 1. Quét gửi cảnh báo hợp đồng sắp hết hạn trong vòng 3 ngày và 7 ngày
   * 2. Quét các hợp đồng đã quá hạn: Cập nhật trạng thái OVERDUE, khóa mã truy cập và tính phí phạt
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleDailyContractExpiryCron() {
    this.logger.log('--- [CRON] BẮT ĐẦU QUÉT HỢP ĐỒNG ĐỊNH KỲ HÀNG NGÀY ---');
    await this.scanAndProcessOverdueContracts();
    this.logger.log('--- [CRON] HOÀN TẤT QUÉT HỢP ĐỒNG ĐỊNH KỲ ---');
  }

  /**
   * Hàm cốt lõi thực hiện quét và xử lý quá hạn
   * Được gọi tự động bởi Cron Job hoặc gọi thủ công qua endpoint API cho Admin/Staff
   */
  async scanAndProcessOverdueContracts() {
    const now = new Date();

    // -------------------------------------------------------------
    // Bước 1: Quét hợp đồng sắp hết hạn (Expiry Warning Notifications)
    // -------------------------------------------------------------
    const warningDays = [3, 7];
    for (const days of warningDays) {
      const targetDateStart = new Date();
      targetDateStart.setDate(targetDateStart.getDate() + days);
      targetDateStart.setHours(0, 0, 0, 0);

      const targetDateEnd = new Date(targetDateStart);
      targetDateEnd.setHours(23, 59, 59, 999);

      const expiringContracts = await this.prisma.rentalContract.findMany({
        where: {
          status: ContractStatus.ACTIVE,
          endDate: { gte: targetDateStart, lte: targetDateEnd },
        },
        include: {
          customer: { select: { id: true, fullName: true, email: true, phone: true } },
          contractItems: {
            include: { unit: { include: { unitType: true } } },
          },
          overdueRecords: true,
        },
      });

      if (expiringContracts.length > 0) {
        this.logger.warn(
          `[EXPIRY WARNING] Phát hiện ${expiringContracts.length} hợp đồng sắp hết hạn trong ${days} ngày tới. Đang chạy mô hình AI chấm điểm gia hạn...`,
        );

        // Chuẩn bị vector đặc trưng gửi sang AI Service
        const featurePayload = expiringContracts.map((c) => {
          const start = new Date(c.startDate);
          const rentedMonths = Math.max(
            1,
            Math.round((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30)),
          );
          const sizeM2 = c.contractItems[0]?.unit?.unitType?.size || 6.0;

          return {
            contractId: c.id,
            contractCode: c.contractCode,
            endDate: c.endDate.toISOString().slice(0, 10),
            rented_months: rentedMonths,
            unit_size_m2: Number(sizeM2),
            price_per_m2_ratio: 1.0,
            late_payments_count: c.overdueRecords.length,
            overdue_fees_count: c.overdueRecords.length,
            access_count_last_30d: 4,
            days_since_last_access: 3,
            support_tickets_count: 0,
            has_discount: 1,
            month_of_year: c.endDate.getMonth() + 1,
            facility_occupancy_rate: 0.85,
          };
        });

        const predictions = await this.aiService.predictRenewalsBatch(featurePayload);

        for (const c of expiringContracts) {
          const pred = predictions.find((p: any) => p.contract_id === c.id);
          const messageBody = pred?.personalized_message ||
            `Hợp đồng #${c.contractCode} của bạn sẽ hết hạn vào ngày ${c.endDate.toISOString().slice(0, 10)}. Vui lòng kiểm tra và gia hạn sớm!`;

          this.logger.log(
            ` - Hợp đồng #${c.contractCode} (Khách: ${c.customer.fullName}) -> Xác suất gia hạn: ${pred?.renewal_probability ?? 'N/A'} (Mức: ${pred?.probability_tier ?? 'N/A'}, Gợi ý: Gói ${pred?.recommended_package ?? 3} tháng)`,
          );

          // 1. Lưu bản ghi dự đoán vào AiPrediction
          if (pred) {
            try {
              await this.prisma.aiPrediction.create({
                data: {
                  contractId: c.id,
                  renewalProbability: pred.renewal_probability,
                  recommendedPackage: pred.recommended_package,
                  probabilityTier: pred.probability_tier,
                  action: pred.action,
                  modelVersion: pred.model_version || 'v1.0',
                },
              });
            } catch (e: any) {
              this.logger.warn(`Lỗi lưu AiPrediction: ${e?.message}`);
            }
          }

          // 2. Gửi thông báo trực tiếp đến khách hàng
          try {
            await this.notificationsService.create({
              userId: c.customerId,
              title: `[Nhắc gia hạn] Hợp đồng #${c.contractCode} sắp hết hạn trong ${days} ngày`,
              body: messageBody,
              type: NotificationType.RENEWAL,
              entityType: 'CONTRACT',
              entityId: c.id,
              metadata: pred ? {
                probabilityTier: pred.probability_tier,
                recommendedPackage: pred.recommended_package,
                action: pred.action,
              } : undefined,
            });
          } catch (e: any) {
            this.logger.warn(`Lỗi gửi notification gia hạn: ${e?.message}`);
          }
        }
      }
    }

    // -------------------------------------------------------------
    // Bước 2: Quét hợp đồng đã QUÁ HẠN (Áp dụng chính sách Ân hạn / Phạt / Overlock từ Ops Manager)
    // -------------------------------------------------------------
    const overduePolicies = await this.prisma.policy.findMany({
      where: {
        policyType: 'OVERDUE',
        status: 'ACTIVE',
      },
      orderBy: { effectiveFrom: 'desc' },
    });

    const getOverduePolicyForFacility = (facilityId?: string) => {
      const specific = facilityId
        ? overduePolicies.find((p) => p.facilityId === facilityId)
        : null;
      const global = overduePolicies.find((p) => !p.facilityId);
      const chosen = specific || global || overduePolicies[0];
      const val: any = chosen?.value || {};
      const liquidationThresholdDays = Number(
        val.liquidationThresholdDays ?? val.gracePeriodDays ?? val.grace_period_days ?? 7,
      );
      const dailyFinePercent = Number(
        val.dailyFinePercent ?? val.daily_fine_rate ?? 1.5,
      );
      return {
        liquidationThresholdDays: Number.isFinite(liquidationThresholdDays)
          ? Math.max(0, liquidationThresholdDays)
          : 7,
        dailyFinePercent: Number.isFinite(dailyFinePercent) ? Math.max(0, dailyFinePercent) : 1.5,
      };
    };

    const overdueContracts = await this.prisma.rentalContract.findMany({
      where: {
        endDate: { lt: now },
        status: { in: [ContractStatus.ACTIVE, ContractStatus.OVERDUE] },
      },
      include: {
        customer: true,
        contractItems: {
          include: {
            unit: { select: { id: true, unitNumber: true, facilityId: true } },
          },
        },
        overdueRecords: {
          where: { status: OverdueStatus.OPEN },
        },
      },
    });

    this.logger.log(`[OVERDUE SCAN] Tìm thấy ${overdueContracts.length} hợp đồng quá hạn.`);

    let newlyOverdueCount = 0;
    let lockedAccessCount = 0;
    let updatedFeeCount = 0;

    for (const contract of overdueContracts) {
      const facId = contract.contractItems[0]?.unit?.facilityId;
      const policy = getOverduePolicyForFacility(facId);

      // 1. Chuyển trạng thái hợp đồng sang OVERDUE
      if (contract.status !== ContractStatus.OVERDUE) {
        await this.prisma.rentalContract.update({
          where: { id: contract.id },
          data: { status: ContractStatus.OVERDUE },
        });
        newlyOverdueCount++;
      }

      // 2. Tính toán số ngày quá hạn thực tế: MỖI ngày trễ đều bị tính phạt theo % Ops Manager đặt;
      //    quá liquidationThresholdDays mới chuyển sang diện Thanh lý kho
      const diffMs = now.getTime() - new Date(contract.endDate).getTime();
      const overdueDays = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
      const billableOverdueDays = overdueDays;

      // 3. Gửi thông báo theo mốc quá hạn (<= N ngày nhắc phạt, > N ngày báo diện thanh lý cho Khách & Manager)
      const unitNames =
        contract.contractItems.map((ci) => ci.unit?.unitNumber).filter(Boolean).join(', ') ||
        contract.contractCode;

      if (overdueDays > policy.liquidationThresholdDays) {
        this.logger.warn(
          `[LIQUIDATION READY] Hợp đồng #${contract.contractCode} đã quá ${overdueDays}/${policy.liquidationThresholdDays} ngày chờ trước thanh lý -> Đủ điều kiện thanh lý kho.`,
        );
        await this.sendOverdueLiquidationAlerts(
          contract,
          unitNames,
          overdueDays,
          policy.liquidationThresholdDays,
          facId,
        );
      } else {
        await this.sendOverdueReminderToCustomer(contract, unitNames, overdueDays);
      }

      // 4. Tính tiền phạt quá hạn theo chính sách (% trên tiền thuê tháng * TỔNG số ngày trễ thực tế)
      const totalMonthlyRent = contract.contractItems.reduce(
        (sum, item) => sum + (Number(item.rentalPrice) || 0),
        0,
      );

      const overdueFee = Math.round(
        totalMonthlyRent * (policy.dailyFinePercent / 100) * billableOverdueDays,
      );

      // 5. Tạo hoặc cập nhật bản ghi OverdueRecord
      const openRecord = contract.overdueRecords[0];

      if (!openRecord) {
        await this.prisma.overdueRecord.create({
          data: {
            contractId: contract.id,
            overdueStartDate: contract.endDate,
            overdueDays,
            overdueFee,
            status: OverdueStatus.OPEN,
          },
        });
        updatedFeeCount++;
      } else if (
        openRecord.overdueDays !== overdueDays ||
        openRecord.overdueFee !== overdueFee
      ) {
        await this.prisma.overdueRecord.update({
          where: { id: openRecord.id },
          data: {
            overdueDays,
            overdueFee,
          },
        });
        updatedFeeCount++;
      }
    }

    return {
      scannedAt: now,
      totalOverdueFound: overdueContracts.length,
      newlyOverdueContracts: newlyOverdueCount,
      smartLocksRevoked: lockedAccessCount,
      overdueRecordsProcessed: updatedFeeCount,
    };
  }

  /**
   * Tra cứu danh sách các bản ghi quá hạn (Dành cho Quản lý / Nhân viên)
   */
  async getOverdueRecords(user: any, filterDto: FilterOverdueDto) {
    const page = Number(filterDto.page) || 1;
    const limit = Number(filterDto.limit) || 10;
    const skip = (page - 1) * limit;

    const userRole = typeof user.role === 'string' ? user.role : user.role?.name;
    const where: any = {};

    if (filterDto.status) {
      where.status = filterDto.status;
    }

    if (
      (userRole === UserRole.FACILITY_STAFF || userRole === UserRole.FACILITY_MANAGER) &&
      user.facilityId
    ) {
      where.contract = {
        contractItems: {
          some: { unit: { facilityId: user.facilityId } },
        },
      };
    } else if (filterDto.facilityId) {
      where.contract = {
        contractItems: {
          some: { unit: { facilityId: filterDto.facilityId } },
        },
      };
    }

    const [total, rawData, overduePolicies] = await Promise.all([
      this.prisma.overdueRecord.count({ where }),
      this.prisma.overdueRecord.findMany({
        where,
        skip,
        take: limit,
        orderBy: { overdueStartDate: 'desc' },
        include: {
          contract: {
            include: {
              customer: {
                select: { id: true, fullName: true, email: true, phone: true },
              },
              contractItems: {
                include: {
                  unit: {
                    select: {
                      id: true,
                      unitNumber: true,
                      facilityId: true,
                      facility: { select: { id: true, name: true } },
                      unitType: { select: { id: true, name: true, size: true } },
                    },
                  },
                },
              },
            },
          },
          resolver: {
            select: { id: true, fullName: true, email: true },
          },
        },
      }),
      this.prisma.policy.findMany({
        where: { policyType: 'OVERDUE', status: 'ACTIVE' },
        orderBy: { effectiveFrom: 'desc' },
      }),
    ]);

    const data = rawData.map((rec) => {
      const facId = rec.contract?.contractItems?.[0]?.unit?.facilityId;
      const pol =
        (facId && overduePolicies.find((p) => p.facilityId === facId)) ||
        overduePolicies.find((p) => !p.facilityId) ||
        overduePolicies[0];
      const val: any = pol?.value || {};
      const liquidationThresholdDays = Number(
        val.liquidationThresholdDays ?? val.gracePeriodDays ?? val.grace_period_days ?? 7,
      );
      const dailyFinePercent = Number(val.dailyFinePercent ?? val.daily_fine_rate ?? 1.5);
      return {
        ...rec,
        daysOverdue: rec.overdueDays,
        liquidationThresholdDays: Number.isFinite(liquidationThresholdDays)
          ? Math.max(0, liquidationThresholdDays)
          : 7,
        dailyFinePercent: Number.isFinite(dailyFinePercent) ? Math.max(0, dailyFinePercent) : 1.5,
      };
    });

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Giải quyết tình trạng quá hạn (RESOLVED) khi khách hàng thanh toán xong tiền phạt
   * Có tùy chọn gia hạn thêm hợp đồng hoặc mở lại mã PIN khóa
   */
  async resolveOverdue(id: string, user: any, dto: ResolveOverdueDto) {
    const record = await this.prisma.overdueRecord.findUnique({
      where: { id },
      include: {
        contract: {
          include: { contractItems: true },
        },
      },
    });

    if (!record) {
      throw new NotFoundException(`Bản ghi quá hạn #${id} không tồn tại`);
    }

    if (record.status !== OverdueStatus.OPEN) {
      throw new BadRequestException(
        `Bản ghi quá hạn này đã được xử lý (trạng thái: ${record.status})`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Đóng bản ghi quá hạn sang RESOLVED
      const updatedRecord = await tx.overdueRecord.update({
        where: { id },
        data: {
          status: OverdueStatus.RESOLVED,
          resolvedBy: user.id,
          resolvedAt: new Date(),
        },
      });

      // 2. Mở lại quyền truy cập smart lock cho các ngăn kho
      await tx.contractItem.updateMany({
        where: { contractId: record.contractId },
        data: { accessCodeStatus: AccessCodeStatus.ACTIVE },
      });

      let updatedContract = record.contract;

      // 3. Nếu có gia hạn thêm hợp đồng
      if (dto.extendMonths && dto.extendMonths > 0) {
        const newEndDate = new Date();
        newEndDate.setMonth(newEndDate.getMonth() + dto.extendMonths);

        updatedContract = await tx.rentalContract.update({
          where: { id: record.contractId },
          data: {
            endDate: newEndDate,
            status: ContractStatus.ACTIVE,
          },
          include: { contractItems: true },
        });
      }

      return {
        message: 'Đã giải quyết tình trạng quá hạn thành công và mở lại quyền truy cập',
        overdueRecord: updatedRecord,
        contract: updatedContract,
        notes: dto.notes,
      };
    });
  }

  /**
   * Miễn giảm phí phạt quá hạn (WAIVED)
   */
  async waiveOverdue(id: string, user: any, notes?: string) {
    const record = await this.prisma.overdueRecord.findUnique({
      where: { id },
    });

    if (!record) {
      throw new NotFoundException(`Bản ghi quá hạn #${id} không tồn tại`);
    }

    if (record.status !== OverdueStatus.OPEN) {
      throw new BadRequestException(
        `Bản ghi quá hạn này đã được xử lý (trạng thái: ${record.status})`,
      );
    }

    const updated = await this.prisma.overdueRecord.update({
      where: { id },
      data: {
        status: OverdueStatus.WAIVED,
        resolvedBy: user.id,
        resolvedAt: new Date(),
      },
    });

    return {
      message: 'Đã miễn giảm phí phạt quá hạn thành công',
      overdueRecord: updated,
      notes,
    };
  }

  // =========================================================================
  // 3. LUỒNG YÊU CẦU & THỰC HIỆN THANH LÝ KHO QUÁ HẠN (MANAGER -> STAFF)
  // =========================================================================

  private async getFacilityUsersByRoles(facilityId: string, roleNames: UserRole[]) {
    const assignments = await this.prisma.staffFacilityAssignment.findMany({
      where: {
        facilityId,
        user: {
          role: { name: { in: roleNames } },
        },
      },
      include: {
        user: { select: { id: true, fullName: true, email: true, role: { select: { name: true } } } },
      },
    });
    return assignments.filter((a) => !a.endedAt).map((a) => a.user);
  }

  private async sendOverdueReminderToCustomer(
    contract: any,
    unitNames: string,
    overdueDays: number,
  ) {
    try {
      const existing = await this.prisma.notification.findFirst({
        where: {
          userId: contract.customerId,
          entityId: contract.id,
          type: NotificationType.OVERDUE,
          title: { contains: 'đã quá hạn' },
        },
      });
      if (existing) return;
      await this.notificationsService.create({
        userId: contract.customerId,
        type: NotificationType.OVERDUE,
        title: `Ô kho #${unitNames} đã quá hạn ${overdueDays} ngày`,
        body: `Hợp đồng #${contract.contractCode} đã quá hạn. Hệ thống đang tính phí phạt trễ hạn mỗi ngày. Vui lòng gia hạn hoặc làm thủ tục trả kho sớm để tránh bị thanh lý kho.`,
        entityType: 'RENTAL_CONTRACT',
        entityId: contract.id,
        metadata: { phase: 'OVERDUE_REMINDER', contractCode: contract.contractCode, overdueDays },
      });
    } catch (err: any) {
      this.logger.warn(`Failed to send overdue reminder: ${err?.message}`);
    }
  }

  private async sendOverdueLiquidationAlerts(
    contract: any,
    unitNames: string,
    overdueDays: number,
    thresholdDays: number,
    facilityId?: string,
  ) {
    try {
      const existingCust = await this.prisma.notification.findFirst({
        where: {
          userId: contract.customerId,
          entityId: contract.id,
          type: NotificationType.OVERDUE,
          title: { contains: 'thanh lý' },
        },
      });
      if (!existingCust) {
        await this.notificationsService.create({
          userId: contract.customerId,
          type: NotificationType.OVERDUE,
          title: `Kho #${unitNames} đã quá hạn và chuyển sang diện thanh lý`,
          body: `Hợp đồng #${contract.contractCode} đã quá hạn ${overdueDays} ngày (vượt ngưỡng ${thresholdDays} ngày quy định). Kho của bạn đã được chuyển sang diện thanh lý theo quy định.`,
          entityType: 'RENTAL_CONTRACT',
          entityId: contract.id,
          metadata: { phase: 'LIQUIDATION_ELIGIBLE', contractCode: contract.contractCode, overdueDays },
        });
      }

      if (facilityId) {
        const managers = await this.getFacilityUsersByRoles(facilityId, [
          UserRole.FACILITY_MANAGER,
        ]);
        for (const mgr of managers) {
          const existingMgr = await this.prisma.notification.findFirst({
            where: {
              userId: mgr.id,
              entityId: contract.id,
              type: NotificationType.OVERDUE,
              title: { contains: 'đủ điều kiện thanh lý' },
            },
          });
          if (!existingMgr) {
            await this.notificationsService.create({
              userId: mgr.id,
              type: NotificationType.OVERDUE,
              title: `Kho quá hạn #${unitNames} đủ điều kiện thanh lý`,
              body: `Hợp đồng #${contract.contractCode} của ${contract.customer?.fullName || 'khách hàng'} đã quá hạn ${overdueDays} ngày (> ${thresholdDays} ngày). Vui lòng xem xét và yêu cầu nhân viên thanh lý kho.`,
              entityType: 'RENTAL_CONTRACT',
              entityId: contract.id,
              metadata: {
                phase: 'LIQUIDATION_ELIGIBLE',
                facilityId,
                contractCode: contract.contractCode,
                overdueDays,
              },
            });
          }
        }
      }
    } catch (err: any) {
      this.logger.warn(`Failed to send liquidation alerts: ${err?.message}`);
    }
  }

  /**
   * Manager yêu cầu toàn bộ Staff chi nhánh thực hiện thanh lý kho quá hạn
   * - Thu hồi ngay mã PIN Smart Lock của khách (REVOKED)
   * - Đặt liquidationStatus = REQUESTED và gửi thông báo tới Staff chi nhánh & Khách
   */
  async requestLiquidation(id: string, user: any, dto: RequestLiquidationDto) {
    const record = await this.prisma.overdueRecord.findUnique({
      where: { id },
      include: {
        contract: {
          include: {
            customer: { select: { id: true, fullName: true, email: true, phone: true } },
            reservation: {
              select: {
                facilityId: true,
                facility: { select: { id: true, name: true } },
              },
            },
            contractItems: {
              include: {
                unit: { select: { id: true, unitNumber: true, facilityId: true } },
              },
            },
          },
        },
      },
    });

    if (!record) {
      throw new NotFoundException(`Bản ghi quá hạn #${id} không tồn tại`);
    }
    if (record.status !== OverdueStatus.OPEN) {
      throw new BadRequestException(
        `Không thể yêu cầu thanh lý vì hồ sơ quá hạn đã ở trạng thái '${record.status}'`,
      );
    }
    if (record.liquidationStatus === 'REQUESTED') {
      throw new BadRequestException('Hồ sơ này đã được gửi yêu cầu thanh lý cho nhân viên rồi.');
    }

    const facilityId =
      record.contract.reservation?.facilityId ||
      record.contract.contractItems?.[0]?.unit?.facilityId;

    const userRole = typeof user.role === 'string' ? user.role : user.role?.name;
    if (userRole === UserRole.FACILITY_MANAGER && user.facilityId && facilityId !== user.facilityId) {
      throw new ForbiddenException('Bạn chỉ có thể yêu cầu thanh lý kho thuộc cơ sở mình quản lý');
    }

    const updatedRecord = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.overdueRecord.update({
        where: { id },
        data: {
          liquidationStatus: 'REQUESTED',
          liquidationRequestedBy: user.id,
          liquidationRequestedAt: new Date(),
          liquidationNotes:
            dto.notes?.trim() ||
            `Quản lý yêu cầu thanh lý kho quá hạn (${record.overdueDays} ngày)`,
        },
      });

      // Thu hồi quyền truy cập Smart Lock của khách ngay lập tức
      await tx.contractItem.updateMany({
        where: { contractId: record.contractId },
        data: { accessCodeStatus: AccessCodeStatus.REVOKED },
      });

      return updated;
    });

    const unitNames =
      record.contract.contractItems.map((ci) => ci.unit?.unitNumber).filter(Boolean).join(', ') ||
      record.contract.contractCode;

    // Thông báo cho toàn bộ Staff thuộc chi nhánh & Khách hàng
    if (facilityId) {
      const staffList = await this.getFacilityUsersByRoles(facilityId, [
        UserRole.FACILITY_STAFF,
      ]);
      for (const staff of staffList) {
        await this.notificationsService
          .create({
            userId: staff.id,
            type: NotificationType.OVERDUE,
            title: `Yêu cầu thanh lý kho quá hạn #${unitNames}`,
            body: `Quản lý yêu cầu thanh lý ô kho #${unitNames} (HĐ #${record.contract.contractCode}, quá hạn ${record.overdueDays} ngày). Vui lòng vào mục Thanh lý kho để kiểm kê và hoàn tất.`,
            entityType: 'OVERDUE_LIQUIDATION',
            entityId: record.id,
            metadata: {
              overdueRecordId: record.id,
              contractId: record.contractId,
              facilityId,
              unitNumber: unitNames,
            },
          })
          .catch(() => null);
      }
    }

    await this.notificationsService
      .create({
        userId: record.contract.customerId,
        type: NotificationType.OVERDUE,
        title: `Kho #${unitNames} đang được tiến hành thanh lý`,
        body: `Quản lý cơ sở đã kích hoạt lệnh thanh lý cho hợp đồng quá hạn #${record.contract.contractCode}. Mã PIN mở khóa đã được tạm khóa để nhân viên kiểm kê xử lý.`,
        entityType: 'RENTAL_CONTRACT',
        entityId: record.contractId,
        metadata: { overdueRecordId: record.id, contractCode: record.contract.contractCode },
      })
      .catch(() => null);

    return {
      message: `Đã khóa PIN khách hàng và gửi lệnh thanh lý ô kho #${unitNames} cho nhân viên chi nhánh`,
      overdueRecord: updatedRecord,
    };
  }

  /**
   * Lấy danh sách đơn Thanh lý kho cho nhân viên / quản lý chi nhánh
   */
  async getLiquidations(user: any, filterDto: FilterOverdueDto) {
    const userRole = typeof user.role === 'string' ? user.role : user.role?.name;
    const where: any = {
      liquidationStatus: { in: ['REQUESTED', 'COMPLETED'] },
    };

    if (
      (userRole === UserRole.FACILITY_STAFF || userRole === UserRole.FACILITY_MANAGER) &&
      user.facilityId
    ) {
      where.contract = {
        contractItems: {
          some: { unit: { facilityId: user.facilityId } },
        },
      };
    } else if (filterDto.facilityId) {
      where.contract = {
        contractItems: {
          some: { unit: { facilityId: filterDto.facilityId } },
        },
      };
    }

    const records = await this.prisma.overdueRecord.findMany({
      where,
      orderBy: [{ liquidationStatus: 'desc' }, { liquidationRequestedAt: 'desc' }],
      include: {
        contract: {
          include: {
            customer: {
              select: { id: true, fullName: true, email: true, phone: true },
            },
            reservation: {
              select: {
                facilityId: true,
                facility: { select: { id: true, name: true, code: true } },
              },
            },
            contractItems: {
              include: {
                unit: {
                  include: {
                    unitType: { select: { id: true, name: true, size: true } },
                    facility: { select: { id: true, name: true } },
                  },
                },
                handoverRecords: {
                  where: { type: HandoverType.CHECK_IN },
                  orderBy: { createdAt: 'desc' },
                  take: 1,
                },
              },
            },
          },
        },
        resolver: {
          select: { id: true, fullName: true, email: true },
        },
      },
    });

    return records;
  }

  /**
   * Staff hoàn tất quy trình thanh lý kho quá hạn:
   * - Kiểm kê chụp ảnh đồ tồn kho + đổi PIN Smart Lock mới
   * - Tịch thu / cấn trừ toàn bộ tiền cọc vào tiền phạt (không hoàn cọc)
   * - Giải phóng ô kho (AVAILABLE / UNDER_MAINTENANCE), đóng hợp đồng (TERMINATED) & OverdueRecord (RESOLVED)
   */
  async completeLiquidation(id: string, user: any, dto: CompleteLiquidationDto) {
    const record = await this.prisma.overdueRecord.findUnique({
      where: { id },
      include: {
        contract: {
          include: {
            customer: { select: { id: true, fullName: true, email: true, phone: true } },
            reservation: {
              select: {
                facilityId: true,
                facility: { select: { id: true, name: true } },
              },
            },
            contractItems: {
              include: {
                unit: true,
              },
            },
          },
        },
      },
    });

    if (!record) {
      throw new NotFoundException(`Đơn thanh lý #${id} không tồn tại`);
    }
    if (record.liquidationStatus !== 'REQUESTED' || record.status !== OverdueStatus.OPEN) {
      throw new BadRequestException(
        'Đơn thanh lý này không ở trạng thái chờ nhân viên xử lý (REQUESTED)',
      );
    }

    const facilityId =
      record.contract.reservation?.facilityId ||
      record.contract.contractItems?.[0]?.unit?.facilityId;
    const userRole = typeof user.role === 'string' ? user.role : user.role?.name;
    if (
      (userRole === UserRole.FACILITY_STAFF || userRole === UserRole.FACILITY_MANAGER) &&
      user.facilityId &&
      facilityId !== user.facilityId
    ) {
      throw new ForbiddenException('Bạn không thuộc chi nhánh của đơn thanh lý này');
    }

    const cleanPin = dto.newAccessCode.trim();
    const oldPins = record.contract.contractItems.map((ci) => ci.accessCode).filter(Boolean);
    if (oldPins.includes(cleanPin)) {
      throw new BadRequestException('Mã PIN mới không được trùng với mã PIN cũ của ô kho');
    }

    const totalDeposit = record.contract.contractItems.reduce(
      (sum, ci) => sum + Number(ci.depositAmount || 0),
      0,
    );
    const overdueFine = Number(record.overdueFee || 0);
    const remainingDebt = Math.max(0, overdueFine - totalDeposit);
    const targetUnitStatus = dto.unitCondition || StorageUnitStatus.AVAILABLE;

    const result = await this.prisma.$transaction(async (tx) => {
      const handoverNotes = [
        `[BIÊN BẢN THANH LÝ KHO QUÁ HẠN] Quá hạn ${record.overdueDays} ngày.`,
        dto.notes?.trim(),
        `Đổi mã PIN mới: ${cleanPin}.`,
        `Tịch thu & cấn trừ tiền cọc: ${totalDeposit.toLocaleString('vi-VN')} đ (Không hoàn cọc).`,
        `Phạt quá hạn lũy tiến: ${overdueFine.toLocaleString('vi-VN')} đ.`,
        remainingDebt > 0
          ? `Công nợ còn lại sau cấn trừ cọc: ${remainingDebt.toLocaleString('vi-VN')} đ.`
          : 'Đã cấn trừ hết trong tiền cọc.',
      ]
        .filter(Boolean)
        .join(' ');

      for (const item of record.contract.contractItems) {
        await tx.handoverRecord.create({
          data: {
            contractItemId: item.id,
            staffId: user.id,
            type: HandoverType.CHECK_OUT,
            condition: dto.condition,
            notes: handoverNotes,
            photos: dto.photos
              ? (dto.photos as unknown as Prisma.InputJsonValue)
              : null,
            inspectionDate: new Date(),
          },
        });

        await tx.contractItem.update({
          where: { id: item.id },
          data: {
            status: ContractItemStatus.RETURNED,
            accessCodeStatus: AccessCodeStatus.REVOKED,
            accessCode: cleanPin,
          },
        });

        await tx.storageUnit.update({
          where: { id: item.unitId },
          data: { status: targetUnitStatus },
        });
      }

      if (overdueFine > 0) {
        const feeType = await tx.feeType.findFirst({ where: { status: 'ACTIVE' } });
        if (feeType) {
          await tx.extraCharge.create({
            data: {
              contractId: record.contractId,
              feeTypeId: feeType.id,
              amount: overdueFine,
              reason: `Thanh lý kho quá hạn (${record.overdueDays} ngày) - Cấn trừ tiền cọc ${totalDeposit.toLocaleString('vi-VN')} đ`,
              status: ExtraChargeStatus.PAID,
              createdBy: user.id,
            },
          });
        }
      }

      const updatedOverdue = await tx.overdueRecord.update({
        where: { id },
        data: {
          status: OverdueStatus.RESOLVED,
          liquidationStatus: 'COMPLETED',
          resolvedBy: user.id,
          resolvedAt: new Date(),
          liquidationCondition: dto.condition,
          liquidationPhotos: dto.photos
            ? (dto.photos as unknown as Prisma.InputJsonValue)
            : null,
          liquidationNewPin: cleanPin,
          liquidationForfeitedDeposit: totalDeposit,
          liquidationRemainingDebt: remainingDebt,
        },
      });

      const updatedContract = await tx.rentalContract.update({
        where: { id: record.contractId },
        data: { status: ContractStatus.TERMINATED },
      });

      return { updatedOverdue, updatedContract };
    });

    const unitNames =
      record.contract.contractItems.map((ci) => ci.unit?.unitNumber).filter(Boolean).join(', ') ||
      record.contract.contractCode;

    // Gửi thông báo cho Khách hàng và Manager chi nhánh
    await this.notificationsService
      .create({
        userId: record.contract.customerId,
        type: NotificationType.OVERDUE,
        title: `Đã hoàn tất thanh lý ô kho #${unitNames}`,
        body: `Hợp đồng quá hạn #${record.contract.contractCode} đã được thanh lý. Tiền cọc (${totalDeposit.toLocaleString('vi-VN')} đ) đã được cấn trừ vào phí phạt trễ hạn và ô kho đã được thu hồi.`,
        entityType: 'RENTAL_CONTRACT',
        entityId: record.contractId,
        metadata: { overdueRecordId: record.id, contractCode: record.contract.contractCode },
      })
      .catch(() => null);

    if (facilityId) {
      const managers = await this.getFacilityUsersByRoles(facilityId, [
        UserRole.FACILITY_MANAGER,
      ]);
      for (const mgr of managers) {
        await this.notificationsService
          .create({
            userId: mgr.id,
            type: NotificationType.OVERDUE,
            title: `Nhân viên đã hoàn tất thanh lý kho #${unitNames}`,
            body: `${user.fullName || 'Nhân viên'} đã hoàn tất kiểm kê, đổi PIN và thu hồi ô kho #${unitNames} (HĐ #${record.contract.contractCode}).`,
            entityType: 'OVERDUE_LIQUIDATION',
            entityId: record.id,
            metadata: { overdueRecordId: record.id, facilityId, unitNumber: unitNames },
          })
          .catch(() => null);
      }
    }

    return {
      message: `Đã hoàn tất thanh lý ô kho #${unitNames}`,
      overdueRecord: result.updatedOverdue,
      contract: result.updatedContract,
      forfeitedDeposit: totalDeposit,
      overdueFine,
      remainingDebt,
    };
  }
}
