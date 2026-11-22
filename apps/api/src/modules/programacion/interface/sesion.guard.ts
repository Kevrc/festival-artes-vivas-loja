import { type CanActivate, type ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { COOKIE_SESION, IDENTIDAD_PUBLICA, type IdentidadPublica } from '@fiavl/contracts';
import { z } from 'zod';

export const CABECERA_CUENTA_DEV = 'x-cuenta-dev';

/**
 * Sesión para Mi agenda (favoritos). T089 (spec 004): la resuelve el contrato IdentidadPublica
 * (cookie `fiavl_sesion`, FR-020). Se conserva el puente de desarrollo: solo en
 * NODE_ENV=development, sin sesión real, acepta la cuenta de la cabecera `x-cuenta-dev`.
 * En cualquier otro caso responde 401 (falla cerrada, hallazgo S1).
 */
@Injectable()
export class SesionGuard implements CanActivate {
  constructor(@Inject(IDENTIDAD_PUBLICA) private readonly identidad: IdentidadPublica) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<{ headers: Record<string, string | string[] | undefined>; cuentaId?: string }>();
    const cookie = [req.headers.cookie].flat().join('; ');
    if (cookie.split(';').some((p) => p.trim().startsWith(`${COOKIE_SESION}=`))) {
      // Con cookie manda Identidad: vencida, revocada o sin segundo factor ⇒ 401, sin puente.
      const sesion = await this.identidad.resolverSesion(req).catch(() => null);
      if (!sesion?.segundoFactorOk) throw new UnauthorizedException('Requiere sesión');
      req.cuentaId = sesion.cuentaId;
      return true;
    }
    const cuenta = z.string().uuid().safeParse(req.headers[CABECERA_CUENTA_DEV]);
    if (process.env.NODE_ENV !== 'development' || !cuenta.success) throw new UnauthorizedException('Requiere sesión');
    req.cuentaId = cuenta.data;
    return true;
  }
}
