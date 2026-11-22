import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import type { ContextoIdentidad } from '@fiavl/contracts';
import { ErrorConCodigo } from '../../../../common/http/problema-codigo.filter';
import { BLOQUEO, bloqueadaHasta, debeBloquear, estaBloqueada } from '../../domain/bloqueo';
import { hashContrasena, necesitaRehash, validarContrasena, verificarContrasena } from '../../domain/contrasenas';
import { cuentaBloqueada, recuperacion } from '../../domain/plantillas/plantillas';
import { debeRenovar, describirDispositivo, expiracionSesion, sesionVigente } from '../../domain/sesiones';
import { estadoToken, expiracionDe, generarToken, hashToken, normalizarCorreo, puedeReenviar } from '../../domain/tokens';
import { enviarSinBloquear } from '../enviar-correo';
import type { AuditoriaIdentidad, ListaFiltradas, ProveedorCorreo, RelojIdentidad, RepositorioIdentidad } from '../puertos';

const HORA = 60 * 60_000;
/** FR-016: el mismo mensaje para correo inexistente, contraseña errónea, cuenta bloqueada o inactiva. */
const CREDENCIALES = 'Correo o contraseña incorrectos. Si olvidaste tu contraseña, puedes recuperarla.';
const MENSAJES_CONTRASENA: Record<string, string> = {
  contrasena_corta: 'La contraseña debe tener al menos 10 caracteres.',
  contrasena_larga: 'La contraseña no puede tener más de 128 caracteres.',
  contrasena_filtrada: 'Esa contraseña aparece en filtraciones conocidas y es fácil de adivinar. Elige otra.',
};
const ACTIVAS = new Set(['pendiente_verificacion', 'verificada']);

export interface SesionIniciada {
  /** Va solo en la cookie `fiavl_sesion`; nunca en el cuerpo ni en logs. */
  token: string;
  esPersonal: boolean;
  cuentaId: string;
}

/**
 * Inicio de sesión, recuperación y resolución de sesiones (US8, ADR-0009, research R12/R14).
 * Las sesiones son tokens opacos: en la base solo su SHA-256; estado y roles se leen en cada petición.
 */
export class SesionServicio {
  private readonly log = new Logger(SesionServicio.name);
  /** Hash de una contraseña cualquiera: se verifica contra él cuando la cuenta no existe (mismo tiempo). */
  private hashSenuelo?: Promise<string>;

  constructor(
    private readonly repo: RepositorioIdentidad,
    private readonly correo: ProveedorCorreo,
    private readonly auditoria: AuditoriaIdentidad,
    private readonly reloj: RelojIdentidad,
    private readonly esFiltrada: ListaFiltradas,
    private readonly urlWeb: string,
  ) {}

  /** US8-AS1/AS2. Personal: sesión de 8 h y, hasta el segundo factor (US9), restringida. */
  async iniciar(correoBruto: string, contrasena: string, agente: string | undefined, correlacionId: string): Promise<SesionIniciada> {
    const correo = normalizarCorreo(correoBruto);
    const ahora = this.reloj();
    const cuenta = await this.repo.cuentaAcceso(correo);
    this.hashSenuelo ??= hashContrasena('senuelo-que-nunca-coincide');
    const correcta = await verificarContrasena(contrasena, cuenta?.hashContrasena ?? (await this.hashSenuelo));
    const puede = !!cuenta && correcta && ACTIVAS.has(cuenta.estado) && !estaBloqueada(cuenta.bloqueadaHasta, ahora);

    if (!puede) {
      await this.repo.registrarIntento(correo, false, ahora);
      if (cuenta && ACTIVAS.has(cuenta.estado) && !estaBloqueada(cuenta.bloqueadaHasta, ahora)) {
        const fallos = await this.repo.contarFallos(correo, new Date(ahora.getTime() - BLOQUEO.ventanaMs));
        if (debeBloquear(fallos)) {
          const hasta = bloqueadaHasta(ahora);
          await this.repo.bloquear(cuenta.id, hasta);
          await this.auditoria.registrar({ accion: 'cuenta.bloqueada', actorId: null, entidad: 'cuenta', entidadId: cuenta.id, nuevo: { hasta: hasta.toISOString(), fallos }, correlacionId });
          enviarSinBloquear(this.correo, correo, cuentaBloqueada(cuenta.nombre, horaLoja(hasta), `${this.urlWeb}/cuenta/recuperar`), this.log);
        }
      }
      throw new ErrorConCodigo(401, 'credenciales_invalidas', CREDENCIALES);
    }

    const { token, hash } = generarToken();
    const id = randomUUID();
    await this.repo.enTransaccion(async () => {
      await this.repo.registrarIntento(correo, true, ahora);
      await this.repo.crearSesion({
        id,
        cuentaId: cuenta.id,
        hash,
        dispositivo: describirDispositivo(agente),
        // shortcut: el segundo factor llega con US9 (T082); hasta entonces el personal queda restringido.
        segundoFactorOk: !cuenta.esPersonal,
        expiraEn: expiracionSesion(cuenta.esPersonal, ahora),
        ahora,
      });
      if (necesitaRehash(cuenta.hashContrasena!)) await this.repo.actualizarContrasena(cuenta.id, await hashContrasena(contrasena));
      // FR-024: los inicios de sesión del personal quedan en la auditoría.
      if (cuenta.esPersonal) await this.auditoria.registrar({ accion: 'sesion.inicio_personal', actorId: cuenta.id, entidad: 'sesion', entidadId: id, correlacionId });
    });
    return { token, esPersonal: cuenta.esPersonal, cuentaId: cuenta.id };
  }

  /**
   * Contrato IdentidadPublica (FR-020): sesión vigente con estado y roles leídos ahora mismo.
   * Expiración deslizante, con la actividad escrita como máximo una vez por minuto.
   */
  async resolver(token: string): Promise<ContextoIdentidad | null> {
    const ahora = this.reloj();
    const s = await this.repo.sesionPorHash(hashToken(token), ahora);
    if (!s || !sesionVigente(s, ahora) || !ACTIVAS.has(s.cuenta.estado)) return null;
    if (debeRenovar(s.ultimaActividadEn, ahora)) await this.repo.renovarSesion(s.id, ahora, expiracionSesion(s.cuenta.esPersonal, ahora));
    return {
      cuentaId: s.cuenta.id,
      sesionId: s.id,
      correo: s.cuenta.correo,
      correoVerificado: s.cuenta.estado === 'verificada',
      estudianteAcreditado: s.estudianteAcreditado,
      segundoFactorOk: s.segundoFactorOk,
      roles: s.roles,
    };
  }

  async cerrar(token: string): Promise<void> {
    const ahora = this.reloj();
    const s = await this.repo.sesionPorHash(hashToken(token), ahora);
    if (s) await this.repo.revocarSesion(s.id, s.cuentaId, ahora);
  }

  /** US8-AS3: enlace de 1 hora y un solo uso. Misma respuesta exista o no la cuenta. */
  async pedirRecuperacion(correoBruto: string): Promise<void> {
    const correo = normalizarCorreo(correoBruto);
    const ahora = this.reloj();
    const cuenta = await this.repo.cuentaPorCorreo(correo);
    if (!cuenta || !ACTIVAS.has(cuenta.estado)) return;
    if (!puedeReenviar(await this.repo.contarTokens(cuenta.id, 'recuperacion', new Date(ahora.getTime() - HORA)))) return;
    const { token, hash } = generarToken();
    await this.repo.crearToken({ cuentaId: cuenta.id, tipo: 'recuperacion', hash, expiraEn: expiracionDe('recuperacion', ahora) });
    enviarSinBloquear(this.correo, correo, recuperacion(cuenta.nombre, `${this.urlWeb}/cuenta/recuperar/nueva?token=${token}`), this.log);
  }

  /** US8-AS3: cambia la contraseña con el enlace y cierra todas las sesiones abiertas. */
  async confirmarRecuperacion(token: string, nueva: string, correlacionId: string): Promise<void> {
    const ahora = this.reloj();
    const t = await this.repo.tokenPorHash(hashToken(token));
    if (!t || t.tipo !== 'recuperacion') throw new ErrorConCodigo(410, 'enlace_vencido', 'El enlace no es válido o ya venció. Pide uno nuevo.');
    const estado = estadoToken(t, ahora);
    if (estado === 'usado') throw new ErrorConCodigo(410, 'enlace_usado', 'Este enlace ya se usó. Pide uno nuevo si lo necesitas.');
    if (estado === 'vencido') throw new ErrorConCodigo(410, 'enlace_vencido', 'El enlace venció (vale 1 hora). Pide uno nuevo.');
    const v = validarContrasena(nueva, this.esFiltrada);
    if (!v.ok) throw new ErrorConCodigo(400, v.codigo, MENSAJES_CONTRASENA[v.codigo]!);
    const hash = await hashContrasena(nueva);
    await this.repo.enTransaccion(async () => {
      if (!(await this.repo.usarToken(t.id, ahora))) throw new ErrorConCodigo(410, 'enlace_usado', 'Este enlace ya se usó.');
      await this.repo.actualizarContrasena(t.cuentaId, hash);
      // Quien abre el enlace demuestra controlar el correo: una cuenta pendiente queda verificada.
      await this.repo.marcarVerificada(t.cuentaId, ahora);
      const cerradas = await this.repo.revocarSesionesDe(t.cuentaId, ahora);
      await this.auditoria.registrar({ accion: 'cuenta.contrasena_recuperada', actorId: t.cuentaId, entidad: 'cuenta', entidadId: t.cuentaId, nuevo: { sesionesCerradas: cerradas }, correlacionId });
    });
  }

  /** Validación y hash compartidos con "cambiar mi contraseña". */
  async nuevaContrasena(nueva: string): Promise<string> {
    const v = validarContrasena(nueva, this.esFiltrada);
    if (!v.ok) throw new ErrorConCodigo(400, v.codigo, MENSAJES_CONTRASENA[v.codigo]!);
    return hashContrasena(nueva);
  }
}

const horaLoja = (d: Date) =>
  new Intl.DateTimeFormat('es-EC', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'America/Guayaquil' }).format(d);
