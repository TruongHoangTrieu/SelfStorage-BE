import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { UserRole } from '../enums/role.enum';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<(UserRole | string)[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();

    if (!user) {
      throw new ForbiddenException('Access denied: no user identified');
    }

    const rawRole = typeof user.role === 'string' ? user.role : user.role?.name;
    const normalizeRole = (r: string) => {
      const upper = String(r || '').toUpperCase();
      if (upper === 'CUSTOMER' || upper === 'STORAGE_CUSTOMER') return UserRole.STORAGE_CUSTOMER;
      if (upper === 'OPERATIONS_STAFF' || upper === 'STAFF' || upper === 'FACILITY_STAFF') return UserRole.FACILITY_STAFF;
      if (upper === 'MANAGER' || upper === 'FACILITY_MANAGER') return UserRole.FACILITY_MANAGER;
      if (upper === 'ADMIN' || upper === 'SYSTEM_ADMIN' || upper === 'SYSTEM_ADMINISTRATOR') return UserRole.SYSTEM_ADMINISTRATOR;
      if (upper === 'BUSINESS_OPERATIONS_MANAGER') return UserRole.BUSINESS_OPERATIONS_MANAGER;
      return r;
    };

    const isStaffOrAdmin = (r: string) => {
      const u = String(r || '').toUpperCase();
      return (
        u === UserRole.FACILITY_STAFF ||
        u === UserRole.FACILITY_MANAGER ||
        u === UserRole.BUSINESS_OPERATIONS_MANAGER ||
        u === UserRole.SYSTEM_ADMINISTRATOR ||
        u === 'STAFF' ||
        u === 'MANAGER' ||
        u === 'ADMIN' ||
        u.includes('STAFF') ||
        u.includes('MANAGER') ||
        u.includes('ADMIN')
      );
    };

    const userRole = normalizeRole(rawRole);

    const hasRole = requiredRoles.some((role) => {
      const normalizedReq = normalizeRole(role as string);
      if (role === rawRole || normalizedReq === userRole || role === userRole) return true;
      if (
        (normalizedReq === UserRole.FACILITY_STAFF || normalizedReq === UserRole.FACILITY_MANAGER) &&
        isStaffOrAdmin(rawRole)
      ) {
        return true;
      }
      return false;
    });

    if (!hasRole) {
      throw new ForbiddenException(
        `Forbidden: role '${rawRole}' does not have sufficient permissions to access this resource`,
      );
    }

    return true;
  }
}
