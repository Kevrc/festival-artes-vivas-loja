import { COOKIE_SESION, type ContextoIdentidad, type IdentidadPublica, type PeticionConCabeceras } from '@fiavl/contracts';
import type { AutorizacionBoleteriaPort, ContextoUsuario } from '../application/puertos';
import type { RolBoleteria } from '../domain/tipos';

const ROLES_BOLETERIA: ReadonlySet<string> = new Set<RolBoleteria>(['taquilla', 'validador', 'jefe_sala', 'programador', 'administrador']);

const tieneCookieDeSesion = (req: PeticionConCabeceras) => {
  const bruto = req.headers.cookie;
  const cabecera = Array.isArray(bruto) ? bruto.join('; ') : (bruto ?? '');
  return cabecera.split(';').some((p) => p.trim().startsWith(`${COOKIE_SESION}=`));
};

/**
 * Traduce el contrato IdentidadPublica (spec 004, FR-020) al `ContextoUsuario` de Boletería sin
 * cambiar su puerto (T088). Toda cuenta con sesión es `asistente`; los roles del personal pasan con
 * su sede (`alcance.tipo === 'sede'`). Una sesión del personal sin segundo factor no autoriza nada.
 */
export function aContextoBoleteria(ctx: ContextoIdentidad): ContextoUsuario | null {
  if (!ctx.segundoFactorOk || ctx.politicaPendiente) return null;
  const roles: ContextoUsuario['roles'] = [{ rol: 'asistente' }];
  for (const r of ctx.roles) {
    if (!ROLES_BOLETERIA.has(r.rol)) continue;
    if (r.alcance && r.alcance.tipo !== 'sede') continue;
    roles.push({ rol: r.rol as RolBoleteria, ...(r.alcance ? { sedeId: r.alcance.valor } : {}) });
  }
  return { cuentaId: ctx.cuentaId, correo: ctx.correo, correoVerificado: ctx.correoVerificado, estudianteAcreditado: ctx.estudianteAcreditado, roles };
}

/**
 * Con la cookie `fiavl_sesion`, manda Identidad (también en desarrollo: una sesión vencida o
 * revocada es 401, no cae al puente). Sin ella, en development/test sigue funcionando el puente de
 * desarrollo de la spec 002 (`AutorizacionDevAdapter`), que en cualquier otro entorno ya devuelve null.
 */
export class AutorizacionIdentidadAdapter implements AutorizacionBoleteriaPort {
  constructor(
    private readonly identidad: IdentidadPublica,
    private readonly puenteDev: AutorizacionBoleteriaPort | null,
  ) {}

  async resolverDesdePeticion(req: PeticionConCabeceras): Promise<ContextoUsuario | null> {
    if (tieneCookieDeSesion(req)) {
      const ctx = await this.identidad.resolverSesion(req).catch(() => null);
      return ctx ? aContextoBoleteria(ctx) : null;
    }
    return this.puenteDev ? this.puenteDev.resolverDesdePeticion(req) : null;
  }
}
