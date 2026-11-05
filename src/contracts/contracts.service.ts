import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import {
  CreateStoredItemDto,
  UpdateStoredItemDto,
} from './dto/stored-item.dto';
import {
  ChangeSmartLockPinDto,
  ResetSmartLockPinDto,
  UpdateSmartLockStatusDto,
} from './dto/smart-lock.dto';
import { CreateReturnRequestDto } from './dto/return-request.dto';
import {
  ContractStatus,
  AccessCodeStatus,
  StorageUnitStatus,
  PaymentType,
  PaymentStatus,
  PaymentMethod,
} from '@prisma/client';
import { UserRole } from '../common/enums/role.enum';

@Injectable()
export class ContractsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Helper kiểm tra quyền sở hữu hợp đồng của khách hàng
   */
  private async getContractAndValidateOwnership(
    contractId: string,
    userId: string,
    userRole: string,
    userFacilityId?: string,
  ) {
    const contract = await this.prisma.rentalContract.findUnique({
      where: { id: contractId },
      include: {
        customer: { select: { id: true, fullName: true, email: true, phone: true } },
        contractItems: {
          include: {
            unit: {
              include: {
                unitType: true,
                facility: { select: { id: true, name: true, address: true } },
              },
            },
            storedItems: true,
          },
        },
        payments: true,
        extraCharges: true,
      },
    });

    if (!contract) {
      throw new NotFoundException(`Hợp đồng #${contractId} không tồn tại`);
    }

    if (
      userRole === UserRole.STORAGE_CUSTOMER &&
      contract.customerId !== userId
    ) {
      throw new ForbiddenException('Bạn không có quyền truy cập hợp đồng này');
    }

    if (
      (userRole === UserRole.FACILITY_STAFF || userRole === UserRole.FACILITY_MANAGER) &&
      userFacilityId &&
      !contract.contractItems.some((ci) => ci.unit.facilityId === userFacilityId)
    ) {
      throw new ForbiddenException('Bạn chỉ có quyền xem hợp đồng thuộc cơ sở được phân công');
    }

    return contract;
  }

  /**
   * Lấy danh sách hợp đồng của khách hàng đang đăng nhập
   */
  async getMyContracts(userId: string) {
    return this.prisma.rentalContract.findMany({
      where: { customerId: userId },
      include: {
        contractItems: {
          include: {
            unit: {
              include: {
                unitType: true,
                facility: { select: { id: true, name: true, address: true } },
              },
            },
            storedItems: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Lấy danh sách hợp đồng (dành cho Quản lý & Nhân viên)
   */
  async getContracts(user: any, facilityId?: string, status?: ContractStatus) {
    const where: any = {};
    if (status) where.status = status;

    const userRole = typeof user.role === 'string' ? user.role : user.role?.name;
    if (userRole === UserRole.FACILITY_STAFF || userRole === UserRole.FACILITY_MANAGER) {
      const enforcedFacilityId = user.facilityId || '000000000000000000000000';
      where.contractItems = {
        some: {
          unit: { facilityId: enforcedFacilityId },
        },
      };
    } else if (facilityId) {
      where.contractItems = {
        some: {
          unit: { facilityId },
        },
      };
    }

    return this.prisma.rentalContract.findMany({
      where,
      include: {
        customer: { select: { id: true, fullName: true, email: true, phone: true } },
        contractItems: {
          include: {
            unit: {
              select: {
                id: true,
                unitNumber: true,
                floor: true,
                facility: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Lấy chi tiết hợp đồng
   */
  async getContractById(
    contractId: string,
    userId: string,
    userRole: string,
    userFacilityId?: string,
  ) {
    return this.getContractAndValidateOwnership(
      contractId,
      userId,
      userRole,
      userFacilityId,
    );
  }

  /**
   * Khách hàng ký điện tử hợp đồng
   */
  async signContract(contractId: string, userId: string, signature?: string) {
    const contract = await this.prisma.rentalContract.findUnique({
      where: { id: contractId },
    });

    if (!contract) {
      throw new NotFoundException(`Hợp đồng #${contractId} không tồn tại`);
    }

    if (contract.customerId !== userId) {
      throw new ForbiddenException('Bạn không phải là chủ sở hữu hợp đồng này');
    }

    if (contract.signedAt) {
      throw new BadRequestException('Hợp đồng đã được ký trước đó');
    }

    return this.prisma.rentalContract.update({
      where: { id: contractId },
      data: {
        signedAt: new Date(),
        customerSignature: signature || undefined,
        status: ContractStatus.ACTIVE,
      },
    });
  }

  /**
   * Khách hàng gửi yêu cầu trả kho kèm ngày & khung giờ bàn giao.
   * Nhân viên đọc lại thông tin này qua API danh sách hợp đồng.
   */
  async createReturnRequest(
    contractId: string,
    userId: string,
    dto: CreateReturnRequestDto,
  ) {
    const contract = await this.prisma.rentalContract.findUnique({
      where: { id: contractId },
    });

    if (!contract) {
      throw new NotFoundException(`Hợp đồng #${contractId} không tồn tại`);
    }

    if (contract.customerId !== userId) {
      throw new ForbiddenException('Bạn không phải là chủ sở hữu hợp đồng này');
    }

    if (
      contract.status === ContractStatus.COMPLETED ||
      contract.status === ContractStatus.TERMINATED ||
      contract.status === ContractStatus.CANCELLED
    ) {
      throw new BadRequestException(
        'Hợp đồng đã kết thúc, không thể gửi yêu cầu trả kho',
      );
    }

    const returnDate = new Date(dto.returnDate);
    if (Number.isNaN(returnDate.getTime())) {
      throw new BadRequestException('Ngày trả kho không hợp lệ');
    }

    return this.prisma.rentalContract.update({
      where: { id: contractId },
      data: {
        returnRequestedAt: new Date(),
        returnDate,
        returnTimeSlot: dto.returnTimeSlot,
      },
    });
  }

  /**
   * Thanh lý / Chấm dứt hợp đồng và giải phóng ngăn kho
   */
  async terminateContract(contractId: string) {
    const contract = await this.prisma.rentalContract.findUnique({
      where: { id: contractId },
      include: { contractItems: true },
    });

    if (!contract) {
      throw new NotFoundException(`Hợp đồng #${contractId} không tồn tại`);
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Cập nhật hợp đồng
      const updated = await tx.rentalContract.update({
        where: { id: contractId },
        data: { status: ContractStatus.TERMINATED },
      });

      // 2. Thu hồi mã PIN và giải phóng kho
      for (const item of contract.contractItems) {
        await tx.contractItem.update({
          where: { id: item.id },
          data: {
            status: 'RETURNED',
            accessCodeStatus: AccessCodeStatus.REVOKED,
          },
        });

        await tx.storageUnit.update({
          where: { id: item.unitId },
          data: { status: StorageUnitStatus.AVAILABLE },
        });
      }

      return updated;
    });
  }

    /**
   * Gia hạn thời gian thuê của hợp đồng
   */
  async renewContract(
    contractId: string,
    userId: string,
    userRole: string,
    extendedMonths: number = 1,
    paymentMethod: string = 'SEPAY_QR',
    explicitPaymentCode?: string,
  ) {
    const contract = await this.prisma.rentalContract.findUnique({
      where: { id: contractId },
      include: {
        customer: true,
        contractItems: {
          include: {
            unit: { include: { unitType: true } },
          },
        },
      },
    });

    if (!contract) {
      throw new NotFoundException(`Hợp đồng #${contractId} không tồn tại`);
    }

    const roleName = typeof userRole === 'string' ? userRole : (userRole as any)?.name;
    if (roleName === UserRole.STORAGE_CUSTOMER && contract.customerId !== userId) {
      throw new ForbiddenException('Bạn không có quyền thao tác trên hợp đồng này');
    }

    if (
      contract.status === ContractStatus.TERMINATED ||
      contract.status === ContractStatus.CANCELLED
    ) {
      throw new BadRequestException('Hợp đồng đã kết thúc hoặc bị hủy, không thể gia hạn');
    }

    const currentEnd = new Date(contract.endDate);
    const baseDate = currentEnd.getTime() > Date.now() ? currentEnd : new Date();
    const newEnd = new Date(baseDate.getTime());
    newEnd.setMonth(newEnd.getMonth() + extendedMonths);

    // Tính toán số tiền gia hạn
    let totalRenewalAmount = 0;
    for (const item of contract.contractItems) {
      const pricePerMonth = Number(item.rentalPrice || 0);
      totalRenewalAmount += pricePerMonth * extendedMonths;
    }

    const updated = await this.prisma.rentalContract.update({
      where: { id: contractId },
      data: {
        endDate: newEnd,
        status: ContractStatus.ACTIVE,
      },
      include: {
        customer: true,
        contractItems: { include: { unit: true } },
      },
    });

    // Tạo hoặc cập nhật giao dịch thanh toán gia hạn
    const cleanUnit = (contract.contractItems[0]?.unit?.unitNumber || 'UNIT').replace(/[^A-Za-z0-9]/g, '');
    const paymentCode = (explicitPaymentCode && explicitPaymentCode.trim())
      ? explicitPaymentCode.trim().toUpperCase()
      : `SSREN${cleanUnit}${extendedMonths}T`.toUpperCase();

    const existingPayment = await this.prisma.payment.findUnique({
      where: { paymentCode },
    });

    if (existingPayment) {
      if (existingPayment.status !== PaymentStatus.PAID) {
        await this.prisma.payment.update({
          where: { id: existingPayment.id },
          data: {
            status: PaymentStatus.PAID,
            paidAt: new Date(),
          },
        });
      }
    } else {
      await this.prisma.payment.create({
        data: {
          paymentCode,
          contractId,
          paymentType: PaymentType.RENEWAL,
          amount: totalRenewalAmount > 0 ? totalRenewalAmount : 20000,
          paymentMethod: paymentMethod === 'CASH' ? PaymentMethod.CASH : PaymentMethod.BANK_TRANSFER,
          status: PaymentStatus.PAID,
          paidAt: new Date(),
        },
      });
    }

    return {
      success: true,
      contractId: updated.id,
      extendedMonths,
      newEndDate: updated.endDate,
      status: updated.status,
      totalRenewalAmount,
    };
  }

  // ==================== KHÓA THÔNG MINH CĂN HỘ (SMART DIGITAL LOCK) ====================

  /**
   * Lấy thông tin ổ khóa điện tử và mã PIN mở cửa ngăn kho
   */
  async getSmartLockInfo(
    contractId: string,
    unitId: string,
    userId: string,
    userRole?: string,
  ) {
    const contract = await this.prisma.rentalContract.findUnique({
      where: { id: contractId },
      include: {
        contractItems: {
          where: { unitId },
          include: {
            unit: { select: { id: true, unitNumber: true, floor: true } },
          },
        },
      },
    });

    if (!contract) {
      throw new NotFoundException(`Hợp đồng #${contractId} không tồn tại`);
    }

    if (
      userRole === UserRole.STORAGE_CUSTOMER &&
      contract.customerId !== userId
    ) {
      throw new ForbiddenException('Bạn không có quyền xem thông tin khóa của hợp đồng này');
    }

    const item = contract.contractItems[0];
    if (!item) {
      throw new NotFoundException(`Ngăn kho #${unitId} không thuộc hợp đồng này`);
    }

    return {
      contractId,
      unitId,
      unitNumber: item.unit.unitNumber,
      floor: item.unit.floor,
      lockType: 'SMART_DIGITAL_LOCK',
      lockModel: 'Keypad Electronic Smart Lock',
      accessCode: item.accessCode,
      accessCodeStatus: item.accessCodeStatus,
      instructions: 'Nhập mã PIN trên bàn phím số của ổ khóa cửa kho và kết thúc bằng phím # để mở khóa.',
    };
  }

  /**
   * Khách hàng tự đổi mã PIN của ổ khóa thông minh
   */
  async changeSmartLockPin(
    contractId: string,
    unitId: string,
    userId: string,
    dto: ChangeSmartLockPinDto,
  ) {
    const contract = await this.prisma.rentalContract.findUnique({
      where: { id: contractId },
      include: {
        contractItems: { where: { unitId } },
      },
    });

    if (!contract) {
      throw new NotFoundException(`Hợp đồng #${contractId} không tồn tại`);
    }

    if (contract.customerId !== userId) {
      throw new ForbiddenException('Bạn không có quyền đổi mã khóa của hợp đồng này');
    }

    if (contract.status !== ContractStatus.ACTIVE) {
      throw new BadRequestException('Chỉ có thể đổi mã PIN khi hợp đồng đang ở trạng thái ACTIVE');
    }

    const item = contract.contractItems[0];
    if (!item) {
      throw new NotFoundException(`Ngăn kho #${unitId} không thuộc hợp đồng này`);
    }

    if (item.accessCodeStatus !== AccessCodeStatus.ACTIVE) {
      throw new BadRequestException('Ổ khóa hiện đang bị tạm khóa hoặc chưa kích hoạt. Vui lòng liên hệ ban quản lý.');
    }

    const updated = await this.prisma.contractItem.update({
      where: { id: item.id },
      data: {
        accessCode: dto.newPin,
        accessCodeStatus: AccessCodeStatus.ACTIVE,
      },
    });

    return {
      message: 'Đổi mã PIN khóa thông minh thành công',
      unitId,
      accessCode: updated.accessCode,
      accessCodeStatus: updated.accessCodeStatus,
    };
  }

  /**
   * Đặt lại mã PIN ngẫu nhiên hoặc theo chỉ định (Master Reset PIN dành cho Staff/Manager/Admin)
   */
  async resetSmartLockPin(
    contractId: string,
    unitId: string,
    dto: ResetSmartLockPinDto,
  ) {
    const item = await this.prisma.contractItem.findFirst({
      where: { contractId, unitId },
    });

    if (!item) {
      throw new NotFoundException(`Không tìm thấy ngăn kho #${unitId} trong hợp đồng #${contractId}`);
    }

    const newCode =
      dto.newPin || Math.floor(100000 + Math.random() * 900000).toString();

    const updated = await this.prisma.contractItem.update({
      where: { id: item.id },
      data: {
        accessCode: newCode,
        accessCodeStatus: AccessCodeStatus.ACTIVE,
      },
    });

    return {
      message: 'Đặt lại mã PIN khóa thông minh thành công',
      unitId,
      accessCode: updated.accessCode,
      accessCodeStatus: updated.accessCodeStatus,
    };
  }

  /**
   * Tạm khóa hoặc kích hoạt lại mã mở cửa kho (Staff / Manager)
   */
  async updateSmartLockStatus(
    contractId: string,
    unitId: string,
    dto: UpdateSmartLockStatusDto,
  ) {
    const item = await this.prisma.contractItem.findFirst({
      where: { contractId, unitId },
    });

    if (!item) {
      throw new NotFoundException(`Không tìm thấy ngăn kho #${unitId} trong hợp đồng #${contractId}`);
    }

    const updated = await this.prisma.contractItem.update({
      where: { id: item.id },
      data: { accessCodeStatus: dto.status },
    });

    return {
      message: `Đã cập nhật trạng thái ổ khóa sang ${dto.status}`,
      unitId,
      accessCodeStatus: updated.accessCodeStatus,
    };
  }

  // ==================== DANH MỤC LƯU TRỮ (STORED ITEMS) ====================

  /**
   * Xem danh sách đồ đạc đang cất trong ngăn kho
   */
  async getStoredItems(
    contractId: string,
    unitId: string,
    userId: string,
    userRole: string,
  ) {
    await this.getContractAndValidateOwnership(contractId, userId, userRole);

    const item = await this.prisma.contractItem.findFirst({
      where: { contractId, unitId },
    });

    if (!item) {
      throw new NotFoundException(`Không tìm thấy ngăn kho #${unitId} trong hợp đồng #${contractId}`);
    }

    return this.prisma.storedItem.findMany({
      where: { contractItemId: item.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Thêm món đồ mới vào kho
   */
  async createStoredItem(
    contractId: string,
    unitId: string,
    userId: string,
    userRole: string,
    dto: CreateStoredItemDto,
  ) {
    await this.getContractAndValidateOwnership(contractId, userId, userRole);

    const item = await this.prisma.contractItem.findFirst({
      where: { contractId, unitId },
    });

    if (!item) {
      throw new NotFoundException(`Không tìm thấy ngăn kho #${unitId} trong hợp đồng #${contractId}`);
    }

    return this.prisma.storedItem.create({
      data: {
        contractItemId: item.id,
        name: dto.name,
        category: dto.category,
        quantity: dto.quantity || 1,
        photoUrl: dto.photoUrl,
        description: dto.description,
      },
    });
  }

  /**
   * Cập nhật thông tin đồ đạc
   */
  async updateStoredItem(
    itemId: string,
    userId: string,
    userRole: string,
    dto: UpdateStoredItemDto,
  ) {
    const storedItem = await this.prisma.storedItem.findUnique({
      where: { id: itemId },
      include: {
        contractItem: {
          include: { contract: true },
        },
      },
    });

    if (!storedItem) {
      throw new NotFoundException(`Món đồ #${itemId} không tồn tại`);
    }

    if (
      userRole === UserRole.STORAGE_CUSTOMER &&
      storedItem.contractItem.contract.customerId !== userId
    ) {
      throw new ForbiddenException('Bạn không có quyền chỉnh sửa món đồ này');
    }

    return this.prisma.storedItem.update({
      where: { id: itemId },
      data: {
        name: dto.name,
        category: dto.category,
        quantity: dto.quantity,
        photoUrl: dto.photoUrl,
        description: dto.description,
      },
    });
  }

  /**
   * Xóa món đồ khi mang ra khỏi kho
   */
  async deleteStoredItem(itemId: string, userId: string, userRole: string) {
    const storedItem = await this.prisma.storedItem.findUnique({
      where: { id: itemId },
      include: {
        contractItem: {
          include: { contract: true },
        },
      },
    });

    if (!storedItem) {
      throw new NotFoundException(`Món đồ #${itemId} không tồn tại`);
    }

    if (
      userRole === UserRole.STORAGE_CUSTOMER &&
      storedItem.contractItem.contract.customerId !== userId
    ) {
      throw new ForbiddenException('Bạn không có quyền xóa món đồ này');
    }

    await this.prisma.storedItem.delete({
      where: { id: itemId },
    });

    return { message: 'Đã xóa món đồ khỏi danh mục lưu trữ thành công' };
  }
}
