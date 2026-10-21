import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { NotificationsGateway } from './notifications.gateway';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { QueryNotificationDto } from './dto/query-notification.dto';
import { NotificationType, Prisma } from '@prisma/client';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: NotificationsGateway,
  ) {}

  /**
   * Create an in-app notification and push real-time via WebSocket
   */
  async create(dto: CreateNotificationDto) {
    const notification = await this.prisma.notification.create({
      data: {
        userId: dto.userId,
        title: dto.title,
        body: dto.body,
        type: dto.type || NotificationType.SYSTEM,
        entityType: dto.entityType,
        entityId: dto.entityId,
        metadata: dto.metadata ? dto.metadata : Prisma.JsonNull,
      },
    });

    // Send real-time socket message to the specific user
    this.gateway.sendToUser(dto.userId, 'notification', notification);

    // Update unread count for user in real-time
    const unreadCount = await this.getUnreadCount(dto.userId);
    this.gateway.sendToUser(dto.userId, 'unread_count', { unreadCount });

    return notification;
  }

  /**
   * Send notification to all staff assigned to a facility
   */
  async notifyFacilityStaff(
    facilityId: string,
    title: string,
    body: string,
    type: NotificationType = NotificationType.SYSTEM,
    entityType?: string,
    entityId?: string,
    metadata?: any,
  ) {
    // Broadcast immediately to the facility room for real-time dashboard listeners
    this.gateway.sendToFacility(facilityId, 'facility_event', {
      facilityId,
      title,
      body,
      type,
      entityType,
      entityId,
      metadata,
      createdAt: new Date(),
    });

    // Find assigned staff members for persistent in-app notifications
    const assignments = await this.prisma.staffFacilityAssignment.findMany({
      where: {
        facilityId,
        endedAt: null,
      },
      select: {
        userId: true,
      },
    });

    if (assignments.length === 0) {
      return [];
    }

    const createdNotifications = await Promise.all(
      assignments.map((assignment) =>
        this.create({
          userId: assignment.userId,
          title,
          body,
          type,
          entityType,
          entityId,
          metadata,
        }),
      ),
    );

    return createdNotifications;
  }

  /**
   * Get paginated notifications for a user
   */
  async findAll(userId: string, query: QueryNotificationDto) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? query.limit : 20;
    const skip = (page - 1) * limit;

    const where: Prisma.NotificationWhereInput = {
      userId,
      ...(query.isRead !== undefined && { isRead: query.isRead }),
      ...(query.type && { type: query.type }),
    };

    const [items, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
      this.getUnreadCount(userId),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      unreadCount,
    };
  }

  /**
   * Count unread notifications
   */
  async getUnreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({
      where: {
        userId,
        isRead: false,
      },
    });
  }

  /**
   * Mark a single notification as read
   */
  async markAsRead(userId: string, notificationId: string) {
    const notification = await this.prisma.notification.findFirst({
      where: {
        id: notificationId,
        userId,
      },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    const updated = await this.prisma.notification.update({
      where: { id: notificationId },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    const unreadCount = await this.getUnreadCount(userId);
    this.gateway.sendToUser(userId, 'unread_count', { unreadCount });

    return updated;
  }

  /**
   * Mark all notifications as read for current user
   */
  async markAllAsRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: {
        userId,
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    this.gateway.sendToUser(userId, 'unread_count', { unreadCount: 0 });

    return { success: true, unreadCount: 0 };
  }

  /**
   * Delete a notification
   */
  async delete(userId: string, notificationId: string) {
    const notification = await this.prisma.notification.findFirst({
      where: {
        id: notificationId,
        userId,
      },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    await this.prisma.notification.delete({
      where: { id: notificationId },
    });

    const unreadCount = await this.getUnreadCount(userId);
    this.gateway.sendToUser(userId, 'unread_count', { unreadCount });

    return { success: true };
  }
}
