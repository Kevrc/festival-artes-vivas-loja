import { type Conflicto, type FuncionAgenda, detectarConflictos } from '../../domain/agenda';
import { conflictoAgenda } from '../errores';
import { CruceEnBaseDeDatos, InterbloqueoEnBaseDeDatos, type RepositorioOperacion } from '../puertos';

const DIA = 24 * 60 * 60_000;
/** Reintentos ante un interbloqueo de la base; cada uno vuelve a comprobar los cruces. */
const REINTENTOS = 3;
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Cruces de `candidata` con las funciones activas de su sede y de su elenco (RN-001, FR-003). */
export async function conflictosDe(repo: RepositorioOperacion, candidata: FuncionAgenda): Promise<Conflicto[]> {
  const vecinas = await repo.agendaVecina({
    sedeId: candidata.sedeId,
    elencoId: candidata.elencoId,
    desde: new Date(candidata.inicio.getTime() - DIA), // montaje < 24 h: basta un día alrededor
    hasta: new Date(candidata.fin.getTime() + DIA),
  });
  return detectarConflictos(candidata, vecinas);
}

/**
 * Guarda sin cruces (ADR-0010). En una transacción: bloqueo consultivo de la sede y del elenco
 * (ordena a quienes guardan a la vez), comprobación del dominio y escritura. La restricción EXCLUDE
 * sigue siendo la garantía final; si aun así la base rechaza o se interbloquea, se reintenta con
 * una espera breve y el reintento responde 409 con la función que ganó.
 */
export async function guardarSinCruces<T>(repo: RepositorioOperacion, candidata: FuncionAgenda, guardar: () => Promise<T>): Promise<T> {
  for (let intento = 1; ; intento++) {
    try {
      return await repo.enTransaccion(async () => {
        await repo.bloquearAgenda([`sede:${candidata.sedeId}`, `elenco:${candidata.elencoId}`]);
        const conflictos = await conflictosDe(repo, candidata);
        if (conflictos.length > 0) throw conflictoAgenda(conflictos);
        return guardar();
      });
    } catch (e) {
      if (!(e instanceof InterbloqueoEnBaseDeDatos || e instanceof CruceEnBaseDeDatos)) throw e;
      if (intento < REINTENTOS) {
        await esperar(20 + Math.random() * 80 * intento);
        continue;
      }
      throw conflictoAgenda(await conflictosDe(repo, candidata));
    }
  }
}
