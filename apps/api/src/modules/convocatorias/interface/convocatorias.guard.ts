import { CanActivate, ExecutionContext, Inject, Injectable, SetMetadata, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AUTORIZACION_CONVOCATORIAS, type AutorizacionConvocatoriasPort, type RolIdentidad } from '../application/puertos';
import { puedeCoordinarProvincia } from '../application/politicas-autorizacion';

export const ROLES_CONVOCATORIAS = 'convocatorias:roles';
export const RolesConvocatorias = (...roles: RolIdentidad[]) => SetMetadata(ROLES_CONVOCATORIAS, roles);

export const ALCANCE_EN_CONTROLADOR = 'convocatorias:alcance-en-controlador';
/** El handler verifica por sí mismo el alcance provincial (listados o recursos aún no cargados). */
export const AlcanceEnControlador = () => SetMetadata(ALCANCE_EN_CONTROLADOR, true);

interface PeticionConvocatorias {
  headers: Record<string, string | string[] | undefined>;
  convocatoriaProvincia?: string;
  contextoConvocatorias?: import('../application/puertos').ContextoConvocatorias;
}

@Injectable()
export class ConvocatoriasGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AUTORIZACION_CONVOCATORIAS) private readonly autorizacion: AutorizacionConvocatoriasPort,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const roles = this.reflector.getAllAndOverride<RolIdentidad[]>(ROLES_CONVOCATORIAS, [context.getHandler(), context.getClass()]);
    const req = context.switchToHttp().getRequest<PeticionConvocatorias>();
    const sujeto = await this.autorizacion.resolverDesdePeticion({ headers: req.headers });
    if (!sujeto) throw new UnauthorizedException();
    if (!roles?.length) return true;
    const tieneRol = sujeto.roles.some(({ rol }) => roles.includes(rol));
    if (!tieneRol) throw new ForbiddenException();
    const delegado = this.reflector.getAllAndOverride<boolean>(ALCANCE_EN_CONTROLADOR, [context.getHandler(), context.getClass()]);
    const provincial = sujeto.roles.some(({ rol }) => rol === 'coordinación provincial' && roles.includes(rol));
    if (provincial && !delegado && (!req.convocatoriaProvincia || !puedeCoordinarProvincia(sujeto, req.convocatoriaProvincia))) {
      throw new ForbiddenException();
    }
    req.contextoConvocatorias = sujeto;
    return true;
  }
}
