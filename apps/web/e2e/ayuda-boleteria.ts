import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { idDe } from './ayuda';

interface SesionDevTest {
  cuentaId: string;
  rol: 'asistente' | 'taquilla' | 'validador' | 'jefe_sala' | 'programador' | 'administrador';
  sedeId?: string;
  estudiante?: boolean;
  correo?: string;
}

interface PrismaBoleteriaE2e {
  entradaBoleteria: {
    deleteMany(args: { where: { funcionId: string | { in: string[] } } }): Promise<unknown>;
  };
  pedidoBoleteria: {
    updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<unknown>;
    deleteMany(args: { where: { funcionId: string | { in: string[] } } }): Promise<unknown>;
  };
  movimientoPago: {
    deleteMany(args: { where: { pedido: { funcionId: string | { in: string[] } } } }): Promise<unknown>;
  };
  movimientoCaja: {
    deleteMany(args: { where: { pedido: { funcionId: string | { in: string[] } } } }): Promise<unknown>;
  };
  ingresoBoleteria: {
    deleteMany(args: { where: { funcionId: string | { in: string[] } } }): Promise<unknown>;
  };
  inventarioFuncion: {
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
    update(args: { where: { funcionId: string }; data: Record<string, unknown> }): Promise<unknown>;
    deleteMany(args: { where: { funcionId: string | { in: string[] } } }): Promise<unknown>;
  };
  $disconnect(): Promise<void>;
}

function leerDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const raizEnv = resolve(process.cwd(), '../../.env');
  const localEnv = resolve(process.cwd(), '.env');
  const ruta = existsSync(raizEnv) ? raizEnv : existsSync(localEnv) ? localEnv : null;
  if (ruta) {
    const linea = readFileSync(ruta, 'utf8')
      .split('\n')
      .find((l) => l.startsWith('DATABASE_URL='));
    if (linea) return linea.slice('DATABASE_URL='.length).trim().replace(/^["']|["']$/g, '');
  }
  return 'postgresql://fiavl:fiavl@localhost:5433/fiavl';
}

export function abrirDbE2e(): PrismaBoleteriaE2e {
  const req = createRequire(import.meta.url);
  const rutaPrisma = resolve(import.meta.dirname, '../..', 'api/src/generated/prisma/index.js');
  const mod = req(rutaPrisma) as { PrismaClient: new (opts: unknown) => PrismaBoleteriaE2e };
  return new mod.PrismaClient({ datasources: { db: { url: leerDatabaseUrl() } } });
}

export async function sembrarFuncionE2e(
  db: PrismaBoleteriaE2e,
  opts: {
    obraId?: string;
    obraTitulo: string;
    sedeId?: string;
    sedeNombre?: string;
    inicio: string;
    fin: string;
    aforoHabilitado?: number;
    tipoAcceso?: 'pagada' | 'gratuita_reserva' | 'gratuita_libre' | 'restringida';
    publico?: 'familiar' | 'adultos' | 'estudiantes';
    precioCentavos?: number;
  },
): Promise<string> {
  const funcionId = randomUUID();
  await db.inventarioFuncion.create({
    data: {
      funcionId,
      edicionId: idDe('edicion-2026'),
      obraId: opts.obraId ?? randomUUID(),
      obraTitulo: opts.obraTitulo,
      sedeId: opts.sedeId ?? idDe('sede:nacional'),
      sedeNombre: opts.sedeNombre ?? 'Teatro Nacional Benjamín Carrión Mora',
      inicio: new Date(opts.inicio),
      fin: new Date(opts.fin),
      tipoAcceso: opts.tipoAcceso ?? 'pagada',
      publico: opts.publico ?? 'familiar',
      estadoFuncion: 'programada',
      precioCentavos: opts.precioCentavos ?? 500,
      maxPorPedido: 6,
      maxPorPersona: opts.tipoAcceso === 'gratuita_reserva' || opts.tipoAcceso === 'restringida' ? 4 : 6,
      aforoHabilitado: opts.aforoHabilitado ?? 20,
      versionOrigen: 1,
    },
  });
  return funcionId;
}

export async function cancelarFuncionE2e(db: PrismaBoleteriaE2e, funcionId: string): Promise<void> {
  await db.inventarioFuncion.update({
    where: { funcionId },
    data: { estadoFuncion: 'cancelada' },
  });
  await db.pedidoBoleteria.updateMany({
    where: { funcionId, canal: 'web', estado: 'pagado' },
    data: {
      resolucionCancelacion: 'pendiente_eleccion',
      plazoEleccionHasta: new Date('2026-11-21T12:00:00-05:00'),
    },
  });
}

export async function limpiarFuncionE2e(db: PrismaBoleteriaE2e, ...funcionIds: string[]): Promise<void> {
  const filtro = { in: funcionIds };
  await db.ingresoBoleteria.deleteMany({ where: { funcionId: filtro } });
  await db.movimientoPago.deleteMany({ where: { pedido: { funcionId: filtro } } });
  await db.movimientoCaja.deleteMany({ where: { pedido: { funcionId: filtro } } });
  await db.entradaBoleteria.deleteMany({ where: { funcionId: filtro } });
  await db.pedidoBoleteria.deleteMany({ where: { funcionId: filtro } });
  await db.inventarioFuncion.deleteMany({ where: { funcionId: filtro } });
}

/** Configura sesión dev aislada antes de navegar (para pruebas paralelas sin colisiones). */
export async function activarSesionDev(page: Page, sesion: SesionDevTest): Promise<void> {
  await page.addInitScript((s) => {
    window.localStorage.setItem('fiavl.sesion_dev', JSON.stringify(s));
    document.cookie = `sesion_dev=${encodeURIComponent(JSON.stringify(s))}; path=/; SameSite=Lax`;
  }, sesion);
}
