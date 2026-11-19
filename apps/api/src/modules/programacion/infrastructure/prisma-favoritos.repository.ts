import type { Prisma, PrismaClient } from '../../../generated/prisma/index.js';

const VISIBLE = { edicion: { estado: { in: ['publicada', 'cerrada'] } } } satisfies Prisma.FuncionCarteleraWhereInput;

/** Favoritos de una cuenta (data-model.md Favorito): única escritura propia del usuario. */
export class PrismaFavoritosRepository {
  constructor(private readonly db: PrismaClient) {}

  async listar(cuentaId: string): Promise<string[]> {
    const filas = await this.db.favorito.findMany({ where: { cuentaId }, orderBy: { creadoEn: 'asc' } });
    return filas.map((f) => f.funcionId);
  }

  /** false si la función no existe o no es visible. */
  async marcar(cuentaId: string, funcionId: string): Promise<boolean> {
    if (!(await this.db.funcionCartelera.count({ where: { id: funcionId, ...VISIBLE } }))) return false;
    await this.db.favorito.createMany({ data: [{ cuentaId, funcionId }], skipDuplicates: true });
    return true;
  }

  async quitar(cuentaId: string, funcionId: string) {
    await this.db.favorito.deleteMany({ where: { cuentaId, funcionId } });
  }

  /** US5-AS3: une sin duplicar e ignora ids inexistentes. */
  async fusionar(cuentaId: string, funcionIds: string[]): Promise<string[]> {
    const existentes = await this.db.funcionCartelera.findMany({ where: { id: { in: funcionIds }, ...VISIBLE }, select: { id: true } });
    await this.db.favorito.createMany({ data: existentes.map((f) => ({ cuentaId, funcionId: f.id })), skipDuplicates: true });
    return this.listar(cuentaId);
  }
}
