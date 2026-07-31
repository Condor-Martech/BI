import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { getSuperAdminEmails } from './super-admin.util';

@Injectable()
export class AdminAllowlistGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const superAdminEmails = getSuperAdminEmails();

    if (!user || !user.email) {
      throw new ForbiddenException('Autenticação obrigatória');
    }

    const emailNormalized = String(user.email).toLowerCase().trim();
    if (superAdminEmails.has(emailNormalized)) return true;
    if (user.isAdminAllowlist === true) return true;

    throw new ForbiddenException('Você não está autorizado a usar ferramentas de admin');
  }
}
