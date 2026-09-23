import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateSupportRequestDto } from './dto/create-support-request.dto';
import { FilterSupportRequestDto } from './dto/filter-support-request.dto';
import {
  UpdateTicketProgressDto,
  AssignStaffTicketDto,
  AddTicketNoteDto,
} from './dto/update-support-request.dto';
import { SupportStatus, SupportPriority, UserStatus } from '@prisma/client';
import { UserRole } from '../common/enums/role.enum';

@Injectable()
export class SupportService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Tạo mã yêu cầu hỗ trợ duy nhất (Request Code)
   */
  private generateRequestCode(): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.floor(1000 + Math.random() * 9000);
    return `TK-${timestamp}-${random}`;
  }

  /**
   * Khách hàng tạo yêu cầu hỗ trợ sự cố mới
   */
  async create(userId: number, dto: CreateSupportRequestDto) {
    const facility = await this.prisma.facility.findUnique({
      where: { id: dto.facilityId },
    });
    if (!facility) {
      throw new NotFoundException(`Cơ sở #${dto.facilityId} không tồn tại`);
    }

    if (dto.contractItemId) {
      const contractItem = await this.prisma.contractItem.findUnique({
        where: { id: dto.contractItemId },
        include: { contract: true },
      });
      if (!contractItem) {
        throw new NotFoundException(
          `Ngăn kho trong hợp đồng #${dto.contractItemId} không tồn tại`,
        );
      }
      if (contractItem.contract.customerId !== userId) {
        throw new ForbiddenException(
          'Ngăn kho được chọn không thuộc hợp đồng của bạn',
        );
      }
    }

    const requestCode = this.generateRequestCode();

    return this.prisma.$transaction(async (tx) => {
      const request = await tx.supportRequest.create({
        data: {
          requestCode,
          customerId: userId,
          facilityId: dto.facilityId,
          contractItemId: dto.contractItemId || null,
          category: dto.category,
          subject: dto.subject.trim(),
          description: dto.description.trim(),
          priority: dto.priority || SupportPriority.MEDIUM,
          status: SupportStatus.OPEN,
          photos: dto.photos || [],
        },
        include: {
          customer: {
            select: { id: true, fullName: true, email: true, phone: true },
          },
          facility: {
            select: { id: true, name: true, code: true, address: true },
          },
          contractItem: {
            select: {
              id: true,
              unit: {
                select: { id: true, unitNumber: true, floor: true },
              },
            },
          },
        },
      });

      await tx.supportRequestLog.create({
        data: {
          supportRequestId: request.id,
          userId: userId,
          note: 'Khách hàng đã gửi yêu cầu hỗ trợ mới',
          oldStatus: null,
          newStatus: SupportStatus.OPEN,
        },
      });

      return request;
    });
  }

  /**
   * Danh sách yêu cầu hỗ trợ (Phân quyền & Lọc)
   */
  async findAll(user: any, filterDto: FilterSupportRequestDto) {
    const {
      page = 1,
      limit = 10,
      facilityId,
      customerId,
      status,
      category,
      priority,
      search,
    } = filterDto;

    const where: any = {};

    // Khách hàng chỉ xem được ticket của chính mình
    if (user.role === UserRole.STORAGE_CUSTOMER) {
      where.customerId = user.id;
    } else if (customerId) {
      where.customerId = customerId;
    }

    if (facilityId) where.facilityId = facilityId;
    if (status) where.status = status;
    if (category) where.category = category;
    if (priority) where.priority = priority;

    if (search) {
      where.OR = [
        { requestCode: { contains: search, mode: 'insensitive' } },
        { subject: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { customer: { fullName: { contains: search, mode: 'insensitive' } } },
        { customer: { phone: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const skip = (page - 1) * limit;

    const [total, items] = await Promise.all([
      this.prisma.supportRequest.count({ where }),
      this.prisma.supportRequest.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
        include: {
          customer: {
            select: { id: true, fullName: true, email: true, phone: true },
          },
          facility: {
            select: { id: true, name: true, code: true },
          },
          contractItem: {
            select: {
              id: true,
              unit: {
                select: { id: true, unitNumber: true, floor: true },
              },
            },
          },
          assignedStaff: {
            select: { id: true, fullName: true, email: true },
          },
          _count: {
            select: { logs: true },
          },
        },
      }),
    ]);

    return {
      data: items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Chi tiết yêu cầu hỗ trợ & toàn bộ nhật ký xử lý
   */
  async findOne(id: number, user: any) {
    const request = await this.prisma.supportRequest.findUnique({
      where: { id },
      include: {
        customer: {
          select: { id: true, fullName: true, email: true, phone: true },
        },
        facility: {
          select: {
            id: true,
            name: true,
            code: true,
            address: true,
            phone: true,
          },
        },
        contractItem: {
          select: {
            id: true,
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
        assignedStaff: {
          select: { id: true, fullName: true, email: true, phone: true },
        },
        logs: {
          orderBy: { createdAt: 'asc' },
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                email: true,
                role: { select: { name: true } },
              },
            },
          },
        },
      },
    });

    if (!request) {
      throw new NotFoundException(`Không tìm thấy yêu cầu hỗ trợ #${id}`);
    }

    if (
      user.role === UserRole.STORAGE_CUSTOMER &&
      request.customerId !== user.id
    ) {
      throw new ForbiddenException(
        'Bạn không có quyền truy cập yêu cầu hỗ trợ này',
      );
    }

    return request;
  }

  /**
   * Phân công nhân viên xử lý yêu cầu hỗ trợ
   */
  async assignStaff(id: number, staffId: number, user: any) {
    const request = await this.prisma.supportRequest.findUnique({
      where: { id },
    });
    if (!request) {
      throw new NotFoundException(`Không tìm thấy yêu cầu hỗ trợ #${id}`);
    }

    const staff = await this.prisma.user.findUnique({
      where: { id: staffId },
      include: { role: true },
    });
    if (!staff) {
      throw new NotFoundException(`Nhân viên #${staffId} không tồn tại`);
    }

    const newStatus =
      request.status === SupportStatus.OPEN
        ? SupportStatus.IN_PROGRESS
        : request.status;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.supportRequest.update({
        where: { id },
        data: {
          assignedStaffId: staffId,
          status: newStatus,
        },
        include: {
          customer: {
            select: { id: true, fullName: true, email: true },
          },
          assignedStaff: {
            select: { id: true, fullName: true, email: true },
          },
        },
      });

      await tx.supportRequestLog.create({
        data: {
          supportRequestId: id,
          userId: user.id,
          note: `Đã phân công xử lý cho nhân viên '${staff.fullName}' (${staff.email})`,
          oldStatus: request.status,
          newStatus: newStatus,
        },
      });

      return {
        message: `Đã phân công yêu cầu #${request.requestCode} cho nhân viên '${staff.fullName}'`,
        request: updated,
      };
    });
  }

  /**
   * Cập nhật tiến độ xử lý và trạng thái ticket (Staff / Manager / Admin)
   */
  async updateProgress(id: number, user: any, dto: UpdateTicketProgressDto) {
    const request = await this.prisma.supportRequest.findUnique({
      where: { id },
    });
    if (!request) {
      throw new NotFoundException(`Không tìm thấy yêu cầu hỗ trợ #${id}`);
    }

    const isResolvedOrClosed =
      dto.status === SupportStatus.RESOLVED ||
      dto.status === SupportStatus.CLOSED;

    const data: any = {
      status: dto.status,
    };

    if (isResolvedOrClosed && !request.resolvedAt) {
      data.resolvedAt = new Date();
    }

    if (dto.photos && dto.photos.length > 0) {
      const existingPhotos = Array.isArray(request.photos)
        ? (request.photos as string[])
        : [];
      data.photos = [...existingPhotos, ...dto.photos];
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.supportRequest.update({
        where: { id },
        data,
        include: {
          customer: {
            select: { id: true, fullName: true, email: true },
          },
          assignedStaff: {
            select: { id: true, fullName: true, email: true },
          },
        },
      });

      await tx.supportRequestLog.create({
        data: {
          supportRequestId: id,
          userId: user.id,
          note: dto.note.trim(),
          oldStatus: request.status,
          newStatus: dto.status,
        },
      });

      return {
        message: `Cập nhật tiến độ yêu cầu #${request.requestCode} thành công sang trạng thái '${dto.status}'`,
        request: updated,
      };
    });
  }

  /**
   * Khách hàng hoặc Nhân viên trao đổi, thêm ghi chú/phản hồi vào ticket
   */
  async addNote(id: number, user: any, dto: AddTicketNoteDto) {
    const request = await this.prisma.supportRequest.findUnique({
      where: { id },
    });
    if (!request) {
      throw new NotFoundException(`Không tìm thấy yêu cầu hỗ trợ #${id}`);
    }

    if (
      user.role === UserRole.STORAGE_CUSTOMER &&
      request.customerId !== user.id
    ) {
      throw new ForbiddenException(
        'Bạn không có quyền gửi phản hồi cho yêu cầu hỗ trợ này',
      );
    }

    const log = await this.prisma.supportRequestLog.create({
      data: {
        supportRequestId: id,
        userId: user.id,
        note: dto.note.trim(),
        oldStatus: request.status,
        newStatus: request.status,
      },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            role: { select: { name: true } },
          },
        },
      },
    });

    return {
      message: 'Đã gửi phản hồi thành công',
      log,
    };
  }
}
