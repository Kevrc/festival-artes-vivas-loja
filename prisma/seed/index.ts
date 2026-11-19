import { AplicarEvento } from '../../apps/api/src/modules/programacion/application/proyeccion/aplicar-evento';
import { PrismaCarteleraRepository } from '../../apps/api/src/modules/programacion/infrastructure/prisma-cartelera.repository';
import { RevalidadorNext } from '../../apps/api/src/modules/programacion/infrastructure/revalidador-next';
import { PrismaClient } from '../../apps/api/src/generated/prisma/index.js';
import { eventosEdicion2026 } from './edicion-2026';

// Siembra la proyección por el mismo camino que los eventos reales (AplicarEvento), sin la cola.
const db = new PrismaClient();
const aplicar = new AplicarEvento(new PrismaCarteleraRepository(db), new RevalidadorNext());
let aplicados = 0;
for (const evento of eventosEdicion2026()) {
  if ((await aplicar.ejecutar(evento)).aplicado) aplicados++;
}
console.log(`Semilla: ${aplicados} eventos aplicados a la cartelera 2026`);
await db.$disconnect();
