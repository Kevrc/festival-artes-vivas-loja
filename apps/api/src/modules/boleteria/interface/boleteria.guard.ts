import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AUTORIZACION_BOLETERIA, type AutorizacionBoleteriaPort, type ContextoUsuario } from '../application/puertos';
import type { RolBoleteria } from '../domain/tipos';

export const META_ROLES = 'boleteria:roles';
export const META_VERIFICADA = 'boleteria:verificada';

export const RolesBoleteria = (...roles: RolBoleteria[]) => SetMetadata(META_ROLES, roles);
export const RequiereCuentaVerificada = () => SetMetadata(META_VERIFICADA, true);

export interface PeticionConUsuario {
  headers: Record<string, string | string[] | undefined>;
  usuario?: ContextoUsuario;
}

@Injectable()
export class BoleteriaGuard implements CanActivate {
  constructor(
    @Inject(AUTORIZACION_BOLETERIA) private readonly auth: AutorizacionBoleteriaPort,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<PeticionConUsuario>();
    const usuario = await this.auth.resolverDesdePeticion(req);
    if (!usuario) throw new UnauthorizedException('Requiere sesión autenticada');

    const requiereVerificada = this.reflector.getAllAndOverride<boolean>(META_VERIFICADA, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (requiereVerificada && !usuario.correoVerificado) {
      throw new ForbiddenException('Debes verificar tu correo antes de comprar o reservar entradas (FR-016).');
    }

    const rolesPermitidos = this.reflector.getAllAndOverride<RolBoleteria[]>(META_ROLES, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (rolesPermitidos && rolesPermitidos.length > 0) {
      const tieneRol = usuario.roles.some((r) => rolesPermitidos.includes(r.rol) || r.rol === 'administrador');
      if (!tieneRol) throw new ForbiddenException('Rol insuficiente para esta operación.');
    }

    req.usuario = usuario;
    return true;
  }
}

/** Comprueba en el servidor el alcance por sede del personal (Constitución VI). */
export function verificarAlcanceSede(usuario: ContextoUsuario, roles: readonly RolBoleteria[], sedeId: string): void {
  if (usuario.roles.some((r) => r.rol === 'administrador')) return;
  const autorizado = usuario.roles.some((r) => roles.includes(r.rol) && (!r.sedeId || r.sedeId === sedeId));
  if (!autorizado) {
    throw new ForbiddenException('Tu rol no tiene alcance sobre la sede de esta función.');
  }
}
