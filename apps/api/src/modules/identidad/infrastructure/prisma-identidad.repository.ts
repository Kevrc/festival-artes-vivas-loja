import { randomUUID } from 'node:crypto';
import type { Prisma } from '../../../generated/prisma/index.js';
import { enTransaccion, transaccionActual } from '../../../common/datos/transaccion';
import type { PrismaService } from '../../../common/prisma/prisma.service';
import type { CuentaVista, DocumentoLegal, DocumentoLegalTipo, RepositorioIdentidad, TokenVista } from '../application/puertos';

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

  async guardarEdicionVigente(edicionId: string, fechaFin: string): Promise<void> {
    const fin = new Date(`${fechaFin}T00:00:00Z`);
    await this.tx.edicionVigente.upsert({ where: { edicionId }, create: { edicionId, fechaFin: fin }, update: { fechaFin: fin } });
  }
}
