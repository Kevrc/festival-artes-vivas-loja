import type { PrismaClient } from '../../../generated/prisma/index.js';
import { enTransaccion } from '../../../common/datos/transaccion';
import type { RepositorioConvocatoriasPort } from '../application/puertos';

export class PrismaConvocatoriasRepository implements RepositorioConvocatoriasPort {
  constructor(private readonly db: PrismaClient) {}

  ejecutar<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
    return enTransaccion(this.db, (tx) => fn(tx));
  }

  async obtenerPostulacion(id: string): Promise<{ id: string; cuentaPropietariaId: string } | null> {
    const postulacion = await this.db.postulacion.findUnique({
      where: { id }, select: { id: true, elenco: { select: { cuentaId: true } } },
    });
    return postulacion ? { id: postulacion.id, cuentaPropietariaId: postulacion.elenco.cuentaId } : null;
  }

  async registrarAuditoria(input: {
    id: string; postulacionId: string; actorCuentaId?: string | null; accion: string;
    estadoAnterior?: string | null; estadoNuevo?: string | null; motivo?: string | null; correlacionId?: string | null;
  }): Promise<void> {
    await this.db.auditoria.create({ data: input });
  }
}
