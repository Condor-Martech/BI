import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';

/**
 * Bloqueia o módulo de Análise com IA para usuários sem o flag `chatIaEnabled`.
 *
 * Deve rodar DEPOIS do JwtAuthGuard — ele depende de `request.user`, que o
 * JwtAuthGuard carrega fresco do Mongo a cada request. Por isso a fonte da
 * verdade é sempre o documento atual: ativar/desativar o flag tem efeito imediato,
 * sem esperar o usuário re-logar.
 */
@Injectable()
export class ChatIaGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest();
    if (!user || !user.chatIaEnabled) {
      throw new ForbiddenException('Recurso de Análise com IA não habilitado para este usuário');
    }
    return true;
  }
}
