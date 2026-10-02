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
      if (r === 'CUSTOMER') return UserRole.STORAGE_CUSTOMER;
      if (r === 'OPERATIONS_STAFF') return UserRole.FACILITY_STAFF;
      return r;
    };

    const userRole = normalizeRole(rawRole);

    const hasRole = requiredRoles.some((role) => {
      const normalizedReq = normalizeRole(role as string);
      return role === rawRole || normalizedReq === userRole || role === userRole;
    });

    if (!hasRole) {
      throw new ForbiddenException(
        `Forbidden: role '${rawRole}' does not have sufficient permissions to access this resource`,
      );
    }

    return true;
  }
}
