import { colaDe } from '@fiavl/contracts';
import type { ColaEventos } from './datos.module';
import { transaccionActual } from './transaccion';

/**
 * Envía un evento a la cola `<destino>.<tipo>` de cada destino dentro de la transacción ambiente,
 * si la hay (ADR-0003): el cambio y su evento se confirman juntos o ninguno. Falla si la cola no
 * arranca; nunca descarta en silencio. Lo usan los publicadores de Operación e Identidad.
 */
export async function publicarEnCola(
  cola: ColaEventos,
  evento: { id: string; tipo: string },
  destinos: readonly string[],
  opciones: { retrasoSegundos?: number } = {},
): Promise<void> {
  if (!cola.habilitada || destinos.length === 0) return;
  const boss = await cola.obtener();
  const tx = transaccionActual();
  const db = tx && {
    executeSql: async (text: string, values: unknown[]) => ({ rows: await tx.$queryRawUnsafe<unknown[]>(text, ...values) }),
  };
  for (const destino of destinos) {
    const nombre = colaDe(destino, evento.tipo);
    await boss.send(nombre, evento, {
      ...(db ? { db } : {}),
      ...(opciones.retrasoSegundos ? { startAfter: opciones.retrasoSegundos } : {}),
      singletonKey: `${nombre}:${evento.id}`,
      singletonSeconds: 43_200,
    });
  }
}

/** Crea todas las colas de destino al arrancar (en pg-boss 10 cada cola es una partición). */
export async function crearColas(cola: ColaEventos, destinos: Readonly<Record<string, readonly string[]>>): Promise<void> {
  if (!cola.habilitada) return;
  const boss = await cola.obtener();
  const nombres = new Set(Object.entries(destinos).flatMap(([tipo, mods]) => mods.map((m) => colaDe(m, tipo))));
  for (const nombre of nombres) await boss.createQueue(nombre);
}
