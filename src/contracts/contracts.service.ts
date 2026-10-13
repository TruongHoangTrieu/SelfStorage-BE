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
import {
  ContractStatus,
  AccessCodeStatus,
  StorageUnitStatus,
  RenewalStatus,
  PaymentType,
  PaymentStatus,
  PaymentMethod,
} from '@prisma/client';
import { UserRole } from '../common/enums/role.enum';
import { RenewContractDto } from './dto/renew-contract.dto';
import { CreateGuestCodeDto } from './dto/guest-code.dto';

@Injectable()
export class ContractsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Helper kiểm tra quyền sở hữu hợp đồng của khách hàng
   */
  private async getContractAndValidateOwnership(
    contractId: number,
    userId: number,
    userRole: string,
    userFacilityId?: number,
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
  async getMyContracts(userId: number) {
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
            guestAccessCodes: { orderBy: { createdAt: 'desc' } },
          },
        },
        payments: { orderBy: { createdAt: 'desc' } },
        renewals: { orderBy: { createdAt: 'desc' } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Lấy danh sách hợp đồng (dành cho Quản lý & Nhân viên)
   */
  async getContracts(user: any, facilityId?: number, status?: ContractStatus) {
    const where: any = {};
    if (status) where.status = status;

    const userRole = typeof user.role === 'string' ? user.role : user.role?.name;
    if (userRole === UserRole.FACILITY_STAFF || userRole === UserRole.FACILITY_MANAGER) {
      const enforcedFacilityId = user.facilityId || -1;
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
    contractId: number,
    userId: number,
    userRole: string,
    userFacilityId?: number,
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
  async signContract(contractId: number, userId: number) {
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
        status: ContractStatus.ACTIVE,
      },
    });
  }

  /**
   * Thanh lý / Chấm dứt hợp đồng và giải phóng ngăn kho
   */
  async terminateContract(contractId: number) {
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

  // ==================== KHÓA THÔNG MINH CĂN HỘ (SMART DIGITAL LOCK) ====================

  /**
   * Lấy thông tin ổ khóa điện tử và mã PIN mở cửa ngăn kho
   */
  async getSmartLockInfo(
    contractId: number,
    unitId: number,
    userId: number,
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
    contractId: number,
    unitId: number,
    userId: number,
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
    contractId: number,
    unitId: number,
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
    contractId: number,
    unitId: number,
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
    contractId: number,
    unitId: number,
    userId: number,
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
    contractId: number,
    unitId: number,
    userId: number,
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
    itemId: number,
    userId: number,
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
  async deleteStoredItem(itemId: number, userId: number, userRole: string) {
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

  // ==================== MÃ KHÁCH TẠM THỜI (GUEST ACCESS CODES) ====================

  async createGuestCode(
    contractId: number,
    unitId: number,
    userId: number,
    dto: CreateGuestCodeDto,
  ) {
    const contract = await this.prisma.rentalContract.findUnique({
      where: { id: contractId },
      include: { contractItems: true },
    });

    if (!contract || contract.customerId !== userId) {
      throw new ForbiddenException('Bạn không có quyền quản lý ô kho này');
    }

    const item = contract.contractItems.find((ci) => ci.unitId === unitId);
    if (!item) {
      throw new NotFoundException('Không tìm thấy ngăn kho trong hợp đồng');
    }

    const now = new Date();
    let validTo = new Date(now);
    if (dto.durationOption === '2h') {
      validTo.setHours(validTo.getHours() + 2);
    } else if (dto.durationOption === '3d') {
      validTo.setDate(validTo.getDate() + 3);
    } else {
      validTo.setHours(validTo.getHours() + 24);
    }

    return this.prisma.guestAccessCode.create({
      data: {
        contractItemId: item.id,
        guestName: dto.guestName,
        pinCode: dto.pinCode,
        validFrom: now,
        validTo,
        usageType: dto.usageType || 'multi_time',
        status: 'active',
        purpose: dto.purpose || null,
      },
    });
  }

  async getGuestCodes(contractId: number, unitId: number, userId: number) {
    const contract = await this.prisma.rentalContract.findUnique({
      where: { id: contractId },
      include: { contractItems: true },
    });

    if (!contract || contract.customerId !== userId) {
      throw new ForbiddenException('Bạn không có quyền quản lý ô kho này');
    }

    const item = contract.contractItems.find((ci) => ci.unitId === unitId);
    if (!item) {
      throw new NotFoundException('Không tìm thấy ngăn kho trong hợp đồng');
    }

    return this.prisma.guestAccessCode.findMany({
      where: { contractItemId: item.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ==================== GIA HẠN HỢP ĐỒNG (CONTRACT RENEWAL) ====================

  async renewContract(contractId: number, userId: number, dto: RenewContractDto) {
    const contract = await this.prisma.rentalContract.findUnique({
      where: { id: contractId },
      include: { contractItems: true },
    });

    if (!contract || contract.customerId !== userId) {
      throw new ForbiddenException('Bạn không có quyền gia hạn hợp đồng này');
    }

    const months = dto.extendedMonths;
    const oldEndDate = new Date(contract.endDate);
    const newEndDate = new Date(oldEndDate);
    newEndDate.setMonth(newEndDate.getMonth() + months);

    let discountPercent = 0;
    if (months >= 12) discountPercent = 15;
    else if (months >= 6) discountPercent = 10;
    else if (months >= 3) discountPercent = 5;

    const monthlyTotal = contract.contractItems.reduce(
      (sum, ci) => sum + Number(ci.rentalPrice),
      0,
    );
    const grossAmount = monthlyTotal * months;
    const discountAmount = Math.round((grossAmount * discountPercent) / 100);
    const netAmount = grossAmount - discountAmount;

    const paymentCode = `PAY-${contract.contractCode.slice(-6)}-REN${months}M`;

    return this.prisma.$transaction(async (tx) => {
      // 1. Cập nhật ngày kết thúc hợp đồng
      const updatedContract = await tx.rentalContract.update({
        where: { id: contractId },
        data: {
          endDate: newEndDate,
          status: ContractStatus.ACTIVE,
        },
      });

      // 2. Tạo bản ghi ContractRenewal
      const renewalRecord = await tx.contractRenewal.create({
        data: {
          contractId,
          oldEndDate,
          newEndDate,
          renewalFee: netAmount,
          requestedBy: userId,
          approvedBy: userId,
          status: RenewalStatus.COMPLETED,
        },
      });

      // 3. Tạo bản ghi Payment
      const paymentRecord = await tx.payment.create({
        data: {
          contractId,
          paymentCode,
          amount: netAmount,
          paymentType: PaymentType.RENTAL,
          paymentMethod: PaymentMethod.BANK_TRANSFER,
          status: PaymentStatus.PAID,
          paidAt: new Date(),
          transactionReference: `Gia hạn hợp đồng ${contract.contractCode} thêm ${months} tháng (Chiết khấu ${discountPercent}%)`,
        },
      });

      return {
        success: true,
        message: `Gia hạn hợp đồng thành công thêm ${months} tháng`,
        newEndDate: newEndDate.toISOString(),
        renewalRecord,
        paymentRecord,
        contract: updatedContract,
      };
    });
  }
}
