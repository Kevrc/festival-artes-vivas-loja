import { COOKIE_SESION, type ContextoIdentidad, type IdentidadPublica, type PeticionConCabeceras, type RolPersonal } from '@fiavl/contracts';
import type { AutorizacionConvocatoriasPort, ContextoConvocatorias, RolIdentidad } from '../application/puertos';

/**
 * Tabla fija de códigos de rol de Identidad (spec 004, research R16) a los nombres literales de
 * FR-019 que usa Convocatorias (contracts/autorizacion-identidad.md de la spec 003; acuerdo en
 * specs/004-gestion-operativa/contracts/eventos-operacion-identidad.md §5.3).
 */
export const ROL_CONVOCATORIAS: Readonly<Record<RolPersonal, RolIdentidad>> = {
  asistente: 'asistente',
  postulante: 'postulante',
  curador: 'curador',
  coordinacion_convocatorias: 'coordinación de convocatorias',
  coordinacion_provincial: 'coordinación provincial',
  programador: 'programador',
  jefe_sala: 'jefe de sala',
  taquilla: 'taquilla',
  validador: 'validador',
  direccion: 'dirección',
  administrador: 'administrador',
};

const ALCANCE = { sede: 'sedeId', provincia: 'provincia', disciplina: 'disciplina' } as const;

const tieneCookieDeSesion = (req: PeticionConCabeceras) =>
  [req.headers.cookie].flat().join('; ').split(';').some((p) => p.trim().startsWith(`${COOKIE_SESION}=`));

/**
 * Traduce `ContextoIdentidad` a `ContextoConvocatorias` (T090). Los roles del personal van primero;
 * toda cuenta con sesión es además `asistente` y `postulante` (roles del público, FR-019). Una
 * sesión del personal sin segundo factor no autoriza nada.
 */
export function aContextoConvocatorias(ctx: ContextoIdentidad): ContextoConvocatorias | null {
  if (!ctx.segundoFactorOk || ctx.politicaPendiente) return null;
  const roles: ContextoConvocatorias['roles'] = ctx.roles
    .filter((r) => r.rol !== 'asistente' && r.rol !== 'postulante')
    .map((r) => ({ rol: ROL_CONVOCATORIAS[r.rol], ...(r.alcance ? { alcance: { [ALCANCE[r.alcance.tipo]]: r.alcance.valor } } : {}) }));
  roles.push({ rol: 'asistente' }, { rol: 'postulante' });
  return { cuentaId: ctx.cuentaId, correo: ctx.correo, correoVerificado: ctx.correoVerificado, roles };
}

/** Con la cookie `fiavl_sesion` manda Identidad; sin ella, el puente de desarrollo de la spec 003. */
export class AutorizacionConvocatoriasIdentidadAdapter implements AutorizacionConvocatoriasPort {
  constructor(
    private readonly identidad: IdentidadPublica,
    private readonly puenteDev: AutorizacionConvocatoriasPort | null,
  ) {}

  async resolverDesdePeticion(req: PeticionConCabeceras): Promise<ContextoConvocatorias | null> {
    if (tieneCookieDeSesion(req)) {
      const ctx = await this.identidad.resolverSesion(req).catch(() => null);
      return ctx ? aContextoConvocatorias(ctx) : null;
    }
    return this.puenteDev ? this.puenteDev.resolverDesdePeticion(req) : null;
  }
}
