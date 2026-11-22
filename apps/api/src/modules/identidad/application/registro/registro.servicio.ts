import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { ErrorConCodigo } from '../../../../common/http/problema-codigo.filter';
import { hashContrasena, validarContrasena } from '../../domain/contrasenas';
import { type Correo, cuentaExistente, verificacion } from '../../domain/plantillas/plantillas';
import { enviarSinBloquear } from '../enviar-correo';
import { estadoToken, expiracionDe, generarToken, hashToken, normalizarCorreo, puedeReenviar } from '../../domain/tokens';
import type {
  AuditoriaIdentidad,
  DocumentoLegal,
  ListaFiltradas,
  ProveedorCorreo,
  PublicadorIdentidad,
  RelojIdentidad,
  RepositorioIdentidad,
} from '../puertos';

export interface EntradaRegistro {
  nombre: string;
  correo: string;
  contrasena: string;
  aceptaPolitica: boolean;
  versionPolitica: number;
  aceptaNovedades: boolean;
}

/** Edición desconocida para el sobre de los eventos (antes de la primera `ProgramacionPublicada`). */
const SIN_EDICION = '00000000-0000-0000-0000-000000000000';
const HORA = 60 * 60_000;

const MENSAJES: Record<string, string> = {
  contrasena_corta: 'La contraseña debe tener al menos 10 caracteres.',
  contrasena_larga: 'La contraseña no puede tener más de 128 caracteres.',
  contrasena_filtrada: 'Esa contraseña aparece en filtraciones conocidas y es fácil de adivinar. Elige otra.',
};

/**
 * Registro y verificación de correo (US7, FR-014, FR-015, research R15). Las respuestas no revelan
 * si un correo ya tiene cuenta (US7-AS3): misma respuesta y un tiempo parecido (siempre se calcula
 * el hash). shortcut: hasta la cola de notificaciones (US10, ADR-0011) el correo se envía después
 * de confirmar la transacción y un fallo del servidor de correo no bloquea el registro (RNF-007).
 */
export class RegistroServicio {
  private readonly log = new Logger(RegistroServicio.name);

  constructor(
    private readonly repo: RepositorioIdentidad,
    private readonly correo: ProveedorCorreo,
    private readonly publicador: PublicadorIdentidad,
    private readonly auditoria: AuditoriaIdentidad,
    private readonly reloj: RelojIdentidad,
    private readonly esFiltrada: ListaFiltradas,
    private readonly urlWeb: string,
  ) {}

  /** Política de privacidad vigente: la página de registro muestra su versión y su enlace. */
  async politicaVigente(): Promise<DocumentoLegal> {
    const p = await this.repo.documentoVigente('politica_privacidad', this.reloj());
    if (!p) throw new ErrorConCodigo(503, 'sin_politica', 'No hay una política de privacidad vigente.');
    return p;
  }

  async registrar(e: EntradaRegistro, correlacionId: string): Promise<void> {
    // US7-AS5: sin aceptar la política no se crea la cuenta.
    if (!e.aceptaPolitica) throw new ErrorConCodigo(400, 'politica_no_aceptada', 'Debes aceptar la política de privacidad para crear la cuenta.');
    const politica = await this.politicaVigente();
    if (e.versionPolitica !== politica.version) {
      throw new ErrorConCodigo(400, 'politica_no_aceptada', 'La política de privacidad cambió: revisa la versión vigente y acéptala.', { versionVigente: politica.version });
    }
    // US7-AS4 / RN-008: se valida antes de mirar si el correo existe (misma respuesta en ambos casos).
    const v = validarContrasena(e.contrasena, this.esFiltrada);
    if (!v.ok) throw new ErrorConCodigo(400, v.codigo, MENSAJES[v.codigo]!);
    const hash = await hashContrasena(e.contrasena);
    const correo = normalizarCorreo(e.correo);
    const ahora = this.reloj();

    const existente = await this.repo.cuentaPorCorreo(correo);
    if (existente) {
      if (existente.estado === 'pendiente_verificacion') {
        // Pasado el límite no se envía, pero tampoco se avisa: el 429 delataría que la cuenta existe.
        await this.enviarVerificacion(existente.id, existente.nombre, correo, ahora).catch((err: unknown) => {
          if (!(err instanceof ErrorConCodigo && err.codigo === 'limite_reenvios')) throw err;
        });
      } else if (existente.estado === 'verificada') {
        this.enviar(correo, cuentaExistente(existente.nombre, `${this.urlWeb}/cuenta/ingresar`));
      }
      await this.auditoria.registrar({ accion: 'cuenta.registro_repetido', actorId: null, entidad: 'cuenta', entidadId: existente.id, correlacionId });
      return;
    }

    const id = randomUUID();
    const enlace = await this.repo.enTransaccion(async () => {
      await this.repo.crearCuenta({
        id,
        nombre: e.nombre.trim(),
        correo,
        hashContrasena: hash,
        consentimientos: [
          { documento: 'politica_privacidad', version: politica.version },
          ...(e.aceptaNovedades ? [{ documento: 'novedades' as const, version: politica.version }] : []),
        ],
      });
      const t = await this.nuevoToken(id, ahora);
      await this.auditar('cuenta.registro', id, correlacionId);
      return t;
    });
    this.enviar(correo, verificacion(e.nombre.trim(), enlace));
  }

  /** US7-AS2: el enlace verifica la cuenta si no venció (24 h) ni se usó. Emite CuentaVerificada. */
  async verificar(token: string, correlacionId: string): Promise<void> {
    const ahora = this.reloj();
    const t = await this.repo.tokenPorHash(hashToken(token));
    if (!t || t.tipo !== 'verificacion') throw new ErrorConCodigo(410, 'enlace_vencido', 'El enlace no es válido o ya venció. Pide uno nuevo.');
    const estado = estadoToken(t, ahora);
    if (estado === 'usado') throw new ErrorConCodigo(410, 'enlace_usado', 'Este enlace ya se usó. Si tu cuenta ya está verificada, puedes ingresar.');
    if (estado === 'vencido') throw new ErrorConCodigo(410, 'enlace_vencido', 'El enlace venció. Pide uno nuevo.');
    await this.repo.enTransaccion(async () => {
      if (!(await this.repo.usarToken(t.id, ahora))) throw new ErrorConCodigo(410, 'enlace_usado', 'Este enlace ya se usó.');
      if (!(await this.repo.marcarVerificada(t.cuentaId, ahora))) return; // ya estaba verificada
      await this.auditar('cuenta.verificada', t.cuentaId, correlacionId);
      await this.publicador.publicar({
        id: randomUUID(),
        tipo: 'CuentaVerificada',
        version: 1,
        ocurridoEn: ahora.toISOString(),
        edicionId: (await this.repo.edicionVigente()) ?? SIN_EDICION,
        correlacionId,
        datos: { cuentaId: t.cuentaId, verificadaEn: ahora.toISOString() },
      });
    });
  }

  /** Caso borde: el enlace caducó y se pide otro (máximo 3 por hora). Misma respuesta exista o no. */
  async reenviar(correoBruto: string): Promise<void> {
    const correo = normalizarCorreo(correoBruto);
    const cuenta = await this.repo.cuentaPorCorreo(correo);
    if (!cuenta || cuenta.estado !== 'pendiente_verificacion') return;
    await this.enviarVerificacion(cuenta.id, cuenta.nombre, correo, this.reloj());
  }

  private async enviarVerificacion(cuentaId: string, nombre: string, correo: string, ahora: Date) {
    const enviados = await this.repo.contarTokens(cuentaId, 'verificacion', new Date(ahora.getTime() - HORA));
    if (!puedeReenviar(enviados)) {
      throw new ErrorConCodigo(429, 'limite_reenvios', 'Ya pediste 3 enlaces en la última hora. Revisa tu correo o espera un poco.');
    }
    const enlace = await this.nuevoToken(cuentaId, ahora);
    this.enviar(correo, verificacion(nombre, enlace));
  }

  private async nuevoToken(cuentaId: string, ahora: Date): Promise<string> {
    const { token, hash } = generarToken();
    await this.repo.crearToken({ cuentaId, tipo: 'verificacion', hash, expiraEn: expiracionDe('verificacion', ahora) });
    return `${this.urlWeb}/cuenta/verificar?token=${token}`;
  }

  private enviar(para: string, c: Correo) {
    enviarSinBloquear(this.correo, para, c, this.log);
  }

  private auditar(accion: string, cuentaId: string, correlacionId: string) {
    return this.auditoria.registrar({ accion, actorId: cuentaId, entidad: 'cuenta', entidadId: cuentaId, correlacionId });
  }
}
