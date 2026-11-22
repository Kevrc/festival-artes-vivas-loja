import type { ContextoIdentidad } from '@fiavl/contracts';
import { ErrorConCodigo } from '../../../../common/http/problema-codigo.filter';
import { verificarContrasena } from '../../domain/contrasenas';
import { randomUUID } from 'node:crypto';
import type { AuditoriaIdentidad, PublicadorIdentidad, RelojIdentidad, RepositorioIdentidad, RolVista, SesionVista } from '../puertos';
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
  /** Solo personal: si ya tiene TOTP configurado (verificar) o le falta darlo de alta. */
  segundoFactorActivo: boolean;
  esPersonal: boolean;
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
    private readonly publicador: PublicadorIdentidad,
  ) {}

  async yo(ctx: ContextoIdentidad): Promise<Yo> {
    const cuenta = await this.repo.cuenta(ctx.cuentaId);
    if (!cuenta) throw new ErrorConCodigo(401, 'sin_sesion', 'Requiere sesión autenticada');
    const [aceptada, vigente, acceso, personal] = await Promise.all([
      this.repo.versionAceptada(ctx.cuentaId, 'politica_privacidad'),
      this.repo.documentoVigente('politica_privacidad', this.reloj()),
      this.repo.versionAceptada(ctx.cuentaId, 'novedades'),
      this.repo.cuentaPersonal(ctx.cuentaId),
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
      segundoFactorActivo: personal?.segundoFactorActivo === true,
      esPersonal: personal?.esPersonal === true,
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

  /** US11-AS1: un JSON con todo lo personal, generado al momento (SC-009). */
  async misDatos(ctx: ContextoIdentidad, correlacionId: string): Promise<Record<string, unknown>> {
    const datos = await this.repo.datosPersonales(ctx.cuentaId);
    if (!datos) throw new ErrorConCodigo(401, 'sin_sesion', 'Requiere sesión autenticada');
    await this.auditoria.registrar({ accion: 'cuenta.datos_descargados', actorId: ctx.cuentaId, entidad: 'cuenta', entidadId: ctx.cuentaId, correlacionId });
    return { generadoEn: this.reloj().toISOString(), responsable: 'Festival Internacional de Artes Vivas de Loja', ...datos };
  }

  /** US11-AS3: antes de eliminar se informa lo que se pierde. */
  async evaluarEliminacion(ctx: ContextoIdentidad) {
    const [funciones, postulaciones] = await Promise.all([
      this.repo.funcionesFuturas(ctx.cuentaId, ctx.correo, this.reloj()),
      this.repo.postulacionesEnCurso(ctx.cuentaId),
    ]);
    return {
      funcionesFuturas: funciones.map((f) => ({ funcionId: f.funcionId, titulo: f.titulo, inicio: f.inicio.toISOString() })),
      postulacionesEnCurso: postulaciones,
    };
  }

  /**
   * US11-AS2/AS3, RN-010: anonimiza la cuenta en una transacción y publica `CuentaEliminada`. Con
   * entradas futuras o postulaciones en curso exige `asumoPerdida`; las entradas siguen valiendo con
   * el QR ya recibido por correo.
   */
  async eliminar(ctx: ContextoIdentidad, contrasena: string, asumoPerdida: boolean, correlacionId: string): Promise<void> {
    const cuenta = await this.repo.cuentaAcceso(ctx.correo);
    if (!cuenta?.hashContrasena || !(await verificarContrasena(contrasena, cuenta.hashContrasena))) {
      throw new ErrorConCodigo(400, 'credenciales_invalidas', 'La contraseña no es correcta.');
    }
    const evaluacion = await this.evaluarEliminacion(ctx);
    if (!asumoPerdida && evaluacion.funcionesFuturas.length > 0) {
      throw new ErrorConCodigo(409, 'funciones_futuras', 'Tienes entradas para funciones que aún no se realizan. Confirma que asumes perderlas desde tu cuenta (seguirán valiendo con el QR que recibiste por correo).', evaluacion);
    }
    if (!asumoPerdida && evaluacion.postulacionesEnCurso > 0) {
      throw new ErrorConCodigo(409, 'postulaciones_en_curso', 'Tienes postulaciones en curso: si eliminas la cuenta ya no recibirás sus avisos. Confirma para continuar.', evaluacion);
    }
    const ahora = this.reloj();
    await this.repo.enTransaccion(async () => {
      await this.repo.anonimizar(ctx.cuentaId, ctx.correo, ahora);
      await this.auditoria.registrar({
        accion: 'cuenta.eliminada', actorId: ctx.cuentaId, entidad: 'cuenta', entidadId: ctx.cuentaId,
        nuevo: { funcionesFuturas: evaluacion.funcionesFuturas.length, postulacionesEnCurso: evaluacion.postulacionesEnCurso }, correlacionId,
      });
      await this.publicador.publicar({
        id: randomUUID(), tipo: 'CuentaEliminada', version: 1, ocurridoEn: ahora.toISOString(),
        edicionId: (await this.repo.edicionVigente()) ?? '00000000-0000-0000-0000-000000000000', correlacionId,
        datos: { cuentaId: ctx.cuentaId, eliminadaEn: ahora.toISOString() },
      });
    });
  }

  /** US11-AS4: registra qué versión aceptó y cuándo; la sesión deja de estar restringida. */
  async aceptarPolitica(ctx: ContextoIdentidad, version: number, correlacionId: string): Promise<void> {
    const ahora = this.reloj();
    const vigente = await this.repo.documentoVigente('politica_privacidad', ahora);
    if (!vigente) throw new ErrorConCodigo(503, 'sin_politica', 'No hay una política de privacidad vigente.');
    if (version !== vigente.version) {
      throw new ErrorConCodigo(400, 'politica_no_aceptada', 'Esa no es la versión vigente de la política: recarga la página.', { versionVigente: vigente.version });
    }
    if (((await this.repo.versionAceptada(ctx.cuentaId, 'politica_privacidad')) ?? 0) >= version) return;
    await this.repo.enTransaccion(async () => {
      await this.repo.aceptarPolitica(ctx.cuentaId, version, ahora);
      await this.auditoria.registrar({ accion: 'cuenta.politica_aceptada', actorId: ctx.cuentaId, entidad: 'cuenta', entidadId: ctx.cuentaId, nuevo: { version }, correlacionId });
    });
  }

  /** US8-AS4: el otro dispositivo pierde el acceso de inmediato (la sesión se lee en cada petición). */
  async cerrarSesion(ctx: ContextoIdentidad, sesionId: string, correlacionId: string): Promise<void> {
    const ok = await this.repo.revocarSesion(sesionId, ctx.cuentaId, this.reloj());
    if (!ok) throw new ErrorConCodigo(404, 'no_encontrado', 'Esa sesión no existe o ya estaba cerrada.');
    await this.auditoria.registrar({ accion: 'sesion.cerrada_por_titular', actorId: ctx.cuentaId, entidad: 'sesion', entidadId: sesionId, correlacionId });
  }
}
