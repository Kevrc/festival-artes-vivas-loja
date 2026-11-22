import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { ErrorConCodigo } from '../http/problema-codigo.filter';

const SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF (research R12): con cookies `SameSite=Lax`, además los métodos que escriben rechazan un
 * `Origin` distinto de la web del festival. Los navegadores siempre envían `Origin` en peticiones
 * de otro sitio; sin `Origin` (clientes de servidor, pruebas) se permite.
 */
@Injectable()
export class OrigenGuard implements CanActivate {
  private readonly permitidos = new Set((process.env.WEB_URL ?? 'http://localhost:3100').split(',').map((u) => u.trim().replace(/\/$/, '')));

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<{ method: string; headers: Record<string, string | string[] | undefined> }>();
    if (SEGUROS.has(req.method.toUpperCase())) return true;
    const origen = req.headers.origin;
    const valor = Array.isArray(origen) ? origen[0] : origen;
    if (!valor || this.permitidos.has(valor.replace(/\/$/, ''))) return true;
    throw new ErrorConCodigo(403, 'origen_no_permitido', 'La petición viene de un sitio no autorizado.');
  }
}
