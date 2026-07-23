import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { AuthenticatedUser } from '../strategies/jwt.strategy';

// Доступ только системной роли SuperAdmin. Применяется поверх JwtAuthGuard.
@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser | undefined;
    if (!user?.isSuperAdmin) {
      throw new ForbiddenException('Требуются права SuperAdmin');
    }
    return true;
  }
}
