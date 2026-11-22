import { PrismaClient } from '../../apps/api/src/generated/prisma/index.js';
import { AplicarEventoOperacion } from '../../apps/api/src/modules/boleteria/application/eventos/aplicar-evento-operacion';
import { PrismaBoleteriaRepository } from '../../apps/api/src/modules/boleteria/infrastructure/prisma-boleteria.repository';
import { AplicarEvento } from '../../apps/api/src/modules/programacion/application/proyeccion/aplicar-evento';
import { PrismaCarteleraRepository } from '../../apps/api/src/modules/programacion/infrastructure/prisma-cartelera.repository';
import { RevalidadorNext } from '../../apps/api/src/modules/programacion/infrastructure/revalidador-next';
import { eventosEdicion2026 } from './edicion-2026';
import { PrismaIdentidadRepository } from '../../apps/api/src/modules/identidad/infrastructure/prisma-identidad.repository';
import { seedIdentidad } from './identidad';
import { seedOperacion } from './operacion';
import { seedConvocatorias } from './convocatorias';
import { crearAlmacenamientoDocumentos } from '../../apps/api/src/modules/convocatorias/infrastructure/almacenamiento.factory.js';

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

await seedConvocatorias(db, crearAlmacenamientoDocumentos());
console.log('Semilla: Convocatorias 2026, asignaciones y documentos de demostración cargados');

console.log(`Semilla: ${aplicadosCartelera} eventos aplicados a cartelera y ${aplicadosBoleteria} a boletería 2026`);
// Spec 004: esquema `operacion` con la misma edición y los mismos ids (aditivo).
const { funciones } = await seedOperacion(db);
console.log(`Semilla: ${funciones} funciones 2026 y cifras 2025 en operacion`);

// Spec 004 (US10): ficha mínima de cada función 2026 para redactar los avisos de cambios.
// El repositorio solo usa los métodos de PrismaClient que PrismaService hereda.
const repoIdentidad = new PrismaIdentidadRepository(db as unknown as ConstructorParameters<typeof PrismaIdentidadRepository>[0]);
for (const evento of eventosEdicion2026()) {
  if (evento.tipo !== 'FuncionProgramada' && evento.tipo !== 'FuncionActualizada') continue;
  const { funcion, obra, sede } = evento.datos;
  await repoIdentidad.guardarFuncionAviso({
    funcionId: funcion.id, titulo: obra.titulo, sedeNombre: sede.nombre, inicio: new Date(funcion.inicio), fin: new Date(funcion.fin), estado: 'programada', version: funcion.version,
  });
}

// Spec 004: política de privacidad vigente (registro, US7) y, fuera de producción, cuentas de prueba (US9).
const cuentas = await seedIdentidad(db);
console.log(`Semilla: política de privacidad v1 y ${cuentas} cuentas de prueba nuevas en identidad`);

await db.$disconnect();
