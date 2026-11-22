import type { AlcanceRol, EventoPublicadoIdentidad, RolPersonal } from '@fiavl/contracts';
import type { z } from 'zod';
import type { Plantilla } from '../domain/notificaciones';

/** Puertos del módulo Identidad (spec 004, Parte B). El dominio no conoce Prisma, SMTP ni pg-boss. */

export const RELOJ_IDENTIDAD = Symbol('RELOJ_IDENTIDAD');
/**
 * Hora para los pasos TOTP: siempre la real, aunque FIAVL_AHORA fije el reloj de la demo, porque el
 * teléfono calcula el código con su propia hora (y un reloj congelado agotaría los pasos).
 */
export const RELOJ_TOTP = Symbol('RELOJ_TOTP');
export const PUBLICADOR_IDENTIDAD = Symbol('PUBLICADOR_IDENTIDAD');
export const AUDITORIA_IDENTIDAD = Symbol('AUDITORIA_IDENTIDAD');
export const PROVEEDOR_CORREO = Symbol('PROVEEDOR_CORREO');
export const CIFRADOR = Symbol('CIFRADOR');
export const MANEJADORES_IDENTIDAD = Symbol('MANEJADORES_IDENTIDAD');

export type RelojIdentidad = () => Date;

export interface PublicadorIdentidad {
  publicar(evento: EventoPublicadoIdentidad): Promise<void>;
}

export interface CorreoSaliente {
  para: string;
  asunto: string;
  texto: string;
  html: string;
  /** Imágenes en línea (`cid:`), p. ej. los QR de las entradas (research R17). */
  adjuntos?: { nombre: string; cid: string; contenido: Buffer; tipo: string }[];
}

/** Proveedor de correo intercambiable (ADR-0011): SMTP con nodemailer, memoria en pruebas. */
export interface ProveedorCorreo {
  enviar(correo: CorreoSaliente): Promise<void>;
}

/** Cifrado simétrico autenticado de secretos TOTP (research R13). */
export interface Cifrador {
  cifrar(claro: Buffer): Buffer;
  descifrar(cifrado: Buffer): Buffer;
}

export const REPOSITORIO_IDENTIDAD = Symbol('REPOSITORIO_IDENTIDAD');
export const LISTA_FILTRADAS = Symbol('LISTA_FILTRADAS');

/** RN-008: ¿la contraseña (en minúsculas) está en la lista local de filtradas? */
export type ListaFiltradas = (contrasenaMinusculas: string) => boolean;

export type EstadoCuenta = 'pendiente_verificacion' | 'verificada' | 'desactivada' | 'eliminada';
export type DocumentoLegalTipo = 'politica_privacidad' | 'novedades';

export interface CuentaVista {
  id: string;
  nombre: string;
  correo: string;
  estado: EstadoCuenta;
  verificadaEn: Date | null;
}

export interface TokenVista {
  id: string;
  cuentaId: string;
  tipo: 'verificacion' | 'recuperacion' | 'estudiante';
  expiraEn: Date;
  usadoEn: Date | null;
}

export interface DocumentoLegal {
  documento: DocumentoLegalTipo;
  version: number;
  url: string;
  vigenteDesde: Date;
}

/** Lo necesario para iniciar sesión; el hash nunca sale del caso de uso de sesión. */
export interface CuentaAcceso extends CuentaVista {
  bloqueadaHasta: Date | null;
  esPersonal: boolean;
  hashContrasena: string | null;
}

export interface RolVista {
  rol: RolPersonal;
  alcance: AlcanceRol | null;
}

export interface SesionVista {
  id: string;
  cuentaId: string;
  dispositivo: string;
  segundoFactorOk: boolean;
  creadaEn: Date;
  ultimaActividadEn: Date;
  expiraEn: Date;
  revocadaEn: Date | null;
}

/** Sesión con la cuenta y sus roles leídos en ese momento (ADR-0009: estado al día). */
export interface SesionConCuenta extends SesionVista {
  cuenta: CuentaVista & { esPersonal: boolean; preferencias: { novedades: boolean } };
  roles: RolVista[];
  estudianteAcreditado: boolean;
  /** Última versión aceptada de la política de privacidad (US11-AS4), o null. */
  politicaAceptada: number | null;
}

export interface RepositorioIdentidad {
  enTransaccion<T>(fn: () => Promise<T>): Promise<T>;
  cuenta(id: string): Promise<CuentaVista | null>;
  /** Por correo normalizado. */
  cuentaPorCorreo(correo: string): Promise<CuentaVista | null>;
  crearCuenta(c: { id: string; nombre: string; correo: string; hashContrasena: string; consentimientos: { documento: DocumentoLegalTipo; version: number }[] }): Promise<void>;
  marcarVerificada(cuentaId: string, ahora: Date): Promise<boolean>;
  crearToken(t: { cuentaId: string; tipo: TokenVista['tipo']; hash: Buffer; expiraEn: Date; dato?: unknown }): Promise<void>;
  contarTokens(cuentaId: string, tipo: TokenVista['tipo'], desde: Date): Promise<number>;
  tokenPorHash(hash: Buffer): Promise<TokenVista | null>;
  /** Marca el token como usado; false si ya lo estaba (un solo uso, también bajo concurrencia). */
  usarToken(id: string, ahora: Date): Promise<boolean>;
  documentoVigente(documento: DocumentoLegalTipo, ahora: Date): Promise<DocumentoLegal | null>;
  /** Edición vigente para el sobre de los eventos de Identidad (research: `edicionId` del sobre). */
  edicionVigente(): Promise<string | null>;
  guardarEdicionVigente(edicionId: string, fechaFin: string): Promise<void>;

  // Sesiones (US8, research R12) ------------------------------------------------------------
  cuentaAcceso(correo: string): Promise<CuentaAcceso | null>;
  registrarIntento(correo: string, exito: boolean, ahora: Date): Promise<void>;
  /** Fallos del correo desde `desde` y posteriores al último acierto. */
  contarFallos(correo: string, desde: Date): Promise<number>;
  bloquear(cuentaId: string, hasta: Date): Promise<void>;
  actualizarContrasena(cuentaId: string, hash: string): Promise<void>;
  crearSesion(s: { id: string; cuentaId: string; hash: Buffer; dispositivo: string; segundoFactorOk: boolean; expiraEn: Date; ahora: Date }): Promise<void>;
  sesionPorHash(hash: Buffer, ahora: Date): Promise<SesionConCuenta | null>;
  renovarSesion(id: string, ahora: Date, expiraEn: Date): Promise<void>;
  /** Solo si es de `cuentaId`; false si no existe, es de otra cuenta o ya estaba revocada. */
  revocarSesion(id: string, cuentaId: string, ahora: Date): Promise<boolean>;
  revocarSesionesDe(cuentaId: string, ahora: Date, excepto?: string): Promise<number>;
  sesionesActivas(cuentaId: string, ahora: Date): Promise<SesionVista[]>;
  versionAceptada(cuentaId: string, documento: DocumentoLegalTipo): Promise<number | null>;
  actualizarNombre(cuentaId: string, nombre: string): Promise<void>;
  /** FR-022: la preferencia de novedades se guarda como consentimiento (aceptado o retirado). */
  cambiarNovedades(cuentaId: string, acepta: boolean, version: number, ahora: Date): Promise<void>;

  // Segundo factor y personal (US9, research R13/R16) ----------------------------------------
  segundoFactor(cuentaId: string): Promise<SegundoFactorGuardado | null>;
  /** Alta: guarda un secreto nuevo aún sin activar (reemplaza uno pendiente anterior). */
  guardarSecretoPendiente(cuentaId: string, cifrado: Buffer): Promise<void>;
  /** Acepta el paso solo si es posterior al último usado; false si otro lo usó antes (concurrencia). */
  usarPasoTotp(cuentaId: string, paso: number): Promise<boolean>;
  marcarSegundoFactorOk(sesionId: string): Promise<void>;
  restablecerSegundoFactor(cuentaId: string): Promise<void>;
  rolesVigentes(cuentaId: string): Promise<RolVista[]>;
  asignarRol(cuentaId: string, rol: RolVista, asignadoPor: string, ahora: Date): Promise<void>;
  revocarRol(cuentaId: string, rol: RolVista, ahora: Date): Promise<void>;
  marcarPersonal(cuentaId: string, esPersonal: boolean): Promise<void>;
  cambiarEstado(cuentaId: string, estado: 'verificada' | 'desactivada'): Promise<void>;
  /** Cuentas con `es_personal` (también desactivadas), con roles vigentes y estado del TOTP. */
  listarPersonal(): Promise<CuentaPersonal[]>;
  cuentaPersonal(cuentaId: string): Promise<CuentaPersonal | null>;

  // Notificaciones y proyecciones para avisos (US10, ADR-0011) --------------------------------
  /** Correo, nombre y preferencia de novedades de una cuenta activa; null si no existe o no está activa. */
  contacto(cuentaId: string): Promise<{ correo: string; nombre: string; novedades: boolean } | null>;
  /** Inserta si la clave de deduplicación es nueva; devuelve el id, o null si ya existía (RN-011). */
  crearNotificacion(n: NuevaNotificacion): Promise<string | null>;
  notificacion(id: string): Promise<NotificacionGuardada | null>;
  marcarEnviada(id: string, ahora: Date, datos: Record<string, unknown>): Promise<void>;
  registrarFalloEnvio(id: string, error: string): Promise<void>;
  marcarFallida(id: string, error: string): Promise<void>;
  notificacionesDe(cuentaId: string, antesDe: Date | null, limite: number): Promise<NotificacionGuardada[]>;
  notificacionesFallidas(limite: number): Promise<NotificacionGuardada[]>;
  /** Solo si `version` es mayor que la guardada (eventos fuera de orden). */
  guardarFuncionAviso(f: FuncionAviso): Promise<void>;
  funcionAviso(funcionId: string): Promise<FuncionAviso | null>;
  guardarDestinatario(d: { pedidoId: string; funcionId: string; cuentaId: string | null; correo: string | null }): Promise<void>;
  desactivarDestinatario(pedidoId: string): Promise<void>;
  destinatariosActivos(funcionId: string): Promise<{ cuentaId: string | null; correo: string | null }[]>;
  guardarPostulacion(postulacionId: string, cuentaId: string, estado: 'enviada' | 'subsanacion' | 'cerrada'): Promise<void>;

  // Mis datos (US11, FR-023, RN-010) -------------------------------------------------------------
  /** Todo lo personal de la cuenta para descargarlo (US11-AS1). Nunca hashes, secretos ni tokens. */
  datosPersonales(cuentaId: string): Promise<Record<string, unknown> | null>;
  /** Entradas activas para funciones que aún no empiezan (US11-AS3). */
  funcionesFuturas(cuentaId: string, correo: string, ahora: Date): Promise<{ funcionId: string; titulo: string; inicio: Date }[]>;
  postulacionesEnCurso(cuentaId: string): Promise<number>;
  aceptarPolitica(cuentaId: string, version: number, ahora: Date): Promise<void>;
  /** RN-010 (data-model §Anonimización), en la transacción ambiente. */
  anonimizar(cuentaId: string, correo: string, ahora: Date): Promise<void>;

  // Estudiantes (US12, FR-025, RN-012) -------------------------------------------------------------
  dominios(): Promise<{ dominio: string; institucion: string }[]>;
  /** El dominio registrado que cubre `dominio` (el mismo o uno del que es subdominio), o null. */
  dominioDe(dominio: string): Promise<{ dominio: string; institucion: string } | null>;
  guardarDominio(d: { dominio: string; institucion: string; creadoPor: string }): Promise<boolean>;
  /** Fecha de fin (AAAA-MM-DD) de la edición vigente, conocida por `ProgramacionPublicada`. */
  finEdicionVigente(): Promise<string | null>;
  datoToken(id: string): Promise<unknown>;
  /** Reemplaza la acreditación de estudiante de la cuenta. */
  acreditarEstudiante(cuentaId: string, evidencia: string, vigenteHasta: Date): Promise<void>;
}

export interface FuncionAviso {
  funcionId: string;
  titulo: string;
  sedeNombre: string;
  inicio: Date;
  fin: Date;
  estado: string;
  version: number;
}

export interface NuevaNotificacion {
  id: string;
  cuentaId: string | null;
  correoDestino: string;
  plantilla: Plantilla;
  categoria: 'servicio' | 'opcional';
  eventoOrigenId: string | null;
  claveDedup: string;
  datos: Record<string, unknown>;
  estado: 'pendiente' | 'omitida';
  creadaEn: Date;
}

export interface NotificacionGuardada extends Omit<NuevaNotificacion, 'estado'> {
  estado: 'pendiente' | 'enviada' | 'fallida' | 'omitida';
  intentos: number;
  ultimoError: string | null;
  enviadaEn: Date | null;
}

/** Encola `identidad.enviar-notificacion` dentro de la transacción ambiente (ADR-0011). */
export const COLA_NOTIFICACIONES = Symbol('COLA_NOTIFICACIONES');
export interface ColaNotificaciones {
  encolar(notificacionId: string, correlacionId?: string): Promise<void>;
}

export interface SegundoFactorGuardado {
  secretoCifrado: Buffer | null;
  activo: boolean;
  ultimoPaso: number | null;
}

export interface CuentaPersonal {
  cuentaId: string;
  nombre: string;
  correo: string;
  estado: EstadoCuenta;
  esPersonal: boolean;
  roles: RolVista[];
  segundoFactorActivo: boolean;
}

export interface EntradaAuditoria {
  accion: string;
  actorId: string | null;
  rol?: string | null;
  entidad: string;
  entidadId?: string | null;
  anterior?: unknown;
  nuevo?: unknown;
  correlacionId?: string | null;
}

/** Bitácora inmutable (FR-024). */
export interface AuditoriaIdentidad {
  registrar(entrada: EntradaAuditoria): Promise<void>;
}

export interface ManejadorEvento<E extends { id: string; tipo: string } = { id: string; tipo: string; correlacionId: string }> {
  readonly tipo: string;
  readonly esquema: z.ZodType<E>;
  manejar(evento: E): Promise<void>;
}
