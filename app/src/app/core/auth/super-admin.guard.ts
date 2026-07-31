import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { getSuperAdminEmails } from './super-admin.util';

@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const superAdminEmails = getSuperAdminEmails();

    if (!user || !user.email) {
      throw new ForbiddenException('Autenticação obrigatória');
    }
    if (superAdminEmails.size === 0) {
      throw new ForbiddenException('SUPER_ADMIN_EMAILS não configurado');
    }
    if (!superAdminEmails.has(String(user.email).toLowerCase().trim())) {
      throw new ForbiddenException('Apenas o super admin pode executar esta ação');
    }
    return true;
  }
}
