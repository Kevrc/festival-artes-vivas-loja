import type { ContextoIdentidad } from '@fiavl/contracts';
import { ErrorConCodigo } from '../../../../common/http/problema-codigo.filter';
import { verificarContrasena } from '../../domain/contrasenas';
import type { AuditoriaIdentidad, RelojIdentidad, RepositorioIdentidad, RolVista, SesionVista } from '../puertos';
import type { SesionServicio } from '../sesion/sesion.servicio';

export interface Yo {
  cuentaId: string;
  nombre: string;
  correo: string;
  correoVerificado: boolean;
  estudianteAcreditado: boolean;
  novedades: boolean;
  roles: RolVista[];
  segundoFactorOk: boolean;
  /** Versión de la política por aceptar (US11-AS4), o null si está al día. */
  politicaPendiente: string | null;
}

/** "Mi cuenta" (US8-AS3/AS4, FR-022, FR-023): datos propios, contraseña y sesiones abiertas. */
export class MiCuentaServicio {
  constructor(
    private readonly repo: RepositorioIdentidad,
    private readonly sesiones: SesionServicio,
    private readonly auditoria: AuditoriaIdentidad,
    private readonly reloj: RelojIdentidad,
  ) {}

  async yo(ctx: ContextoIdentidad): Promise<Yo> {
    const cuenta = await this.repo.cuenta(ctx.cuentaId);
    if (!cuenta) throw new ErrorConCodigo(401, 'sin_sesion', 'Requiere sesión autenticada');
    const [aceptada, vigente, acceso] = await Promise.all([
      this.repo.versionAceptada(ctx.cuentaId, 'politica_privacidad'),
      this.repo.documentoVigente('politica_privacidad', this.reloj()),
      this.repo.versionAceptada(ctx.cuentaId, 'novedades'),
    ]);
    return {
      cuentaId: cuenta.id,
      nombre: cuenta.nombre,
      correo: cuenta.correo,
      correoVerificado: ctx.correoVerificado,
      estudianteAcreditado: ctx.estudianteAcreditado,
      novedades: acceso !== null,
      roles: ctx.roles,
      segundoFactorOk: ctx.segundoFactorOk,
      politicaPendiente: vigente && (aceptada ?? 0) < vigente.version ? String(vigente.version) : null,
    };
  }

  /** FR-023: corregir el nombre; FR-022: la preferencia de novedades queda como consentimiento. */
  async actualizar(ctx: ContextoIdentidad, cambios: { nombre?: string; novedades?: boolean }, correlacionId: string): Promise<Yo> {
    const ahora = this.reloj();
    await this.repo.enTransaccion(async () => {
      if (cambios.nombre !== undefined) await this.repo.actualizarNombre(ctx.cuentaId, cambios.nombre.trim());
      if (cambios.novedades !== undefined) {
        const politica = await this.repo.documentoVigente('politica_privacidad', ahora);
        await this.repo.cambiarNovedades(ctx.cuentaId, cambios.novedades, politica?.version ?? 1, ahora);
      }
      await this.auditoria.registrar({ accion: 'cuenta.datos_corregidos', actorId: ctx.cuentaId, entidad: 'cuenta', entidadId: ctx.cuentaId, nuevo: cambios, correlacionId });
    });
    return this.yo(ctx);
  }

  /** US8-AS3: con la contraseña actual; se cierran las demás sesiones, no la actual. */
  async cambiarContrasena(ctx: ContextoIdentidad, actual: string, nueva: string, correlacionId: string): Promise<void> {
    const cuenta = await this.repo.cuentaAcceso(ctx.correo);
    if (!cuenta?.hashContrasena || !(await verificarContrasena(actual, cuenta.hashContrasena))) {
      throw new ErrorConCodigo(400, 'credenciales_invalidas', 'La contraseña actual no es correcta.');
    }
    const hash = await this.sesiones.nuevaContrasena(nueva);
    const ahora = this.reloj();
    await this.repo.enTransaccion(async () => {
      await this.repo.actualizarContrasena(ctx.cuentaId, hash);
      const cerradas = await this.repo.revocarSesionesDe(ctx.cuentaId, ahora, ctx.sesionId);
      await this.auditoria.registrar({ accion: 'cuenta.contrasena_cambiada', actorId: ctx.cuentaId, entidad: 'cuenta', entidadId: ctx.cuentaId, nuevo: { sesionesCerradas: cerradas }, correlacionId });
    });
  }

  /** US8-AS4. */
  async sesionesAbiertas(ctx: ContextoIdentidad): Promise<(SesionVista & { actual: boolean })[]> {
    const lista = await this.repo.sesionesActivas(ctx.cuentaId, this.reloj());
    return lista.map((s) => ({ ...s, actual: s.id === ctx.sesionId }));
  }

  /** US8-AS4: el otro dispositivo pierde el acceso de inmediato (la sesión se lee en cada petición). */
  async cerrarSesion(ctx: ContextoIdentidad, sesionId: string, correlacionId: string): Promise<void> {
    const ok = await this.repo.revocarSesion(sesionId, ctx.cuentaId, this.reloj());
    if (!ok) throw new ErrorConCodigo(404, 'no_encontrado', 'Esa sesión no existe o ya estaba cerrada.');
    await this.auditoria.registrar({ accion: 'sesion.cerrada_por_titular', actorId: ctx.cuentaId, entidad: 'sesion', entidadId: sesionId, correlacionId });
  }
}
