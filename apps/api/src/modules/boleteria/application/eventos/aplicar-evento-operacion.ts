import { EventoOperacionBoleteria } from '@fiavl/contracts';
import type {
  PublicadorEventosBoleteria,
  RelojBoleteria,
  RepositorioBoleteria,
} from '../puertos';
import { publicarAforoExcedido, publicarDisponibilidad } from './helpers-eventos';

/** Consume de forma idempotente eventos publicados por Operación (004) hacia Boletería. */
export class AplicarEventoOperacion {
  constructor(
    private readonly repo: RepositorioBoleteria,
    private readonly publicador: PublicadorEventosBoleteria,
    private readonly reloj: RelojBoleteria,
  ) {}

  async ejecutar(eventoBruto: unknown): Promise<{ aplicado: boolean }> {
    const evento = EventoOperacionBoleteria.parse(eventoBruto);
    const ahora = this.reloj();
    const res = await this.repo.aplicarEventoOperacion({
      eventoId: evento.id,
      tipo: evento.tipo,
      edicionId: evento.edicionId,
      datos: evento.datos,
      ahora,
      correlacionId: evento.correlacionId,
    });

    if (res.aplicado && res.funcionAfectada) {
      await publicarDisponibilidad(this.publicador, res.funcionAfectada, ahora, evento.correlacionId);
    }
    if (res.aplicado && res.excesoAforo) {
      await publicarAforoExcedido(this.publicador, {
        ...res.excesoAforo,
        ahora,
        correlacionId: evento.correlacionId,
      });
    }
    return { aplicado: res.aplicado };
  }
}
