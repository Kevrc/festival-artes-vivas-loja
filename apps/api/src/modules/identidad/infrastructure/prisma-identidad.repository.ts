import { randomUUID } from 'node:crypto';
import type { Prisma } from '../../../generated/prisma/index.js';
import { enTransaccion, transaccionActual } from '../../../common/datos/transaccion';
import type { PrismaService } from '../../../common/prisma/prisma.service';
import type {
  CuentaAcceso,
  CuentaPersonal,
  CuentaVista,
  DocumentoLegal,
  DocumentoLegalTipo,
  FuncionAviso,
  NotificacionGuardada,
  NuevaNotificacion,
  RepositorioIdentidad,
  RolVista,
  SegundoFactorGuardado,
  SesionConCuenta,
  SesionVista,
  TokenVista,
} from '../application/puertos';

type Tx = Prisma.TransactionClient | PrismaService;
/** Prisma 6 tipa `Bytes` como Uint8Array<ArrayBuffer>; un Buffer de Node puede compartir memoria. */
const bytes = (b: Buffer): Uint8Array<ArrayBuffer> => new Uint8Array(b);

const seleccionCuenta = { id: true, nombre: true, correo: true, estado: true, verificadaEn: true } as const;

/** Repositorio del esquema `identidad` (data-model.md §identidad). Nunca devuelve hashes ni secretos. */
export class PrismaIdentidadRepository implements RepositorioIdentidad {
  constructor(private readonly db: PrismaService) {}

  private get tx(): Tx {
    return transaccionActual() ?? this.db;
  }

  enTransaccion<T>(fn: () => Promise<T>): Promise<T> {
    return enTransaccion(this.db, () => fn());
  }

  cuenta(id: string): Promise<CuentaVista | null> {
    return this.tx.cuenta.findUnique({ where: { id }, select: seleccionCuenta });
  }

  cuentaPorCorreo(correo: string): Promise<CuentaVista | null> {
    return this.tx.cuenta.findUnique({ where: { correo }, select: seleccionCuenta });
  }

  async crearCuenta(c: { id: string; nombre: string; correo: string; hashContrasena: string; consentimientos: { documento: DocumentoLegalTipo; version: number }[] }) {
    await this.tx.cuenta.create({
      data: {
        id: c.id,
        nombre: c.nombre,
        correo: c.correo,
        preferencias: { novedades: c.consentimientos.some((x) => x.documento === 'novedades') },
        credencial: { create: { hashContrasena: c.hashContrasena } },
        consentimientos: { create: c.consentimientos.map((x) => ({ id: randomUUID(), documento: x.documento, version: x.version })) },
      },
    });
  }

  async marcarVerificada(cuentaId: string, ahora: Date): Promise<boolean> {
    const { count } = await this.tx.cuenta.updateMany({
      where: { id: cuentaId, estado: 'pendiente_verificacion' },
      data: { estado: 'verificada', verificadaEn: ahora },
    });
    return count > 0;
  }

  async crearToken(t: { cuentaId: string; tipo: TokenVista['tipo']; hash: Buffer; expiraEn: Date; dato?: unknown }) {
    await this.tx.tokenCuenta.create({
      data: {
        id: randomUUID(),
        cuentaId: t.cuentaId,
        tipo: t.tipo,
        hashToken: bytes(t.hash),
        expiraEn: t.expiraEn,
        ...(t.dato === undefined ? {} : { dato: t.dato as Prisma.InputJsonValue }),
      },
    });
  }

  contarTokens(cuentaId: string, tipo: TokenVista['tipo'], desde: Date): Promise<number> {
    return this.tx.tokenCuenta.count({ where: { cuentaId, tipo, creadoEn: { gte: desde } } });
  }

  tokenPorHash(hash: Buffer): Promise<TokenVista | null> {
    return this.tx.tokenCuenta.findUnique({
      where: { hashToken: bytes(hash) },
      select: { id: true, cuentaId: true, tipo: true, expiraEn: true, usadoEn: true },
    });
  }

  async usarToken(id: string, ahora: Date): Promise<boolean> {
    const { count } = await this.tx.tokenCuenta.updateMany({ where: { id, usadoEn: null }, data: { usadoEn: ahora } });
    return count > 0;
  }

  async documentoVigente(documento: DocumentoLegalTipo, ahora: Date): Promise<DocumentoLegal | null> {
    return this.tx.documentoLegal.findFirst({
      where: { documento, vigenteDesde: { lte: ahora } },
      orderBy: { version: 'desc' },
      select: { documento: true, version: true, url: true, vigenteDesde: true },
    });
  }

  async edicionVigente(): Promise<string | null> {
    const e = await this.tx.edicionVigente.findFirst({ orderBy: { fechaFin: 'desc' }, select: { edicionId: true } });
    return e?.edicionId ?? null;
  }

  async cuentaAcceso(correo: string): Promise<CuentaAcceso | null> {
    const c = await this.tx.cuenta.findUnique({ where: { correo }, include: { credencial: { select: { hashContrasena: true } } } });
    if (!c) return null;
    return {
      id: c.id,
      nombre: c.nombre,
      correo: c.correo,
      estado: c.estado,
      verificadaEn: c.verificadaEn,
      bloqueadaHasta: c.bloqueadaHasta,
      esPersonal: c.esPersonal,
      hashContrasena: c.credencial?.hashContrasena ?? null,
    };
  }

  async registrarIntento(correo: string, exito: boolean, ahora: Date): Promise<void> {
    await this.tx.intentoAcceso.create({ data: { id: randomUUID(), correo, exito, ocurridoEn: ahora } });
  }

  async contarFallos(correo: string, desde: Date): Promise<number> {
    const acierto = await this.tx.intentoAcceso.findFirst({ where: { correo, exito: true, ocurridoEn: { gte: desde } }, orderBy: { ocurridoEn: 'desc' } });
    return this.tx.intentoAcceso.count({ where: { correo, exito: false, ocurridoEn: { gte: acierto ? acierto.ocurridoEn : desde } } });
  }

  async bloquear(cuentaId: string, hasta: Date): Promise<void> {
    await this.tx.cuenta.update({ where: { id: cuentaId }, data: { bloqueadaHasta: hasta } });
  }

  async actualizarContrasena(cuentaId: string, hash: string): Promise<void> {
    await this.tx.credencial.update({ where: { cuentaId }, data: { hashContrasena: hash } });
  }

  async crearSesion(s: { id: string; cuentaId: string; hash: Buffer; dispositivo: string; segundoFactorOk: boolean; expiraEn: Date; ahora: Date }) {
    await this.tx.sesion.create({
      data: {
        id: s.id,
        cuentaId: s.cuentaId,
        hashToken: bytes(s.hash),
        dispositivo: s.dispositivo,
        segundoFactorOk: s.segundoFactorOk,
        expiraEn: s.expiraEn,
        creadaEn: s.ahora,
        ultimaActividadEn: s.ahora,
      },
    });
  }

  async sesionPorHash(hash: Buffer, ahora: Date): Promise<SesionConCuenta | null> {
    const s = await this.tx.sesion.findUnique({
      where: { hashToken: bytes(hash) },
      include: {
        cuenta: {
          include: {
            roles: { where: { revocadoEn: null }, select: { rol: true, alcanceTipo: true, alcanceValor: true } },
            acreditaciones: { where: { tipo: 'estudiante', vigenteHasta: { gt: ahora } }, select: { id: true }, take: 1 },
          },
        },
      },
    });
    if (!s) return null;
    const c = s.cuenta;
    return {
      ...aSesion(s),
      cuenta: {
        id: c.id,
        nombre: c.nombre,
        correo: c.correo,
        estado: c.estado,
        verificadaEn: c.verificadaEn,
        esPersonal: c.esPersonal,
        preferencias: { novedades: (c.preferencias as { novedades?: boolean } | null)?.novedades === true },
      },
      roles: c.roles.map(aRol),
      estudianteAcreditado: c.acreditaciones.length > 0,
    };
  }

  async renovarSesion(id: string, ahora: Date, expiraEn: Date): Promise<void> {
    await this.tx.sesion.updateMany({ where: { id, revocadaEn: null }, data: { ultimaActividadEn: ahora, expiraEn } });
  }

  async revocarSesion(id: string, cuentaId: string, ahora: Date): Promise<boolean> {
    const { count } = await this.tx.sesion.updateMany({ where: { id, cuentaId, revocadaEn: null }, data: { revocadaEn: ahora } });
    return count > 0;
  }

  async revocarSesionesDe(cuentaId: string, ahora: Date, excepto?: string): Promise<number> {
    const { count } = await this.tx.sesion.updateMany({
      where: { cuentaId, revocadaEn: null, ...(excepto ? { id: { not: excepto } } : {}) },
      data: { revocadaEn: ahora },
    });
    return count;
  }

  async sesionesActivas(cuentaId: string, ahora: Date): Promise<SesionVista[]> {
    const filas = await this.tx.sesion.findMany({ where: { cuentaId, revocadaEn: null, expiraEn: { gt: ahora } }, orderBy: { ultimaActividadEn: 'desc' } });
    return filas.map(aSesion);
  }

  async versionAceptada(cuentaId: string, documento: DocumentoLegalTipo): Promise<number | null> {
    const c = await this.tx.consentimiento.findFirst({ where: { cuentaId, documento, retiradoEn: null }, orderBy: { aceptadoEn: 'desc' } });
    return c?.version ?? null;
  }

  async actualizarNombre(cuentaId: string, nombre: string): Promise<void> {
    await this.tx.cuenta.update({ where: { id: cuentaId }, data: { nombre } });
  }

  async cambiarNovedades(cuentaId: string, acepta: boolean, version: number, ahora: Date): Promise<void> {
    if (acepta) await this.tx.consentimiento.create({ data: { id: randomUUID(), cuentaId, documento: 'novedades', version, aceptadoEn: ahora } });
    else await this.tx.consentimiento.updateMany({ where: { cuentaId, documento: 'novedades', retiradoEn: null }, data: { retiradoEn: ahora } });
    await this.tx.cuenta.update({ where: { id: cuentaId }, data: { preferencias: { novedades: acepta } } });
  }

  async segundoFactor(cuentaId: string): Promise<SegundoFactorGuardado | null> {
    const c = await this.tx.credencial.findUnique({ where: { cuentaId }, select: { totpSecretoCifrado: true, totpActivo: true, totpUltimoPaso: true } });
    if (!c) return null;
    return {
      secretoCifrado: c.totpSecretoCifrado ? Buffer.from(c.totpSecretoCifrado) : null,
      activo: c.totpActivo,
      ultimoPaso: c.totpUltimoPaso === null ? null : Number(c.totpUltimoPaso),
    };
  }

  async guardarSecretoPendiente(cuentaId: string, cifrado: Buffer): Promise<void> {
    await this.tx.credencial.update({ where: { cuentaId }, data: { totpSecretoCifrado: bytes(cifrado), totpActivo: false, totpUltimoPaso: null } });
  }

  async usarPasoTotp(cuentaId: string, paso: number): Promise<boolean> {
    const { count } = await this.tx.credencial.updateMany({
      where: { cuentaId, totpSecretoCifrado: { not: null }, OR: [{ totpUltimoPaso: null }, { totpUltimoPaso: { lt: BigInt(paso) } }] },
      data: { totpActivo: true, totpUltimoPaso: BigInt(paso) },
    });
    return count > 0;
  }

  async marcarSegundoFactorOk(sesionId: string): Promise<void> {
    await this.tx.sesion.update({ where: { id: sesionId }, data: { segundoFactorOk: true } });
  }

  async restablecerSegundoFactor(cuentaId: string): Promise<void> {
    await this.tx.credencial.update({ where: { cuentaId }, data: { totpSecretoCifrado: null, totpActivo: false, totpUltimoPaso: null } });
  }

  async rolesVigentes(cuentaId: string): Promise<RolVista[]> {
    const filas = await this.tx.rolAsignado.findMany({ where: { cuentaId, revocadoEn: null }, orderBy: { asignadoEn: 'asc' }, select: { rol: true, alcanceTipo: true, alcanceValor: true } });
    return filas.map(aRol);
  }

  async asignarRol(cuentaId: string, r: RolVista, asignadoPor: string, ahora: Date): Promise<void> {
    await this.tx.rolAsignado.create({
      data: { id: randomUUID(), cuentaId, rol: r.rol, alcanceTipo: r.alcance?.tipo ?? null, alcanceValor: r.alcance?.valor ?? null, asignadoPor, asignadoEn: ahora },
    });
  }

  async revocarRol(cuentaId: string, r: RolVista, ahora: Date): Promise<void> {
    await this.tx.rolAsignado.updateMany({
      where: { cuentaId, rol: r.rol, alcanceValor: r.alcance?.valor ?? null, revocadoEn: null },
      data: { revocadoEn: ahora },
    });
  }

  async marcarPersonal(cuentaId: string, esPersonal: boolean): Promise<void> {
    await this.tx.cuenta.update({ where: { id: cuentaId }, data: { esPersonal } });
  }

  async cambiarEstado(cuentaId: string, estado: 'verificada' | 'desactivada'): Promise<void> {
    await this.tx.cuenta.update({ where: { id: cuentaId }, data: { estado, ...(estado === 'verificada' ? { bloqueadaHasta: null } : {}) } });
  }

  async listarPersonal(): Promise<CuentaPersonal[]> {
    const filas = await this.tx.cuenta.findMany({ where: { esPersonal: true, estado: { not: 'eliminada' } }, include: incluirPersonal, orderBy: { nombre: 'asc' } });
    return filas.map(aPersonal);
  }

  async cuentaPersonal(cuentaId: string): Promise<CuentaPersonal | null> {
    const c = await this.tx.cuenta.findFirst({ where: { id: cuentaId, estado: { not: 'eliminada' } }, include: incluirPersonal });
    return c ? aPersonal(c) : null;
  }

  async contacto(cuentaId: string) {
    const c = await this.tx.cuenta.findFirst({
      where: { id: cuentaId, estado: { in: ['pendiente_verificacion', 'verificada'] } },
      select: { correo: true, nombre: true, preferencias: true },
    });
    return c ? { correo: c.correo, nombre: c.nombre, novedades: (c.preferencias as { novedades?: boolean } | null)?.novedades === true } : null;
  }

  async crearNotificacion(n: NuevaNotificacion): Promise<string | null> {
    const { count } = await this.tx.notificacion.createMany({
      data: [{ ...n, datos: n.datos as Prisma.InputJsonValue }],
      skipDuplicates: true,
    });
    return count > 0 ? n.id : null;
  }

  async notificacion(id: string): Promise<NotificacionGuardada | null> {
    const n = await this.tx.notificacion.findUnique({ where: { id } });
    return n ? aNotificacion(n) : null;
  }

  async marcarEnviada(id: string, ahora: Date, datos: Record<string, unknown>): Promise<void> {
    await this.tx.notificacion.updateMany({
      where: { id, estado: 'pendiente' },
      data: { estado: 'enviada', enviadaEn: ahora, intentos: { increment: 1 }, ultimoError: null, datos: datos as Prisma.InputJsonValue },
    });
  }

  async registrarFalloEnvio(id: string, error: string): Promise<void> {
    await this.tx.notificacion.updateMany({ where: { id, estado: 'pendiente' }, data: { intentos: { increment: 1 }, ultimoError: error } });
  }

  async marcarFallida(id: string, error: string): Promise<void> {
    await this.tx.notificacion.updateMany({ where: { id, estado: 'pendiente' }, data: { estado: 'fallida', ultimoError: error } });
  }

  async notificacionesDe(cuentaId: string, antesDe: Date | null, limite: number): Promise<NotificacionGuardada[]> {
    const filas = await this.tx.notificacion.findMany({
      where: { cuentaId, ...(antesDe ? { creadaEn: { lt: antesDe } } : {}) },
      orderBy: { creadaEn: 'desc' },
      take: limite,
    });
    return filas.map(aNotificacion);
  }

  async notificacionesFallidas(limite: number): Promise<NotificacionGuardada[]> {
    const filas = await this.tx.notificacion.findMany({ where: { estado: 'fallida' }, orderBy: { creadaEn: 'desc' }, take: limite });
    return filas.map(aNotificacion);
  }

  async guardarFuncionAviso(f: FuncionAviso): Promise<void> {
    // Inserta o actualiza solo con una versión mayor, en una sola sentencia (eventos en paralelo).
    await this.tx.$executeRaw`
      INSERT INTO identidad.funcion_aviso (funcion_id, titulo, sede_nombre, inicio, fin, estado, version)
      VALUES (${f.funcionId}::uuid, ${f.titulo}, ${f.sedeNombre}, ${f.inicio}, ${f.fin}, ${f.estado}, ${f.version})
      ON CONFLICT (funcion_id) DO UPDATE SET titulo = EXCLUDED.titulo, sede_nombre = EXCLUDED.sede_nombre,
        inicio = EXCLUDED.inicio, fin = EXCLUDED.fin, estado = EXCLUDED.estado, version = EXCLUDED.version
      WHERE identidad.funcion_aviso.version < EXCLUDED.version`;
  }

  funcionAviso(funcionId: string): Promise<FuncionAviso | null> {
    return this.tx.funcionAviso.findUnique({ where: { funcionId } });
  }

  async guardarDestinatario(d: { pedidoId: string; funcionId: string; cuentaId: string | null; correo: string | null }): Promise<void> {
    await this.tx.destinatarioFuncion.upsert({ where: { pedidoId: d.pedidoId }, create: { ...d, activo: true }, update: { ...d, activo: true } });
  }

  async desactivarDestinatario(pedidoId: string): Promise<void> {
    await this.tx.destinatarioFuncion.updateMany({ where: { pedidoId }, data: { activo: false } });
  }

  destinatariosActivos(funcionId: string) {
    return this.tx.destinatarioFuncion.findMany({ where: { funcionId, activo: true }, select: { cuentaId: true, correo: true } });
  }

  async guardarPostulacion(postulacionId: string, cuentaId: string, estado: 'enviada' | 'subsanacion' | 'cerrada'): Promise<void> {
    await this.tx.postulacionEnCurso.upsert({ where: { postulacionId }, create: { postulacionId, cuentaId, estado }, update: { estado } });
  }

  async guardarEdicionVigente(edicionId: string, fechaFin: string): Promise<void> {
    const fin = new Date(`${fechaFin}T00:00:00Z`);
    await this.tx.edicionVigente.upsert({ where: { edicionId }, create: { edicionId, fechaFin: fin }, update: { fechaFin: fin } });
  }
}

const aSesion = (s: Prisma.SesionGetPayload<object>): SesionVista => ({
  id: s.id,
  cuentaId: s.cuentaId,
  dispositivo: s.dispositivo,
  segundoFactorOk: s.segundoFactorOk,
  creadaEn: s.creadaEn,
  ultimaActividadEn: s.ultimaActividadEn,
  expiraEn: s.expiraEn,
  revocadaEn: s.revocadaEn,
});

const aRol = (r: { rol: RolVista['rol']; alcanceTipo: 'sede' | 'provincia' | 'disciplina' | null; alcanceValor: string | null }): RolVista => ({
  rol: r.rol,
  alcance: r.alcanceTipo && r.alcanceValor ? { tipo: r.alcanceTipo, valor: r.alcanceValor } : null,
});

const incluirPersonal = {
  roles: { where: { revocadoEn: null }, orderBy: { asignadoEn: 'asc' }, select: { rol: true, alcanceTipo: true, alcanceValor: true } },
  credencial: { select: { totpActivo: true } },
} as const;

const aPersonal = (c: Prisma.CuentaGetPayload<{ include: typeof incluirPersonal }>): CuentaPersonal => ({
  cuentaId: c.id,
  nombre: c.nombre,
  correo: c.correo,
  estado: c.estado,
  esPersonal: c.esPersonal,
  roles: c.roles.map(aRol),
  segundoFactorActivo: c.credencial?.totpActivo === true,
});

const aNotificacion = (n: Prisma.NotificacionGetPayload<object>): NotificacionGuardada => ({
  id: n.id,
  cuentaId: n.cuentaId,
  correoDestino: n.correoDestino,
  plantilla: n.plantilla as NotificacionGuardada['plantilla'],
  categoria: n.categoria,
  eventoOrigenId: n.eventoOrigenId,
  claveDedup: n.claveDedup,
  datos: (n.datos ?? {}) as Record<string, unknown>,
  estado: n.estado,
  intentos: n.intentos,
  ultimoError: n.ultimoError,
  creadaEn: n.creadaEn,
  enviadaEn: n.enviadaEn,
});
