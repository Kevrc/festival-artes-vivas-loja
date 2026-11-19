/**
 * Publica un evento de prueba en la cola de la cartelera, como lo harían Operación o Boletería
 * mientras no existan (tasks.md T027). Requiere el worker en marcha para aplicarlo.
 *
 *   pnpm events:emit funcion-cancelada --id <funcionId>
 *   pnpm events:emit funcion-reprogramada --id <funcionId> --inicio 2026-11-14T21:00 --fin 2026-11-14T22:00 [--motivo lluvia]
 *   pnpm events:emit disponibilidad --id <funcionId> --restantes 5 --aforo 300
 */
import { parseArgs } from 'node:util';
import { EventoCartelera, colaDe, ejemplo } from '@fiavl/contracts';
import PgBoss from 'pg-boss';
import { PrismaClient } from '../apps/api/src/generated/prisma/index.js';

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    id: { type: 'string' },
    inicio: { type: 'string' },
    fin: { type: 'string' },
    motivo: { type: 'string', default: 'prueba' },
    restantes: { type: 'string' },
    aforo: { type: 'string' },
  },
});

const tipo = positionals[0];
if (!values.id || !tipo) throw new Error('Uso: pnpm events:emit <tipo> --id <funcionId> [...]');

// Solo para desarrollo: lee la versión actual para simular la que enviaría Operación.
const db = new PrismaClient();
const f = await db.funcionCartelera.findUniqueOrThrow({ where: { id: values.id } });
await db.$disconnect();
const version = f.versionOrigen + 1;
const zona = (local: string) => (/[+-]\d\d:\d\d$|Z$/.test(local) ? local : `${local}:00-05:00`);

const eventos = {
  'funcion-cancelada': () => ejemplo.funcionCancelada(f.edicionId, { funcionId: f.id, version }),
  'funcion-reprogramada': () =>
    ejemplo.funcionReprogramada(f.edicionId, {
      funcionId: f.id,
      version,
      anterior: { inicio: f.inicio.toISOString(), fin: f.fin.toISOString(), sedeId: f.sedeId },
      nuevo: { inicio: zona(values.inicio ?? ''), fin: zona(values.fin ?? ''), sedeId: f.sedeId },
      motivo: values.motivo ?? 'prueba',
    }),
  disponibilidad: () =>
    ejemplo.disponibilidadCambiada(f.edicionId, {
      funcionId: f.id,
      lugaresRestantes: Number(values.restantes),
      aforoHabilitado: Number(values.aforo ?? f.aforoHabilitado ?? 0),
      calculadoEn: new Date().toISOString(),
    }),
} as const;

const crear = eventos[tipo as keyof typeof eventos];
if (!crear) throw new Error(`Tipo desconocido: ${tipo}. Opciones: ${Object.keys(eventos).join(', ')}`);
const evento = EventoCartelera.parse(crear());

const boss = new PgBoss({ connectionString: process.env.DATABASE_URL, schema: 'pgboss' });
await boss.start();
const cola = colaDe('programacion', evento.tipo);
await boss.createQueue(cola);
await boss.send(cola, evento);
await boss.stop({ graceful: true });
console.log(`Publicado ${evento.tipo} (${evento.id}) en ${cola}`);
