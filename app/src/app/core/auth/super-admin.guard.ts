import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const superAdminEmail = (process.env.SUPER_ADMIN_EMAIL ?? '').toLowerCase().trim();

    if (!user || !user.email) {
      throw new ForbiddenException('Autenticação obrigatória');
    }
    if (!superAdminEmail) {
      throw new ForbiddenException('SUPER_ADMIN_EMAIL não configurado');
    }
    if (String(user.email).toLowerCase().trim() !== superAdminEmail) {
      throw new ForbiddenException('Apenas o super admin pode executar esta ação');
    }
    return true;
  }
}
