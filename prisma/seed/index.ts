import { PrismaClient } from '../../apps/api/src/generated/prisma/index.js';
import { AplicarEventoOperacion } from '../../apps/api/src/modules/boleteria/application/eventos/aplicar-evento-operacion';
import { PrismaBoleteriaRepository } from '../../apps/api/src/modules/boleteria/infrastructure/prisma-boleteria.repository';
import { AplicarEvento } from '../../apps/api/src/modules/programacion/application/proyeccion/aplicar-evento';
import { PrismaCarteleraRepository } from '../../apps/api/src/modules/programacion/infrastructure/prisma-cartelera.repository';
import { RevalidadorNext } from '../../apps/api/src/modules/programacion/infrastructure/revalidador-next';
import { eventosEdicion2026 } from './edicion-2026';

// Siembra las proyecciones de Cartelera y Boletería por el mismo camino que los eventos reales, sin la cola.
const db = new PrismaClient();
const aplicarCartelera = new AplicarEvento(new PrismaCarteleraRepository(db), new RevalidadorNext());
const aplicarBoleteria = new AplicarEventoOperacion(
  new PrismaBoleteriaRepository(db),
  { publicar: async () => undefined },
  () => new Date(),
);

let aplicadosCartelera = 0;
let aplicadosBoleteria = 0;

for (const evento of eventosEdicion2026()) {
  if ((await aplicarCartelera.ejecutar(evento)).aplicado) aplicadosCartelera++;
  if (evento.tipo !== 'DisponibilidadCambiada') {
    if ((await aplicarBoleteria.ejecutar(evento)).aplicado) aplicadosBoleteria++;
  }
}

console.log(`Semilla: ${aplicadosCartelera} eventos aplicados a cartelera y ${aplicadosBoleteria} a boletería 2026`);
await db.$disconnect();
