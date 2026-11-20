import 'reflect-metadata';
import { createHmac, randomUUID } from 'node:crypto';
import { ejemplo } from '@fiavl/contracts';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { inject } from 'vitest';
import { PrismaClient } from '../../src/generated/prisma/index.js';
import { CancelacionesServicios } from '../../src/modules/boleteria/application/cancelaciones/cancelaciones-servicios';
import {
  ConciliarPagosPendientes,
  ExpirarRetenciones,
} from '../../src/modules/boleteria/application/compras/procesar-webhook';
import { AplicarEventoOperacion } from '../../src/modules/boleteria/application/eventos/aplicar-evento-operacion';
import {
  LLAVES_QR,
  PROVEEDOR_PAGOS,
  RELOJ_BOLETERIA,
} from '../../src/modules/boleteria/application/puertos';
import { LiberarReservasNoValidadas } from '../../src/modules/boleteria/application/reservas/reservas-servicios';
import type { ParLlavesQr } from '../../src/modules/boleteria/domain/firma-qr';
import { SimuladorPagosAdapter } from '../../src/modules/boleteria/infrastructure/pagos-simulador.adapter';
import { PublicadorPgBossBoleteria } from '../../src/modules/boleteria/infrastructure/publicador.pgboss';
import { datosFuncion, edicion2026, limpiar } from '../programacion/fixtures';

export async function crearAppBoleteria(ahoraInicial = new Date('2026-11-14T12:00:00-05:00')) {
  process.env.DATABASE_URL = inject('databaseUrl');
  process.env.LOG_LEVEL = 'silent';
  process.env.BOLETERIA_PGBOSS_DESACTIVADO = 'true';
  process.env.BOLETERIA_PAGOS_PROVEEDOR = 'simulador';

  const { AppModule } = await import('../../src/app.module');
  const { configurarApp } = await import('../../src/configurar-app');

  const relojRef = { ahora: ahoraInicial };
  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(RELOJ_BOLETERIA)
    .useValue(() => relojRef.ahora)
    .compile();

  const app: INestApplication = modulo.createNestApplication({ logger: false });
  configurarApp(app);
  await app.init();

  const db = new PrismaClient({ datasourceUrl: inject('databaseUrl') });
  const aplicar = app.get(AplicarEventoOperacion);
  const publicador = app.get(PublicadorPgBossBoleteria);
  const simulador = app.get<SimuladorPagosAdapter>(PROVEEDOR_PAGOS);
  const llaves = app.get<ParLlavesQr>(LLAVES_QR);

  return {
    app,
    db,
    relojRef,
    aplicar,
    publicador,
    simulador,
    llaves,
    expirarRetenciones: app.get(ExpirarRetenciones),
    conciliarPagos: app.get(ConciliarPagosPendientes),
    liberarReservas: app.get(LiberarReservasNoValidadas),
    cancelaciones: app.get(CancelacionesServicios),
    http: () => request(app.getHttpServer()),
    limpiarTodo: async () => {
      publicador.publicados.length = 0;
      simulador.establecerModo('normal');
      await limpiar(db);
      await db.$executeRawUnsafe(
        'TRUNCATE boleteria.movimiento_caja, boleteria.movimiento_pago, boleteria.ingreso, boleteria.entrada, boleteria.pedido, boleteria.caja, boleteria.inventario_funcion, boleteria.edicion_boleteria, boleteria.auditoria_boleteria, boleteria.evento_procesado CASCADE',
      );
    },
    sembrarFuncion: async (p: {
      edicionId?: string;
      funcionId?: string;
      obraId?: string;
      sedeId?: string;
      titulo?: string;
      sedeNombre?: string;
      inicio?: string;
      fin?: string;
      tipoAcceso?: 'pagada' | 'gratuita_reserva' | 'gratuita_libre' | 'restringida';
      aforoHabilitado?: number | null;
    } = {}) => {
      const edicionId = p.edicionId ?? randomUUID();
      const funcionId = p.funcionId ?? randomUUID();
      const obraId = p.obraId ?? randomUUID();
      const sedeId = p.sedeId ?? randomUUID();
      await aplicar.ejecutar(edicion2026(edicionId));
      await aplicar.ejecutar(
        ejemplo.funcionProgramada(
          edicionId,
          datosFuncion({
            edicionId,
            funcionId,
            obraId,
            sedeId,
            titulo: p.titulo,
            sedeNombre: p.sedeNombre,
            inicio: p.inicio ?? '2026-11-14T20:00:00-05:00',
            fin: p.fin ?? '2026-11-14T21:30:00-05:00',
            tipoAcceso: p.tipoAcceso ?? 'pagada',
            aforoHabilitado: p.aforoHabilitado === undefined ? 50 : p.aforoHabilitado,
          }),
        ),
      );
      return { edicionId, funcionId, obraId, sedeId };
    },
    cerrar: async () => {
      await app.close();
      await db.$disconnect();
    },
  };
}

export function firmarWebhookTest(payload: unknown): string {
  const secreto = process.env.PAYPHONE_WEBHOOK_SECRET ?? 'secreto-webhook-dev';
  return createHmac('sha256', secreto).update(JSON.stringify(payload)).digest('hex');
}
