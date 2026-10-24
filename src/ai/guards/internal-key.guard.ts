import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class InternalKeyGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const providedKey = request.headers['x-internal-key'];
    const expectedKey =
      this.configService.get<string>('AI_INTERNAL_KEY') || 'change_me_internal_key';

    if (!providedKey || providedKey !== expectedKey) {
      throw new ForbiddenException(
        'Truy cập nội bộ bị từ chối: x-internal-key không hợp lệ',
      );
    }
    return true;
  }
}
