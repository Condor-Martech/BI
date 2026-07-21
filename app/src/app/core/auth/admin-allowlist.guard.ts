import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

@Injectable()
export class AdminAllowlistGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const superAdminEmail = (process.env.SUPER_ADMIN_EMAIL ?? '').toLowerCase().trim();

    if (!user || !user.email) {
      throw new ForbiddenException('Autenticação obrigatória');
    }

    const emailNormalized = String(user.email).toLowerCase().trim();
    if (superAdminEmail && emailNormalized === superAdminEmail) return true;
    if (user.isAdminAllowlist === true) return true;

    throw new ForbiddenException('Você não está autorizado a usar ferramentas de admin');
  }
}
