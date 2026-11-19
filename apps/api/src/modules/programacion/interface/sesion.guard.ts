import { type CanActivate, type ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { z } from 'zod';

export const CABECERA_CUENTA_DEV = 'x-cuenta-dev';

/**
 * Guarda temporal hasta que exista Identidad (spec 004, US8).
 * shortcut: solo en NODE_ENV=development acepta la cuenta de una cabecera; en cualquier otro
 * entorno responde 401 (falla cerrada, hallazgo S1). Reemplazar por AutorizacionPort de Identidad.
 */
@Injectable()
export class SesionGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<{ headers: Record<string, string | undefined>; cuentaId?: string }>();
    const cuenta = z.string().uuid().safeParse(req.headers[CABECERA_CUENTA_DEV]);
    if (process.env.NODE_ENV !== 'development' || !cuenta.success) throw new UnauthorizedException('Requiere sesión');
    req.cuentaId = cuenta.data;
    return true;
  }
}
