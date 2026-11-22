import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  type AlcanceRol,
  type ContextoIdentidad,
  IDENTIDAD_PUBLICA,
  type IdentidadPublica,
  type PeticionConCabeceras,
  type RolPersonal,
  tieneRol,
} from '@fiavl/contracts';
import { ErrorConCodigo } from '../http/problema-codigo.filter';

/**
 * Autorización en el servidor para Operación e Identidad (spec 004, T024; Constitución VI).
 * Depende solo del contrato IdentidadPublica, nunca del código de `modules/identidad`.
 */
export const META_REQUIERE = 'fiavl:requiere';
export const META_PUBLICO = 'fiavl:publico';
export const META_SIN_SEGUNDO_FACTOR = 'fiavl:sin-segundo-factor';
export const META_SIN_POLITICA = 'fiavl:sin-politica';

/** Exige sesión y, si se indican, alguno de los roles (sin mirar el alcance: ver `exigirAlcance`). */
export const Requiere = (...roles: RolPersonal[]) => SetMetadata(META_REQUIERE, roles);
/** Ruta sin sesión (p. ej. registro e inicio de sesión). */
export const Publico = () => SetMetadata(META_PUBLICO, true);
/** Ruta que una sesión del personal sin segundo factor sí puede usar (alta y verificación de TOTP). */
export const PermiteSinSegundoFactor = () => SetMetadata(META_SIN_SEGUNDO_FACTOR, true);
/** Ruta que una sesión con la política de privacidad pendiente sí puede usar (US11-AS4). */
export const PermiteSinPolitica = () => SetMetadata(META_SIN_POLITICA, true);

export interface PeticionConIdentidad extends PeticionConCabeceras {
  identidad?: ContextoIdentidad;
}

/** Inyecta en el controlador el contexto que dejó el guard. */
export const Identidad = createParamDecorator((_: unknown, ctx: ExecutionContext): ContextoIdentidad => {
  const identidad = ctx.switchToHttp().getRequest<PeticionConIdentidad>().identidad;
  if (!identidad) throw new UnauthorizedException('Requiere sesión autenticada');
  return identidad;
});

@Injectable()
export class RequiereGuard implements CanActivate {
  constructor(
    @Inject(IDENTIDAD_PUBLICA) private readonly identidad: IdentidadPublica,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const objetivos = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(META_PUBLICO, objetivos)) return true;

    const req = ctx.switchToHttp().getRequest<PeticionConIdentidad>();
    const contexto = await this.identidad.resolverSesion(req).catch(() => null);
    if (!contexto) throw new UnauthorizedException('Requiere sesión autenticada');

    const sinSegundoFactor = this.reflector.getAllAndOverride<boolean>(META_SIN_SEGUNDO_FACTOR, objetivos);
    if (!contexto.segundoFactorOk && !sinSegundoFactor) {
      throw new ErrorConCodigo(403, 'segundo_factor_requerido', 'Configura o verifica el segundo factor para continuar.');
    }

    if (contexto.politicaPendiente && !this.reflector.getAllAndOverride<boolean>(META_SIN_POLITICA, objetivos)) {
      throw new ErrorConCodigo(403, 'requiere_politica', 'Hay una versión nueva de la política de privacidad: revísala y acéptala para continuar.');
    }

    const roles = this.reflector.getAllAndOverride<RolPersonal[] | undefined>(META_REQUIERE, objetivos);
    if (roles && roles.length > 0 && !roles.some((r) => tieneRol(contexto, r))) {
      throw new ForbiddenException('Rol insuficiente para esta operación.');
    }
    req.identidad = contexto;
    return true;
  }
}

/**
 * RN-009: un rol con alcance solo autoriza dentro de su alcance. Lanza 403 `fuera_de_alcance`
 * si ninguno de `roles` cubre `alcance`. Un rol sin alcance (p. ej. programador) cubre todo.
 */
export function exigirAlcance(contexto: ContextoIdentidad, roles: readonly RolPersonal[], alcance: AlcanceRol): void {
  const cubre = contexto.roles.some(
    (r) => roles.includes(r.rol) && (r.alcance === null || (r.alcance.tipo === alcance.tipo && r.alcance.valor === alcance.valor)),
  );
  if (!cubre) throw new ErrorConCodigo(403, 'fuera_de_alcance', 'Tu rol no tiene alcance sobre este recurso.');
}
