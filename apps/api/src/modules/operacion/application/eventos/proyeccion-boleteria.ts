import { EntradasEmitidas, IngresoRegistrado, PedidoReembolsado } from '@fiavl/contracts';
import type { z } from 'zod';
import type { ManejadorEvento, RepositorioOperacion } from '../puertos';
import type { ProcesarUnaVez } from './postulacion-seleccionada';

/**
 * Proyección de Boletería en Operación (research R5/R7): entradas activas para el aviso de exceso
 * al reprogramar y métricas para las estadísticas. Se alimenta solo con sus eventos (Constitución
 * III) y es idempotente: por `evento.id`, por `pedido_registrado.pedido_id` y por
 * `ingreso_registrado.ingreso_id`.
 */
type Emitidas = z.infer<typeof EntradasEmitidas>;
type Reembolsado = z.infer<typeof PedidoReembolsado>;
type Ingreso = z.infer<typeof IngresoRegistrado>;

export class AlRecibirEntradasEmitidas implements ManejadorEvento<Emitidas> {
  readonly tipo = 'EntradasEmitidas';
  readonly esquema = EntradasEmitidas;
  constructor(
    private readonly repo: RepositorioOperacion,
    private readonly procesarUnaVez: ProcesarUnaVez,
  ) {}

  async manejar(e: Emitidas): Promise<void> {
    await this.procesarUnaVez(e, async () => {
      const d = e.datos;
      const nuevo = await this.repo.registrarPedido({ pedidoId: d.pedidoId, funcionId: d.funcionId, tipo: d.tipo, canal: d.canal, cantidad: d.cantidad, importeCentavos: d.importeCentavos });
      if (!nuevo) return;
      await this.repo.sumarMetrica(d.funcionId, { emitidas: d.cantidad, recaudacionCentavos: d.tipo === 'compra' ? d.importeCentavos : 0 });
    });
  }
}

export class AlRecibirPedidoReembolsado implements ManejadorEvento<Reembolsado> {
  readonly tipo = 'PedidoReembolsado';
  readonly esquema = PedidoReembolsado;
  constructor(
    private readonly repo: RepositorioOperacion,
    private readonly procesarUnaVez: ProcesarUnaVez,
  ) {}

  /** Un reembolso de un pedido que nunca emitió entradas (pago tardío sin cupo) no resta nada. */
  async manejar(e: Reembolsado): Promise<void> {
    await this.procesarUnaVez(e, async () => {
      const pedido = await this.repo.reembolsarPedido(e.datos.pedidoId);
      if (!pedido) return;
      await this.repo.sumarMetrica(pedido.funcionId, { reembolsadas: pedido.cantidad, recaudacionCentavos: pedido.tipo === 'compra' ? -pedido.importeCentavos : 0 });
    });
  }
}

export class AlRecibirIngresoRegistrado implements ManejadorEvento<Ingreso> {
  readonly tipo = 'IngresoRegistrado';
  readonly esquema = IngresoRegistrado;
  constructor(
    private readonly repo: RepositorioOperacion,
    private readonly procesarUnaVez: ProcesarUnaVez,
  ) {}

  async manejar(e: Ingreso): Promise<void> {
    await this.procesarUnaVez(e, async () => {
      const nuevo = await this.repo.registrarIngreso({ ingresoId: e.datos.ingresoId, funcionId: e.datos.funcionId, escaneadoEn: new Date(e.datos.escaneadoEn) });
      if (nuevo) await this.repo.sumarMetrica(e.datos.funcionId, { ingresos: 1 });
    });
  }
}
