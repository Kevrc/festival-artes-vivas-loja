import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { enTransaccion, transaccionActual } from '../../../common/datos/transaccion';
import type { Prisma, PrismaClient } from '../../../generated/prisma/index.js';
import type {
  AuditoriaInput,
  CajaRegistro,
  EntradaDevolucionTaquilla,
  EntradaPaqueteItem,
  EntradaParaValidacion,
  EntradaRegistro,
  FuncionConEdicion,
  PedidoRegistro,
  RepositorioBoleteria,
} from '../application/puertos';
import { calcularArqueoCaja } from '../domain/arqueo-caja';
import { type ParLlavesQr, firmarTokenQr, generarCodigoCorto, normalizarCodigoCorto } from '../domain/firma-qr';
import { ventaEnLineaHabilitada } from '../domain/reglas-acceso';
import {
  calcularDisponibilidad,
  calcularExcesoAforo,
  calcularImporteCentavos,
  puedeComprarPorCanal,
  validarLimitesCompra,
} from '../domain/reglas-aforo';
import type {
  CanalPedido,
  EstadoCaja,
  EstadoEdicion,
  EstadoEntrada,
  EstadoFuncion,
  EstadoPedido,
  MedioPagoTaquilla,
  PublicoObjetivo,
  ResolucionCancelacion,
  TipoAcceso,
  TipoMovimientoCaja,
  TipoPedido,
} from '../domain/tipos';

type DbCliente = PrismaClient | Prisma.TransactionClient;

const SIETE_DIAS_MS = 7 * 24 * 60 * 60_000;
const DIEZ_MINUTOS_MS = 10 * 60_000;

@Injectable()
export class PrismaBoleteriaRepository implements RepositorioBoleteria {
  constructor(private readonly base: PrismaClient) {}

  /** Cliente en la transacción ambiente si hay una; así lecturas y escrituras van juntas (auditoría #1). */
  private get db(): PrismaClient {
    return (transaccionActual() as PrismaClient | undefined) ?? this.base;
  }

  async obtenerFuncionConEdicion(funcionId: string): Promise<FuncionConEdicion | null> {
    const row = await this.db.inventarioFuncion.findUnique({
      where: { funcionId },
      include: { edicion: true },
    });
    return row ? mapFuncion(row) : null;
  }

  async obtenerPedidoPorId(pedidoId: string): Promise<PedidoRegistro | null> {
    const row = await this.db.pedidoBoleteria.findUnique({
      where: { id: pedidoId },
      include: { funcion: true, entradas: { orderBy: { emitidaEn: 'asc' } } },
    });
    return row ? mapPedido(row) : null;
  }

  async obtenerPedidoPorClave(claveIdempotencia: string): Promise<PedidoRegistro | null> {
    const row = await this.db.pedidoBoleteria.findUnique({
      where: { claveIdempotencia },
      include: { funcion: true, entradas: { orderBy: { emitidaEn: 'asc' } } },
    });
    return row ? mapPedido(row) : null;
  }

  async listarPedidosPorCuenta(cuentaId: string): Promise<PedidoRegistro[]> {
    const rows = await this.db.pedidoBoleteria.findMany({
      where: { cuentaId },
      include: { funcion: true, entradas: { orderBy: { emitidaEn: 'asc' } } },
      orderBy: { creadoEn: 'desc' },
    });
    return rows.map(mapPedido);
  }

  async retenerParaPedidoPagado(p: {
    funcionId: string;
    cuentaId: string;
    correoComprador?: string;
    cantidad: number;
    claveIdempotencia: string;
    ahora: Date;
    venceEn: Date;
    estudianteAcreditado: boolean;
    correlacionId: string;
  }) {
    return enTransaccion(this.base, async (tx) => {
      const existente = await tx.pedidoBoleteria.findUnique({
        where: { claveIdempotencia: p.claveIdempotencia },
        include: { funcion: { include: { edicion: true } }, entradas: true },
      });
      if (existente) {
        if (
          existente.funcionId !== p.funcionId ||
          existente.cantidad !== p.cantidad ||
          existente.cuentaId !== p.cuentaId ||
          existente.tipo !== 'compra'
        ) {
          return { ok: false as const, motivo: 'conflicto_idempotencia' as const, detalle: 'La clave de idempotencia ya se usó con otros parámetros.' };
        }
        return {
          ok: true as const,
          pedido: mapPedido(existente),
          inventarioActualizado: mapFuncion(existente.funcion),
          idempotente: true,
        };
      }

      const fnRow = await tx.inventarioFuncion.findUnique({
        where: { funcionId: p.funcionId },
        include: { edicion: true },
      });
      if (!fnRow) return { ok: false as const, motivo: 'no_encontrada' as const, detalle: 'Función no encontrada.' };
      const fn = mapFuncion(fnRow);

      if (fn.tipoAcceso !== 'pagada') {
        return { ok: false as const, motivo: 'venta_cerrada' as const, detalle: 'Esta función no admite compra pagada.' };
      }
      if (
        !ventaEnLineaHabilitada({
          inicio: fn.inicio,
          ahora: p.ahora,
          estadoFuncion: fn.estadoFuncion,
          estadoEdicion: fn.estadoEdicion,
        })
      ) {
        return { ok: false as const, motivo: 'venta_cerrada' as const, detalle: 'La venta en línea para esta función está cerrada.' };
      }
      if (!puedeComprarPorCanal({ tipoAcceso: fn.tipoAcceso, canal: 'web', estudianteAcreditado: p.estudianteAcreditado })) {
        return { ok: false as const, motivo: 'restringida' as const, detalle: 'Función restringida: requiere acreditación de estudiante.' };
      }

      await bloquearCuentaFuncion(tx, p.cuentaId, p.funcionId);
      const acumulado = await contarAcumuladoCuenta(tx, p.cuentaId, p.funcionId);
      const lim = validarLimitesCompra({
        cantidadSolicitada: p.cantidad,
        acumuladoPersona: acumulado,
        maxPorPedido: fn.maxPorPedido,
        maxPorPersona: fn.maxPorPersona,
      });
      if (!lim.valido) return { ok: false as const, motivo: 'limite' as const, detalle: lim.motivo };

      const actualizados = await tx.$queryRaw<Array<{ retenidos: number; emitidos: number; aforo_habilitado: number }>>`
        UPDATE "boleteria"."inventario_funcion"
        SET "retenidos" = "retenidos" + ${p.cantidad}, "actualizado_en" = NOW()
        WHERE "funcion_id" = ${p.funcionId}::uuid
          AND "estado_funcion" IN ('programada', 'reprogramada')
          AND "aforo_habilitado" - "emitidos" - "retenidos" >= ${p.cantidad}
        RETURNING "retenidos", "emitidos", "aforo_habilitado"
      `;
      if (actualizados.length === 0) {
        const disponibles = calcularDisponibilidad({
          aforoHabilitado: fn.aforoHabilitado,
          emitidos: fn.emitidos,
          retenidos: fn.retenidos,
        });
        const detalle = disponibles === 0 ? 'Agotado: no quedan lugares disponibles.' : `Solo quedan ${disponibles} lugares disponibles.`;
        return { ok: false as const, motivo: 'cupo' as const, detalle, disponibles };
      }

      const inv = actualizados[0]!;
      const importe = calcularImporteCentavos(p.cantidad, fn.precioCentavos);
      const creado = await tx.pedidoBoleteria.create({
        data: {
          id: randomUUID(),
          funcionId: p.funcionId,
          cuentaId: p.cuentaId,
          correoComprador: p.correoComprador ?? null,
          canal: 'web',
          tipo: 'compra',
          cantidad: p.cantidad,
          precioUnitarioCentavos: fn.precioCentavos,
          importeCentavos: importe,
          estado: 'pendiente',
          claveIdempotencia: p.claveIdempotencia,
          venceEn: p.venceEn,
          creadoEn: p.ahora,
        },
        include: { funcion: { include: { edicion: true } }, entradas: true },
      });

      return {
        ok: true as const,
        pedido: mapPedido(creado),
        inventarioActualizado: {
          ...fn,
          retenidos: inv.retenidos,
          emitidos: inv.emitidos,
          aforoHabilitado: inv.aforo_habilitado,
        },
        idempotente: false,
      };
    });
  }

  async registrarIntencionPago(p: {
    pedidoId: string;
    proveedor: string;
    referenciaIntencion: string;
    importeCentavos: number;
  }) {
    await this.db.movimientoPago.create({
      data: {
        id: randomUUID(),
        pedidoId: p.pedidoId,
        tipo: 'intencion',
        proveedor: p.proveedor,
        referenciaProveedor: p.referenciaIntencion,
        importeCentavos: p.importeCentavos,
        estado: 'iniciado',
      },
    });
  }

  async liberarPorFallaInicioPago(p: { pedidoId: string; proveedor: string; detalle: string }): Promise<FuncionConEdicion | null> {
    return enTransaccion(this.base, async (tx) => {
      const pedido = await tx.pedidoBoleteria.findUnique({ where: { id: p.pedidoId } });
      if (!pedido || pedido.estado !== 'pendiente') return null;

      await tx.pedidoBoleteria.update({
        where: { id: p.pedidoId },
        data: { estado: 'fallido', venceEn: null },
      });
      await tx.$executeRaw`
        UPDATE "boleteria"."inventario_funcion"
        SET "retenidos" = GREATEST(0, "retenidos" - ${pedido.cantidad}), "actualizado_en" = NOW()
        WHERE "funcion_id" = ${pedido.funcionId}::uuid
      `;
      await tx.movimientoPago.create({
        data: {
          id: randomUUID(),
          pedidoId: p.pedidoId,
          tipo: 'rechazo',
          proveedor: p.proveedor,
          referenciaProveedor: null,
          importeCentavos: pedido.importeCentavos,
          estado: 'error',
          detalle: { motivo: p.detalle },
        },
      });
      const fn = await tx.inventarioFuncion.findUnique({ where: { funcionId: pedido.funcionId }, include: { edicion: true } });
      return fn ? mapFuncion(fn) : null;
    });
  }

  async procesarResultadoPago(p: {
    pedidoId: string;
    proveedor: string;
    referenciaProveedor: string;
    resultado: 'aprobado' | 'rechazado';
    importeCentavos: number;
    ahora: Date;
    llaves: ParLlavesQr;
    correlacionId: string;
  }) {
    return enTransaccion(this.base, async (tx) => {
      // Bloquea el pedido: la expiración (FOR UPDATE SKIP LOCKED) y otro webhook esperan o lo saltan,
      // así los lugares retenidos nunca se descuentan dos veces (Constitución V, revisión PR #6).
      await tx.$queryRaw`SELECT "id" FROM "boleteria"."pedido" WHERE "id" = ${p.pedidoId}::uuid FOR UPDATE`;
      const pedido = await tx.pedidoBoleteria.findUnique({
        where: { id: p.pedidoId },
        include: { funcion: { include: { edicion: true } }, entradas: { orderBy: { emitidaEn: 'asc' } } },
      });
      if (!pedido) return { accion: 'no_encontrado' as const, pedido: null };

      const tipoMov = p.resultado === 'aprobado' ? 'cobro' : 'rechazo';
      const movExistente = await tx.movimientoPago.findFirst({
        where: { proveedor: p.proveedor, referenciaProveedor: p.referenciaProveedor, tipo: tipoMov },
      });
      if (movExistente) {
        return { accion: 'ya_procesado' as const, pedido: mapPedido(pedido), inventario: mapFuncion(pedido.funcion) };
      }

      if (p.resultado === 'rechazado') {
        if (pedido.estado === 'pendiente') {
          await tx.$executeRaw`
            UPDATE "boleteria"."inventario_funcion"
            SET "retenidos" = GREATEST(0, "retenidos" - ${pedido.cantidad}), "actualizado_en" = NOW()
            WHERE "funcion_id" = ${pedido.funcionId}::uuid
          `;
          const act = await tx.pedidoBoleteria.update({
            where: { id: pedido.id },
            data: { estado: 'fallido', venceEn: null },
            include: { funcion: { include: { edicion: true } }, entradas: true },
          });
          await tx.movimientoPago.create({
            data: {
              id: randomUUID(),
              pedidoId: pedido.id,
              tipo: 'rechazo',
              proveedor: p.proveedor,
              referenciaProveedor: p.referenciaProveedor,
              importeCentavos: p.importeCentavos,
              estado: 'rechazado',
            },
          });
          return { accion: 'rechazado' as const, pedido: mapPedido(act), inventario: mapFuncion(act.funcion) };
        }
        await tx.movimientoPago.create({
          data: {
            id: randomUUID(),
            pedidoId: pedido.id,
            tipo: 'rechazo',
            proveedor: p.proveedor,
            referenciaProveedor: p.referenciaProveedor,
            importeCentavos: p.importeCentavos,
            estado: 'rechazado',
          },
        });
        return { accion: 'ya_procesado' as const, pedido: mapPedido(pedido), inventario: mapFuncion(pedido.funcion) };
      }

      // Resultado aprobado
      if (pedido.estado === 'pagado' || pedido.estado === 'reembolsado') {
        return { accion: 'ya_procesado' as const, pedido: mapPedido(pedido), inventario: mapFuncion(pedido.funcion) };
      }

      if (pedido.estado === 'pendiente') {
        await tx.$executeRaw`
          UPDATE "boleteria"."inventario_funcion"
          SET "retenidos" = GREATEST(0, "retenidos" - ${pedido.cantidad}),
              "emitidos" = "emitidos" + ${pedido.cantidad},
              "actualizado_en" = NOW()
          WHERE "funcion_id" = ${pedido.funcionId}::uuid
        `;
        await tx.movimientoPago.create({
          data: {
            id: randomUUID(),
            pedidoId: pedido.id,
            tipo: 'cobro',
            proveedor: p.proveedor,
            referenciaProveedor: p.referenciaProveedor,
            importeCentavos: p.importeCentavos,
            estado: 'aprobado',
          },
        });
        await generarEntradasEnTx(tx, {
          pedidoId: pedido.id,
          funcionId: pedido.funcionId,
          cantidad: pedido.cantidad,
          ahora: p.ahora,
          llaves: p.llaves,
        });
        const act = await tx.pedidoBoleteria.update({
          where: { id: pedido.id },
          data: { estado: 'pagado', venceEn: null },
          include: { funcion: { include: { edicion: true } }, entradas: { orderBy: { emitidaEn: 'asc' } } },
        });
        return { accion: 'pagado' as const, pedido: mapPedido(act), inventario: mapFuncion(act.funcion) };
      }

      // US1-AS6: Confirmación tardía sobre pedido ya expirado (o fallido)
      await tx.movimientoPago.create({
        data: {
          id: randomUUID(),
          pedidoId: pedido.id,
          tipo: 'cobro',
          proveedor: p.proveedor,
          referenciaProveedor: p.referenciaProveedor,
          importeCentavos: p.importeCentavos,
          estado: 'aprobado',
          detalle: { tardioSobreEstado: pedido.estado },
        },
      });

      const cupoTardio = await tx.$queryRaw<Array<{ funcion_id: string }>>`
        UPDATE "boleteria"."inventario_funcion"
        SET "emitidos" = "emitidos" + ${pedido.cantidad}, "actualizado_en" = NOW()
        WHERE "funcion_id" = ${pedido.funcionId}::uuid
          AND "estado_funcion" IN ('programada', 'reprogramada')
          AND "aforo_habilitado" - "emitidos" - "retenidos" >= ${pedido.cantidad}
        RETURNING "funcion_id"
      `;

      if (cupoTardio.length > 0) {
        await generarEntradasEnTx(tx, {
          pedidoId: pedido.id,
          funcionId: pedido.funcionId,
          cantidad: pedido.cantidad,
          ahora: p.ahora,
          llaves: p.llaves,
        });
        const act = await tx.pedidoBoleteria.update({
          where: { id: pedido.id },
          data: { estado: 'pagado', venceEn: null },
          include: { funcion: { include: { edicion: true } }, entradas: { orderBy: { emitidaEn: 'asc' } } },
        });
        return { accion: 'tardio_pagado' as const, pedido: mapPedido(act), inventario: mapFuncion(act.funcion) };
      }

      return { accion: 'tardio_requiere_reembolso' as const, pedido: mapPedido(pedido), inventario: mapFuncion(pedido.funcion) };
    });
  }

  async registrarReembolsoConfirmado(p: {
    pedidoId: string;
    proveedor: string;
    referenciaDevolucion: string;
    importeCentavos: number;
    motivo: 'funcion_cancelada' | 'funcion_reprogramada' | 'pago_tardio_sin_cupo' | 'plazo_7_dias_vencido';
    correlacionId: string;
    actorId?: string | null;
    rol?: string | null;
    marcarResolucionDevolucion?: boolean;
  }) {
    return enTransaccion(this.base, async (tx) => {
      const mov = await tx.movimientoPago.findFirst({
        where: { proveedor: p.proveedor, referenciaProveedor: p.referenciaDevolucion, tipo: 'reembolso' },
      });
      if (mov) {
        const ped = await tx.pedidoBoleteria.findUnique({
          where: { id: p.pedidoId },
          include: { funcion: { include: { edicion: true } }, entradas: true },
        });
        return { pedido: ped ? mapPedido(ped) : null, inventario: ped ? mapFuncion(ped.funcion) : null, yaRegistrado: true };
      }

      const pedidoActual = await tx.pedidoBoleteria.findUnique({
        where: { id: p.pedidoId },
        include: { entradas: true },
      });
      if (!pedidoActual) return { pedido: null, inventario: null, yaRegistrado: false };

      const validas = pedidoActual.entradas.filter((e) => e.estado === 'valida').length;
      if (validas > 0) {
        await tx.entradaBoleteria.updateMany({
          where: { pedidoId: p.pedidoId, estado: 'valida' },
          data: { estado: 'anulada' },
        });
        await tx.$executeRaw`
          UPDATE "boleteria"."inventario_funcion"
          SET "emitidos" = GREATEST(0, "emitidos" - ${validas}), "actualizado_en" = NOW()
          WHERE "funcion_id" = ${pedidoActual.funcionId}::uuid
        `;
      }

      await tx.movimientoPago.create({
        data: {
          id: randomUUID(),
          pedidoId: p.pedidoId,
          tipo: 'reembolso',
          proveedor: p.proveedor,
          referenciaProveedor: p.referenciaDevolucion,
          importeCentavos: p.importeCentavos,
          estado: 'reembolsado',
          detalle: { motivo: p.motivo },
        },
      });

      const act = await tx.pedidoBoleteria.update({
        where: { id: p.pedidoId },
        data: {
          estado: 'reembolsado',
          venceEn: null,
          ...(p.marcarResolucionDevolucion ? { resolucionCancelacion: 'devolucion' } : {}),
        },
        include: { funcion: { include: { edicion: true } }, entradas: { orderBy: { emitidaEn: 'asc' } } },
      });

      await crearAuditoriaEnTx(tx, {
        accion: 'pedido_reembolsado',
        actorId: p.actorId,
        rol: p.rol,
        entidad: 'pedido',
        entidadId: p.pedidoId,
        motivo: p.motivo,
        datos: { importeCentavos: p.importeCentavos, referenciaDevolucion: p.referenciaDevolucion },
        correlacionId: p.correlacionId,
      });

      return { pedido: mapPedido(act), inventario: mapFuncion(act.funcion), yaRegistrado: false };
    });
  }

  async expirarRetencionesVencidas(ahora: Date, limite = 100) {
    return enTransaccion(this.base, async (tx) => {
      const vencidos = await tx.$queryRaw<Array<{ id: string; funcion_id: string; cantidad: number }>>`
        SELECT "id", "funcion_id", "cantidad"
        FROM "boleteria"."pedido"
        WHERE "estado" = 'pendiente' AND "vence_en" <= ${ahora}
        ORDER BY "vence_en" ASC
        LIMIT ${limite}
        FOR UPDATE SKIP LOCKED
      `;
      const resultados: { pedidoId: string; funcion: FuncionConEdicion }[] = [];
      for (const p of vencidos) {
        // Solo si sigue pendiente: un pago confirmado entre medio no se expira ni libera sus lugares
        const { count } = await tx.pedidoBoleteria.updateMany({
          where: { id: p.id, estado: 'pendiente' },
          data: { estado: 'expirado', venceEn: null },
        });
        if (count === 0) continue;
        await tx.$executeRaw`
          UPDATE "boleteria"."inventario_funcion"
          SET "retenidos" = GREATEST(0, "retenidos" - ${p.cantidad}), "actualizado_en" = NOW()
          WHERE "funcion_id" = ${p.funcion_id}::uuid
        `;
        const fn = await tx.inventarioFuncion.findUniqueOrThrow({
          where: { funcionId: p.funcion_id },
          include: { edicion: true },
        });
        resultados.push({ pedidoId: p.id, funcion: mapFuncion(fn) });
      }
      return resultados;
    });
  }

  async listarPedidosPendientesAntiguos(antesDe: Date) {
    const pedidos = await this.db.pedidoBoleteria.findMany({
      where: { estado: 'pendiente', creadoEn: { lte: antesDe } },
      include: {
        movimientosPago: { where: { tipo: 'intencion' }, orderBy: { registradoEn: 'desc' }, take: 1 },
      },
      take: 50,
    });
    return pedidos.map((p) => ({
      id: p.id,
      referenciaIntencion: p.movimientosPago[0]?.referenciaProveedor ?? null,
    }));
  }

  async obtenerReferenciaCobroAprobado(pedidoId: string) {
    const mov = await this.db.movimientoPago.findFirst({
      where: { pedidoId, tipo: 'cobro', estado: 'aprobado' },
      orderBy: { registradoEn: 'desc' },
    });
    if (!mov || !mov.referenciaProveedor) return null;
    return {
      proveedor: mov.proveedor,
      referenciaProveedor: mov.referenciaProveedor,
      importeCentavos: mov.importeCentavos,
    };
  }

  async crearReservaGratuita(p: {
    funcionId: string;
    cuentaId: string;
    correoComprador?: string;
    cantidad: number;
    claveIdempotencia: string;
    ahora: Date;
    estudianteAcreditado: boolean;
    llaves: ParLlavesQr;
    correlacionId: string;
  }) {
    return enTransaccion(this.base, async (tx) => {
      const existente = await tx.pedidoBoleteria.findUnique({
        where: { claveIdempotencia: p.claveIdempotencia },
        include: { funcion: { include: { edicion: true } }, entradas: { orderBy: { emitidaEn: 'asc' } } },
      });
      if (existente) {
        if (
          existente.funcionId !== p.funcionId ||
          existente.cantidad !== p.cantidad ||
          existente.cuentaId !== p.cuentaId ||
          existente.tipo !== 'reserva'
        ) {
          return { ok: false as const, motivo: 'conflicto_idempotencia' as const, detalle: 'La clave de idempotencia ya se usó con otros parámetros.' };
        }
        return {
          ok: true as const,
          pedido: mapPedido(existente),
          inventarioActualizado: mapFuncion(existente.funcion),
          idempotente: true,
        };
      }

      const fnRow = await tx.inventarioFuncion.findUnique({
        where: { funcionId: p.funcionId },
        include: { edicion: true },
      });
      if (!fnRow) return { ok: false as const, motivo: 'no_encontrada' as const, detalle: 'Función no encontrada.' };
      const fn = mapFuncion(fnRow);

      if (fn.tipoAcceso === 'gratuita_libre') {
        return { ok: false as const, motivo: 'entrada_libre' as const, detalle: 'Entrada libre: esta función no requiere reserva.' };
      }
      if (fn.tipoAcceso === 'pagada') {
        return { ok: false as const, motivo: 'venta_cerrada' as const, detalle: 'Esta función es pagada y requiere compra.' };
      }
      if (
        !ventaEnLineaHabilitada({
          inicio: fn.inicio,
          ahora: p.ahora,
          estadoFuncion: fn.estadoFuncion,
          estadoEdicion: fn.estadoEdicion,
        })
      ) {
        return { ok: false as const, motivo: 'venta_cerrada' as const, detalle: 'La reserva en línea para esta función está cerrada.' };
      }
      if (!puedeComprarPorCanal({ tipoAcceso: fn.tipoAcceso, canal: 'web', estudianteAcreditado: p.estudianteAcreditado })) {
        return { ok: false as const, motivo: 'restringida' as const, detalle: 'Función restringida: requiere acreditación de estudiante.' };
      }

      await bloquearCuentaFuncion(tx, p.cuentaId, p.funcionId);
      const acumulado = await contarAcumuladoCuenta(tx, p.cuentaId, p.funcionId);
      const lim = validarLimitesCompra({
        cantidadSolicitada: p.cantidad,
        acumuladoPersona: acumulado,
        maxPorPedido: fn.maxPorPedido,
        maxPorPersona: fn.maxPorPersona,
      });
      if (!lim.valido) return { ok: false as const, motivo: 'limite' as const, detalle: lim.motivo };

      const actualizados = await tx.$queryRaw<Array<{ retenidos: number; emitidos: number; aforo_habilitado: number }>>`
        UPDATE "boleteria"."inventario_funcion"
        SET "emitidos" = "emitidos" + ${p.cantidad}, "actualizado_en" = NOW()
        WHERE "funcion_id" = ${p.funcionId}::uuid
          AND "estado_funcion" IN ('programada', 'reprogramada')
          AND "aforo_habilitado" - "emitidos" - "retenidos" >= ${p.cantidad}
        RETURNING "retenidos", "emitidos", "aforo_habilitado"
      `;
      if (actualizados.length === 0) {
        const disponibles = calcularDisponibilidad({
          aforoHabilitado: fn.aforoHabilitado,
          emitidos: fn.emitidos,
          retenidos: fn.retenidos,
        });
        const detalle = disponibles === 0 ? 'Agotado: no quedan lugares disponibles.' : `Solo quedan ${disponibles} lugares disponibles.`;
        return { ok: false as const, motivo: 'cupo' as const, detalle, disponibles };
      }

      const pedidoId = randomUUID();
      await tx.pedidoBoleteria.create({
        data: {
          id: pedidoId,
          funcionId: p.funcionId,
          cuentaId: p.cuentaId,
          correoComprador: p.correoComprador ?? null,
          canal: 'web',
          tipo: 'reserva',
          cantidad: p.cantidad,
          precioUnitarioCentavos: 0,
          importeCentavos: 0,
          estado: 'confirmado',
          claveIdempotencia: p.claveIdempotencia,
          creadoEn: p.ahora,
        },
      });
      await generarEntradasEnTx(tx, {
        pedidoId,
        funcionId: p.funcionId,
        cantidad: p.cantidad,
        ahora: p.ahora,
        llaves: p.llaves,
      });

      const pedido = await tx.pedidoBoleteria.findUniqueOrThrow({
        where: { id: pedidoId },
        include: { funcion: { include: { edicion: true } }, entradas: { orderBy: { emitidaEn: 'asc' } } },
      });
      return {
        ok: true as const,
        pedido: mapPedido(pedido),
        inventarioActualizado: mapFuncion(pedido.funcion),
        idempotente: false,
      };
    });
  }

  async cancelarReserva(p: { pedidoId: string; cuentaId: string; ahora: Date; correlacionId: string }) {
    return enTransaccion(this.base, async (tx) => {
      // Auditoría #3: bloquea el pedido y resta solo las entradas que esta operación anula de verdad
      await tx.$queryRaw`SELECT "id" FROM "boleteria"."pedido" WHERE "id" = ${p.pedidoId}::uuid FOR UPDATE`;
      const pedido = await tx.pedidoBoleteria.findUnique({
        where: { id: p.pedidoId },
        include: { funcion: { include: { edicion: true } }, entradas: true },
      });
      if (!pedido) return { ok: false as const, motivo: 'no_encontrado' as const, detalle: 'Reserva no encontrada.' };
      if (pedido.cuentaId !== p.cuentaId) {
        return { ok: false as const, motivo: 'no_autorizado' as const, detalle: 'No puedes cancelar una reserva de otra cuenta.' };
      }
      if (pedido.tipo !== 'reserva' || pedido.estado !== 'confirmado') {
        return { ok: false as const, motivo: 'no_permitido' as const, detalle: 'Solo se pueden cancelar reservas confirmadas.' };
      }
      if (p.ahora.getTime() >= pedido.funcion.inicio.getTime()) {
        return { ok: false as const, motivo: 'no_permitido' as const, detalle: 'No se puede cancelar una reserva después del inicio.' };
      }

      const { count: validas } = await tx.entradaBoleteria.updateMany({
        where: { pedidoId: pedido.id, estado: 'valida' },
        data: { estado: 'anulada' },
      });
      if (validas > 0) {
        await tx.$executeRaw`
          UPDATE "boleteria"."inventario_funcion"
          SET "emitidos" = "emitidos" - ${validas}, "actualizado_en" = NOW()
          WHERE "funcion_id" = ${pedido.funcionId}::uuid
        `;
      }
      const act = await tx.pedidoBoleteria.update({
        where: { id: pedido.id },
        data: { estado: 'cancelado' },
        include: { funcion: { include: { edicion: true } }, entradas: { orderBy: { emitidaEn: 'asc' } } },
      });
      await crearAuditoriaEnTx(tx, {
        accion: 'reserva_cancelada',
        actorId: p.cuentaId,
        rol: 'asistente',
        entidad: 'pedido',
        entidadId: pedido.id,
        datos: { entradasAnuladas: validas },
        correlacionId: p.correlacionId,
      });
      return { ok: true as const, pedido: mapPedido(act), inventario: mapFuncion(act.funcion) };
    });
  }

  async liberarReservasNoValidadas(ahora: Date) {
    const limiteInicio = new Date(ahora.getTime() + DIEZ_MINUTOS_MS);
    return enTransaccion(this.base, async (tx) => {
      const funciones = await tx.$queryRaw<Array<{ funcion_id: string }>>`
        SELECT "funcion_id"
        FROM "boleteria"."inventario_funcion"
        WHERE "tipo_acceso" = 'gratuita_reserva'
          AND "reservas_liberadas" = false
          AND "estado_funcion" IN ('programada', 'reprogramada')
          AND "inicio" <= ${limiteInicio}
        FOR UPDATE SKIP LOCKED
      `;
      const salida: { funcion: FuncionConEdicion; entradasLiberadas: number }[] = [];
      for (const f of funciones) {
        const res = await tx.entradaBoleteria.updateMany({
          where: { funcionId: f.funcion_id, estado: 'valida', pedido: { tipo: 'reserva' } },
          data: { estado: 'liberada' },
        });
        await tx.$executeRaw`
          UPDATE "boleteria"."inventario_funcion"
          SET "emitidos" = GREATEST(0, "emitidos" - ${res.count}),
              "reservas_liberadas" = true,
              "actualizado_en" = NOW()
          WHERE "funcion_id" = ${f.funcion_id}::uuid
        `;
        const fn = await tx.inventarioFuncion.findUniqueOrThrow({
          where: { funcionId: f.funcion_id },
          include: { edicion: true },
        });
        salida.push({ funcion: mapFuncion(fn), entradasLiberadas: res.count });
      }
      return salida;
    });
  }

  async abrirCaja(p: { vendedorId: string; sedeId: string; fondoInicialCentavos: number; ahora: Date; correlacionId: string }) {
    return enTransaccion(this.base, async (tx) => {
      const abierta = await tx.cajaBoleteria.findFirst({
        where: { vendedorId: p.vendedorId, sedeId: p.sedeId, estado: 'abierta' },
        include: { movimientos: true },
      });
      if (abierta) {
        return { ok: false as const, motivo: 'ya_abierta' as const, detalle: 'Ya tienes una caja abierta en esta sede.' };
      }
      const caja = await tx.cajaBoleteria.create({
        data: {
          id: randomUUID(),
          vendedorId: p.vendedorId,
          sedeId: p.sedeId,
          estado: 'abierta',
          fondoInicialCentavos: p.fondoInicialCentavos,
          abiertaEn: p.ahora,
        },
        include: { movimientos: true },
      });
      await crearAuditoriaEnTx(tx, {
        accion: 'caja_abierta',
        actorId: p.vendedorId,
        rol: 'taquilla',
        entidad: 'caja',
        entidadId: caja.id,
        datos: { sedeId: p.sedeId, fondoInicialCentavos: p.fondoInicialCentavos },
        correlacionId: p.correlacionId,
      });
      return { ok: true as const, caja: mapCaja(caja) };
    });
  }

  async obtenerCajaAbierta(vendedorId: string): Promise<CajaRegistro | null> {
    const caja = await this.db.cajaBoleteria.findFirst({
      where: { vendedorId, estado: 'abierta' },
      include: { movimientos: { orderBy: { registradoEn: 'asc' } } },
    });
    return caja ? mapCaja(caja) : null;
  }

  async obtenerCajaPorId(cajaId: string): Promise<CajaRegistro | null> {
    const caja = await this.db.cajaBoleteria.findUnique({
      where: { id: cajaId },
      include: { movimientos: { orderBy: { registradoEn: 'asc' } } },
    });
    return caja ? mapCaja(caja) : null;
  }

  async cerrarCaja(p: {
    cajaId: string;
    vendedorId: string;
    efectivoDeclaradoCentavos: number;
    ahora: Date;
    correlacionId: string;
  }) {
    return enTransaccion(this.base, async (tx) => {
      const caja = await tx.cajaBoleteria.findUnique({
        where: { id: p.cajaId },
        include: { movimientos: true },
      });
      if (!caja) return { ok: false as const, motivo: 'no_encontrada' as const, detalle: 'Caja no encontrada.' };
      if (caja.vendedorId !== p.vendedorId) {
        return { ok: false as const, motivo: 'no_autorizada' as const, detalle: 'No puedes cerrar la caja de otro vendedor.' };
      }
      if (caja.estado === 'cerrada') {
        return { ok: false as const, motivo: 'ya_cerrada' as const, detalle: 'Esta caja ya fue cerrada.' };
      }
      const arqueo = calcularArqueoCaja({
        fondoInicialCentavos: caja.fondoInicialCentavos,
        movimientos: caja.movimientos.map((m) => ({
          tipo: m.tipo as TipoMovimientoCaja,
          medioPago: m.medioPago as MedioPagoTaquilla,
          importeCentavos: m.importeCentavos,
        })),
        efectivoDeclaradoCentavos: p.efectivoDeclaradoCentavos,
      });

      const act = await tx.cajaBoleteria.update({
        where: { id: caja.id },
        data: {
          estado: 'cerrada',
          efectivoEsperadoCentavos: arqueo.efectivoEsperadoCentavos,
          efectivoDeclaradoCentavos: arqueo.efectivoDeclaradoCentavos,
          diferenciaCentavos: arqueo.diferenciaCentavos,
          cerradaEn: p.ahora,
        },
        include: { movimientos: { orderBy: { registradoEn: 'asc' } } },
      });

      await crearAuditoriaEnTx(tx, {
        accion: 'caja_cerrada',
        actorId: p.vendedorId,
        rol: 'taquilla',
        entidad: 'caja',
        entidadId: caja.id,
        datos: { ...arqueo },
        correlacionId: p.correlacionId,
      });

      return { ok: true as const, caja: mapCaja(act) };
    });
  }

  async venderEnTaquilla(p: {
    cajaId: string;
    vendedorId: string;
    sedesPermitidas?: string[];
    funcionId: string;
    cantidad: number;
    medioPago: MedioPagoTaquilla;
    correoComprador?: string;
    claveIdempotencia: string;
    ahora: Date;
    llaves: ParLlavesQr;
    correlacionId: string;
  }) {
    return enTransaccion(this.base, async (tx) => {
      const existente = await tx.pedidoBoleteria.findUnique({
        where: { claveIdempotencia: p.claveIdempotencia },
        include: { funcion: { include: { edicion: true } }, entradas: { orderBy: { emitidaEn: 'asc' } } },
      });
      if (existente) {
        if (existente.funcionId !== p.funcionId || existente.cantidad !== p.cantidad || existente.canal !== 'taquilla') {
          return { ok: false as const, motivo: 'conflicto_idempotencia' as const, detalle: 'La clave de idempotencia ya se usó con otros parámetros.' };
        }
        return {
          ok: true as const,
          pedido: mapPedido(existente),
          inventario: mapFuncion(existente.funcion),
          idempotente: true,
        };
      }

      const caja = await tx.cajaBoleteria.findUnique({ where: { id: p.cajaId } });
      if (!caja) return { ok: false as const, motivo: 'caja_no_encontrada' as const, detalle: 'Caja no encontrada.' };
      if (caja.vendedorId !== p.vendedorId) {
        return { ok: false as const, motivo: 'no_autorizado' as const, detalle: 'Esta caja pertenece a otro vendedor.' };
      }
      if (caja.estado !== 'abierta') {
        return { ok: false as const, motivo: 'caja_cerrada' as const, detalle: 'No se puede vender en una caja cerrada.' };
      }

      const fnRow = await tx.inventarioFuncion.findUnique({
        where: { funcionId: p.funcionId },
        include: { edicion: true },
      });
      if (!fnRow) return { ok: false as const, motivo: 'no_encontrada' as const, detalle: 'Función no encontrada.' };
      const fn = mapFuncion(fnRow);

      if (caja.sedeId !== fn.sedeId) {
        return { ok: false as const, motivo: 'no_autorizado' as const, detalle: 'La caja abierta corresponde a otra sede.' };
      }
      if (p.sedesPermitidas && p.sedesPermitidas.length > 0 && !p.sedesPermitidas.includes(fn.sedeId)) {
        return { ok: false as const, motivo: 'no_autorizado' as const, detalle: 'Sin alcance autorizado para esta sede.' };
      }
      if (fn.tipoAcceso === 'gratuita_libre') {
        return { ok: false as const, motivo: 'entrada_libre' as const, detalle: 'Función de entrada libre: no emite boletos.' };
      }
      if (fn.estadoEdicion !== 'publicada' || (fn.estadoFuncion !== 'programada' && fn.estadoFuncion !== 'reprogramada')) {
        return { ok: false as const, motivo: 'venta_cerrada' as const, detalle: 'La función no está disponible para venta.' };
      }

      const actualizados = await tx.$queryRaw<Array<{ funcion_id: string }>>`
        UPDATE "boleteria"."inventario_funcion"
        SET "emitidos" = "emitidos" + ${p.cantidad}, "actualizado_en" = NOW()
        WHERE "funcion_id" = ${p.funcionId}::uuid
          AND "estado_funcion" IN ('programada', 'reprogramada')
          AND "aforo_habilitado" - "emitidos" - "retenidos" >= ${p.cantidad}
        RETURNING "funcion_id"
      `;
      if (actualizados.length === 0) {
        const disponibles = calcularDisponibilidad({
          aforoHabilitado: fn.aforoHabilitado,
          emitidos: fn.emitidos,
          retenidos: fn.retenidos,
        });
        const detalle = disponibles === 0 ? 'Agotado' : `Solo quedan ${disponibles} lugares disponibles.`;
        return { ok: false as const, motivo: 'cupo' as const, detalle, disponibles };
      }

      const esPagada = fn.tipoAcceso === 'pagada';
      const precioUnitario = esPagada ? fn.precioCentavos : 0;
      const importe = calcularImporteCentavos(p.cantidad, precioUnitario);
      const pedidoId = randomUUID();

      await tx.pedidoBoleteria.create({
        data: {
          id: pedidoId,
          funcionId: p.funcionId,
          cuentaId: null,
          correoComprador: p.correoComprador ?? null,
          canal: 'taquilla',
          tipo: esPagada ? 'compra' : 'reserva',
          cantidad: p.cantidad,
          precioUnitarioCentavos: precioUnitario,
          importeCentavos: importe,
          estado: esPagada ? 'pagado' : 'confirmado',
          claveIdempotencia: p.claveIdempotencia,
          cajaId: caja.id,
          creadoEn: p.ahora,
        },
      });
      await generarEntradasEnTx(tx, {
        pedidoId,
        funcionId: p.funcionId,
        cantidad: p.cantidad,
        ahora: p.ahora,
        llaves: p.llaves,
      });

      if (importe > 0) {
        await tx.movimientoCaja.create({
          data: {
            id: randomUUID(),
            cajaId: caja.id,
            pedidoId,
            tipo: 'venta',
            medioPago: p.medioPago,
            importeCentavos: importe,
            registradoEn: p.ahora,
          },
        });
      }

      const act = await tx.pedidoBoleteria.findUniqueOrThrow({
        where: { id: pedidoId },
        include: { funcion: { include: { edicion: true } }, entradas: { orderBy: { emitidaEn: 'asc' } } },
      });
      return { ok: true as const, pedido: mapPedido(act), inventario: mapFuncion(act.funcion), idempotente: false };
    });
  }

  async buscarEntradaPorCodigoOToken(codigoEntrada: string): Promise<EntradaDevolucionTaquilla | null> {
    const limpio = normalizarCodigoCorto(codigoEntrada);
    const ent = await this.db.entradaBoleteria.findFirst({
      where: { OR: [{ tokenQr: codigoEntrada.trim() }, { codigoCorto: limpio }] },
      include: {
        pedido: {
          include: {
            entradas: true,
            movimientosCaja: true,
            funcion: true,
          },
        },
      },
    });
    if (!ent) return null;
    return {
      entradaId: ent.id,
      entradaEstado: ent.estado as EstadoEntrada,
      pedidoId: ent.pedidoId,
      funcionId: ent.funcionId,
      sedeId: ent.pedido.funcion.sedeId,
      estadoFuncion: ent.pedido.funcion.estadoFuncion as EstadoFuncion,
      pedidoEstado: ent.pedido.estado as EstadoPedido,
      canal: ent.pedido.canal as CanalPedido,
      importeCentavos: ent.pedido.importeCentavos,
      cantidadPedido: ent.pedido.cantidad,
      resolucionCancelacion: (ent.pedido.resolucionCancelacion as ResolucionCancelacion | null) ?? null,
      entradasPedido: ent.pedido.entradas.map((e) => ({ id: e.id, estado: e.estado as EstadoEntrada })),
      tuvoEfectivo: ent.pedido.movimientosCaja.some((m) => m.tipo === 'venta' && m.medioPago === 'efectivo'),
    };
  }

  async ejecutarDevolucionTaquillaEfectivo(p: {
    cajaId: string;
    vendedorId: string;
    pedidoId: string;
    ahora: Date;
    correlacionId: string;
  }) {
    return enTransaccion(this.base, async (tx) => {
      const caja = await tx.cajaBoleteria.findUnique({ where: { id: p.cajaId } });
      if (!caja || caja.estado !== 'abierta') {
        return { ok: false as const, motivo: 'caja_cerrada' as const, detalle: 'Se requiere una caja abierta para devolver efectivo.' };
      }
      if (caja.vendedorId !== p.vendedorId) {
        return { ok: false as const, motivo: 'no_autorizado' as const, detalle: 'Caja perteneciente a otro vendedor.' };
      }
      // Auditoría #2: bloquea el pedido; un segundo clic espera y ve que ya está reembolsado
      await tx.$queryRaw`SELECT "id" FROM "boleteria"."pedido" WHERE "id" = ${p.pedidoId}::uuid FOR UPDATE`;
      const pedido = await tx.pedidoBoleteria.findUnique({
        where: { id: p.pedidoId },
        include: { funcion: { include: { edicion: true } }, entradas: true },
      });
      if (!pedido || pedido.estado !== 'pagado') {
        return { ok: false as const, motivo: 'no_permitido' as const, detalle: 'El pedido no es elegible para devolución.' };
      }
      if (pedido.funcion.sedeId !== caja.sedeId) {
        return { ok: false as const, motivo: 'no_autorizado' as const, detalle: 'La devolución debe hacerse en la sede de la función.' };
      }

      const { count: validas } = await tx.entradaBoleteria.updateMany({
        where: { pedidoId: pedido.id, estado: 'valida' },
        data: { estado: 'anulada' },
      });
      if (validas > 0) {
        await tx.$executeRaw`
          UPDATE "boleteria"."inventario_funcion"
          SET "emitidos" = "emitidos" - ${validas}, "actualizado_en" = NOW()
          WHERE "funcion_id" = ${pedido.funcionId}::uuid
        `;
      }

      await tx.movimientoCaja.create({
        data: {
          id: randomUUID(),
          cajaId: caja.id,
          pedidoId: pedido.id,
          tipo: 'egreso_devolucion',
          medioPago: 'efectivo',
          importeCentavos: pedido.importeCentavos,
          registradoEn: p.ahora,
        },
      });

      const act = await tx.pedidoBoleteria.update({
        where: { id: pedido.id },
        data: { estado: 'reembolsado', resolucionCancelacion: 'devolucion' },
        include: { funcion: { include: { edicion: true } }, entradas: { orderBy: { emitidaEn: 'asc' } } },
      });

      await crearAuditoriaEnTx(tx, {
        accion: 'devolucion_taquilla_efectivo',
        actorId: p.vendedorId,
        rol: 'taquilla',
        entidad: 'pedido',
        entidadId: pedido.id,
        datos: { cajaId: caja.id, importeCentavos: pedido.importeCentavos },
        correlacionId: p.correlacionId,
      });

      return { ok: true as const, pedido: mapPedido(act) };
    });
  }

  async listarEntradasParaPaquete(funcionId: string): Promise<EntradaPaqueteItem[]> {
    const entradas = await this.db.entradaBoleteria.findMany({
      where: { funcionId },
      include: {
        ingresos: { where: { esConflicto: false }, orderBy: { escaneadoEn: 'asc' }, take: 1 },
      },
      orderBy: { emitidaEn: 'asc' },
    });
    return entradas.map((e) => ({
      id: e.id,
      codigoCorto: e.codigoCorto,
      estado: e.estado as EstadoEntrada,
      usadaEn: e.ingresos[0]?.escaneadoEn ?? null,
      puerta: e.ingresos[0]?.puerta ?? null,
      dispositivoId: e.ingresos[0]?.dispositivoId ?? null,
    }));
  }

  async buscarEntradaParaValidar(p: { entradaId?: string; codigoCorto?: string }): Promise<EntradaParaValidacion | null> {
    const where = p.entradaId ? { id: p.entradaId } : p.codigoCorto ? { codigoCorto: normalizarCodigoCorto(p.codigoCorto) } : null;
    if (!where) return null;
    const ent = await this.db.entradaBoleteria.findFirst({
      where,
      include: {
        funcion: true,
        ingresos: { where: { esConflicto: false }, orderBy: { escaneadoEn: 'asc' }, take: 1 },
      },
    });
    if (!ent) return null;
    return {
      id: ent.id,
      pedidoId: ent.pedidoId,
      funcionId: ent.funcionId,
      tokenQr: ent.tokenQr,
      codigoCorto: ent.codigoCorto,
      estado: ent.estado as EstadoEntrada,
      obraTitulo: ent.funcion.obraTitulo,
      sedeId: ent.funcion.sedeId,
      sedeNombre: ent.funcion.sedeNombre,
      inicio: ent.funcion.inicio,
      fin: ent.funcion.fin,
      ultimoIngreso: ent.ingresos[0]
        ? {
            escaneadoEn: ent.ingresos[0].escaneadoEn,
            puerta: ent.ingresos[0].puerta,
            dispositivoId: ent.ingresos[0].dispositivoId,
          }
        : null,
    };
  }

  async registrarIngresoEnLinea(p: {
    entradaId: string;
    funcionId: string;
    validadorId: string;
    dispositivoId: string;
    puerta: string;
    escaneadoEn: Date;
  }): Promise<{ ingresoId: string; duplicado: boolean }> {
    return enTransaccion(this.base, async (tx) => {
      const marcada = await tx.entradaBoleteria.updateMany({
        where: { id: p.entradaId, estado: 'valida' },
        data: { estado: 'usada' },
      });
      if (marcada.count === 0) {
        const previo = await tx.ingresoBoleteria.findFirst({
          where: { entradaId: p.entradaId, esConflicto: false },
          orderBy: { escaneadoEn: 'asc' },
        });
        return { ingresoId: previo?.id ?? randomUUID(), duplicado: true };
      }
      const ingresoId = randomUUID();
      await tx.ingresoBoleteria.create({
        data: {
          id: ingresoId,
          entradaId: p.entradaId,
          funcionId: p.funcionId,
          validadorId: p.validadorId,
          dispositivoId: p.dispositivoId,
          puerta: p.puerta,
          escaneadoEn: p.escaneadoEn,
          diferido: false,
          esConflicto: false,
        },
      });
      await tx.$executeRaw`
        UPDATE "boleteria"."inventario_funcion"
        SET "usados" = "usados" + 1, "actualizado_en" = NOW()
        WHERE "funcion_id" = ${p.funcionId}::uuid
      `;
      return { ingresoId, duplicado: false };
    });
  }

  async sincronizarIngresosLote(p: {
    validadorId: string;
    ingresos: {
      entradaId: string;
      funcionId: string;
      dispositivoId: string;
      puerta: string;
      escaneadoEn: Date;
    }[];
    ahora: Date;
  }) {
    const ordenados = [...p.ingresos].sort((a, b) => a.escaneadoEn.getTime() - b.escaneadoEn.getTime());
    let aplicados = 0;
    let duplicados = 0;
    const nuevosIngresos: {
      ingresoId: string;
      entradaId: string;
      funcionId: string;
      sedeId: string;
      edicionId: string;
      validadorId: string;
      escaneadoEn: Date;
    }[] = [];
    const conflictos: {
      entradaId: string;
      funcionId: string;
      sedeId: string;
      edicionId: string;
      primerIngresoEn: Date;
      puertaGanadora: string;
      primerDispositivoId: string;
      segundoDispositivoId: string;
      mensaje: string;
    }[] = [];

    await enTransaccion(this.base, async (tx) => {
      for (const item of ordenados) {
        const yaExisteMismoEscaneo = await tx.ingresoBoleteria.findFirst({
          where: {
            entradaId: item.entradaId,
            dispositivoId: item.dispositivoId,
            escaneadoEn: item.escaneadoEn,
          },
        });
        if (yaExisteMismoEscaneo) {
          duplicados++;
          continue;
        }

        const entrada = await tx.entradaBoleteria.findUnique({
          where: { id: item.entradaId },
          include: { funcion: true },
        });
        if (!entrada || entrada.funcionId !== item.funcionId) continue;

        const ingresoGanadorPrevio = await tx.ingresoBoleteria.findFirst({
          where: { entradaId: item.entradaId, esConflicto: false },
          orderBy: { escaneadoEn: 'asc' },
        });

        if (!ingresoGanadorPrevio && (entrada.estado === 'valida' || entrada.estado === 'usada')) {
          const ingresoId = randomUUID();
          await tx.entradaBoleteria.updateMany({
            where: { id: item.entradaId, estado: 'valida' },
            data: { estado: 'usada' },
          });
          await tx.ingresoBoleteria.create({
            data: {
              id: ingresoId,
              entradaId: item.entradaId,
              funcionId: item.funcionId,
              validadorId: p.validadorId,
              dispositivoId: item.dispositivoId,
              puerta: item.puerta,
              escaneadoEn: item.escaneadoEn,
              sincronizadoEn: p.ahora,
              diferido: true,
              esConflicto: false,
            },
          });
          await tx.$executeRaw`
            UPDATE "boleteria"."inventario_funcion"
            SET "usados" = "usados" + 1, "actualizado_en" = NOW()
            WHERE "funcion_id" = ${item.funcionId}::uuid
          `;
          aplicados++;
          nuevosIngresos.push({
            ingresoId,
            entradaId: item.entradaId,
            funcionId: item.funcionId,
            sedeId: entrada.funcion.sedeId,
            edicionId: entrada.funcion.edicionId,
            validadorId: p.validadorId,
            escaneadoEn: item.escaneadoEn,
          });
        } else if (ingresoGanadorPrevio) {
          if (ingresoGanadorPrevio.dispositivoId === item.dispositivoId) {
            duplicados++;
            continue;
          }
          // US2-AS6: Segundo dispositivo aceptó la misma entrada sin conexión -> conservar el primero, marcar conflicto
          await tx.ingresoBoleteria.create({
            data: {
              id: randomUUID(),
              entradaId: item.entradaId,
              funcionId: item.funcionId,
              validadorId: p.validadorId,
              dispositivoId: item.dispositivoId,
              puerta: item.puerta,
              escaneadoEn: item.escaneadoEn,
              sincronizadoEn: p.ahora,
              diferido: true,
              esConflicto: true,
            },
          });
          conflictos.push({
            entradaId: item.entradaId,
            funcionId: item.funcionId,
            sedeId: entrada.funcion.sedeId,
            edicionId: entrada.funcion.edicionId,
            primerIngresoEn: ingresoGanadorPrevio.escaneadoEn,
            puertaGanadora: ingresoGanadorPrevio.puerta,
            primerDispositivoId: ingresoGanadorPrevio.dispositivoId,
            segundoDispositivoId: item.dispositivoId,
            mensaje: `Conflicto: entrada validada antes en ${ingresoGanadorPrevio.puerta}.`,
          });
        }
      }
    });

    return { aplicados, duplicados, nuevosIngresos, conflictos };
  }

  async cambiarFuncionPorCancelacion(p: {
    pedidoId: string;
    cuentaId: string;
    nuevaFuncionId: string;
    ahora: Date;
    llaves: ParLlavesQr;
    correlacionId: string;
  }) {
    return enTransaccion(this.base, async (tx) => {
      const pedido = await tx.pedidoBoleteria.findUnique({
        where: { id: p.pedidoId },
        include: { funcion: { include: { edicion: true } }, entradas: true },
      });
      if (!pedido) return { ok: false as const, motivo: 'no_encontrado' as const, detalle: 'Pedido no encontrado.' };
      if (pedido.cuentaId !== p.cuentaId) {
        return { ok: false as const, motivo: 'no_autorizado' as const, detalle: 'No puedes gestionar un pedido de otra cuenta.' };
      }
      if (pedido.estado !== 'pagado' || pedido.resolucionCancelacion === 'cambiado') {
        return { ok: false as const, motivo: 'no_permitido' as const, detalle: 'Este pedido no es elegible para cambio de función.' };
      }
      if (pedido.funcion.estadoFuncion !== 'cancelada' && pedido.funcion.estadoFuncion !== 'reprogramada') {
        return { ok: false as const, motivo: 'no_permitido' as const, detalle: 'Solo procede cambio ante cancelación o reprogramación.' };
      }

      const nuevaRow = await tx.inventarioFuncion.findUnique({
        where: { funcionId: p.nuevaFuncionId },
        include: { edicion: true },
      });
      if (!nuevaRow) return { ok: false as const, motivo: 'no_encontrado' as const, detalle: 'La función destino no existe.' };
      const nuevaFn = mapFuncion(nuevaRow);

      if (nuevaFn.obraId !== pedido.funcion.obraId) {
        return { ok: false as const, motivo: 'no_permitido' as const, detalle: 'El cambio debe ser hacia otra función de la misma obra.' };
      }
      if (nuevaFn.funcionId === pedido.funcionId) {
        return { ok: false as const, motivo: 'no_permitido' as const, detalle: 'Debes elegir una función distinta.' };
      }
      if (nuevaFn.estadoFuncion !== 'programada' && nuevaFn.estadoFuncion !== 'reprogramada') {
        return { ok: false as const, motivo: 'no_permitido' as const, detalle: 'La función destino no está activa.' };
      }

      const cupo = await tx.$queryRaw<Array<{ funcion_id: string }>>`
        UPDATE "boleteria"."inventario_funcion"
        SET "emitidos" = "emitidos" + ${pedido.cantidad}, "actualizado_en" = NOW()
        WHERE "funcion_id" = ${p.nuevaFuncionId}::uuid
          AND "estado_funcion" IN ('programada', 'reprogramada')
          AND "aforo_habilitado" - "emitidos" - "retenidos" >= ${pedido.cantidad}
        RETURNING "funcion_id"
      `;
      if (cupo.length === 0) {
        const disponibles = calcularDisponibilidad({
          aforoHabilitado: nuevaFn.aforoHabilitado,
          emitidos: nuevaFn.emitidos,
          retenidos: nuevaFn.retenidos,
        });
        return { ok: false as const, motivo: 'cupo' as const, detalle: 'No hay suficientes lugares disponibles en la función destino.', disponibles };
      }

      const validasOrig = pedido.entradas.filter((e) => e.estado === 'valida').length;
      if (validasOrig > 0) {
        await tx.entradaBoleteria.updateMany({
          where: { pedidoId: pedido.id, estado: 'valida' },
          data: { estado: 'anulada' },
        });
        await tx.$executeRaw`
          UPDATE "boleteria"."inventario_funcion"
          SET "emitidos" = GREATEST(0, "emitidos" - ${validasOrig}), "actualizado_en" = NOW()
          WHERE "funcion_id" = ${pedido.funcionId}::uuid
        `;
      }

      await tx.pedidoBoleteria.update({
        where: { id: pedido.id },
        data: { resolucionCancelacion: 'cambiado' },
      });

      const nuevoId = randomUUID();
      await tx.pedidoBoleteria.create({
        data: {
          id: nuevoId,
          funcionId: p.nuevaFuncionId,
          cuentaId: pedido.cuentaId,
          correoComprador: pedido.correoComprador,
          canal: 'cambio',
          tipo: pedido.tipo,
          cantidad: pedido.cantidad,
          precioUnitarioCentavos: 0,
          importeCentavos: 0,
          estado: 'pagado',
          claveIdempotencia: `cambio:${pedido.id}:${p.nuevaFuncionId}`,
          pedidoOrigenId: pedido.id,
          creadoEn: p.ahora,
        },
      });
      await generarEntradasEnTx(tx, {
        pedidoId: nuevoId,
        funcionId: p.nuevaFuncionId,
        cantidad: pedido.cantidad,
        ahora: p.ahora,
        llaves: p.llaves,
      });

      await crearAuditoriaEnTx(tx, {
        accion: 'cambio_funcion_por_cancelacion',
        actorId: p.cuentaId,
        rol: 'asistente',
        entidad: 'pedido',
        entidadId: pedido.id,
        datos: { nuevoPedidoId: nuevoId, nuevaFuncionId: p.nuevaFuncionId },
        correlacionId: p.correlacionId,
      });

      const nuevoPedido = await tx.pedidoBoleteria.findUniqueOrThrow({
        where: { id: nuevoId },
        include: { funcion: { include: { edicion: true } }, entradas: { orderBy: { emitidaEn: 'asc' } } },
      });
      return { ok: true as const, nuevoPedido: mapPedido(nuevoPedido), nuevaFuncion: mapFuncion(nuevoPedido.funcion) };
    });
  }

  async listarPedidosVencidosSinEleccion(ahora: Date): Promise<PedidoRegistro[]> {
    const rows = await this.db.pedidoBoleteria.findMany({
      where: {
        estado: 'pagado',
        resolucionCancelacion: 'pendiente_eleccion',
        plazoEleccionHasta: { lte: ahora },
      },
      include: { funcion: true, entradas: true },
      take: 100,
    });
    return rows.map(mapPedido);
  }

  async aplicarEventoOperacion(p: {
    eventoId: string;
    tipo: string;
    edicionId: string;
    datos: unknown;
    ahora: Date;
    correlacionId: string;
  }) {
    return enTransaccion(this.base, async (tx) => {
      const ya = await tx.eventoProcesadoBoleteria.findUnique({ where: { eventoId: p.eventoId } });
      if (ya) return { aplicado: false };

      await tx.eventoProcesadoBoleteria.create({
        data: { eventoId: p.eventoId, tipo: p.tipo, procesadoEn: p.ahora },
      });

      const d = p.datos as Record<string, unknown>;

      if (p.tipo === 'ProgramacionPublicada') {
        const ed = d.edicion as {
          id: string;
          anio: number;
          numero: string;
          precioCentavos?: number;
          maxPagadasPersona?: number;
          maxReservasPersona?: number;
        };
        const precio = ed.precioCentavos ?? 500;
        const maxPagadas = ed.maxPagadasPersona ?? 6;
        const maxReservas = ed.maxReservasPersona ?? 4;

        await tx.edicionBoleteria.upsert({
          where: { id: ed.id },
          create: {
            id: ed.id,
            anio: ed.anio,
            numero: ed.numero,
            precioCentavos: precio,
            maxPagadasPersona: maxPagadas,
            maxReservasPersona: maxReservas,
            estado: 'publicada',
          },
          update: {
            anio: ed.anio,
            numero: ed.numero,
            estado: 'publicada',
            ...(ed.precioCentavos !== undefined ? { precioCentavos: ed.precioCentavos } : {}),
            ...(ed.maxPagadasPersona !== undefined ? { maxPagadasPersona: ed.maxPagadasPersona } : {}),
            ...(ed.maxReservasPersona !== undefined ? { maxReservasPersona: ed.maxReservasPersona } : {}),
          },
        });
        return { aplicado: true };
      }

      if (p.tipo === 'FuncionProgramada' || p.tipo === 'FuncionActualizada') {
        const fn = d.funcion as {
          id: string;
          version: number;
          inicio: string;
          fin: string;
          tipoAcceso: TipoAcceso;
          publico: PublicoObjetivo;
          aforoHabilitado: number | null;
        };
        const obra = d.obra as { id: string; titulo: string };
        const sede = d.sede as { id: string; nombre: string };

        const edicion = await tx.edicionBoleteria.upsert({
          where: { id: p.edicionId },
          create: { id: p.edicionId, anio: 2026, numero: 'XI', estado: 'borrador' },
          update: {},
        });

        const actual = await tx.inventarioFuncion.findUnique({ where: { funcionId: fn.id } });
        if (actual && fn.version <= actual.versionOrigen) return { aplicado: false };

        const maxPorDefecto = fn.tipoAcceso === 'pagada' ? edicion.maxPagadasPersona : edicion.maxReservasPersona;
        const precio = fn.tipoAcceso === 'pagada' ? edicion.precioCentavos : 0;
        const aforo = fn.aforoHabilitado ?? 0;

        const guardada = await tx.inventarioFuncion.upsert({
          where: { funcionId: fn.id },
          create: {
            funcionId: fn.id,
            edicionId: p.edicionId,
            obraId: obra.id,
            obraTitulo: obra.titulo,
            sedeId: sede.id,
            sedeNombre: sede.nombre,
            inicio: new Date(fn.inicio),
            fin: new Date(fn.fin),
            tipoAcceso: fn.tipoAcceso,
            publico: fn.publico,
            estadoFuncion: 'programada',
            precioCentavos: precio,
            maxPorPedido: maxPorDefecto,
            maxPorPersona: maxPorDefecto,
            aforoHabilitado: aforo,
            versionOrigen: fn.version,
          },
          update: {
            obraId: obra.id,
            obraTitulo: obra.titulo,
            sedeId: sede.id,
            sedeNombre: sede.nombre,
            inicio: new Date(fn.inicio),
            fin: new Date(fn.fin),
            tipoAcceso: fn.tipoAcceso,
            publico: fn.publico,
            precioCentavos: precio,
            maxPorPedido: maxPorDefecto,
            maxPorPersona: maxPorDefecto,
            aforoHabilitado: aforo,
            versionOrigen: fn.version,
          },
          include: { edicion: true },
        });
        return { aplicado: true, funcionAfectada: mapFuncion(guardada) };
      }

      if (p.tipo === 'FuncionReprogramada') {
        const ev = d as {
          funcionId: string;
          version: number;
          nuevo: { inicio: string; fin: string; sedeId: string };
          sede?: { nombre: string };
        };
        const actual = await tx.inventarioFuncion.findUnique({ where: { funcionId: ev.funcionId } });
        if (!actual || ev.version <= actual.versionOrigen) return { aplicado: false };

        const act = await tx.inventarioFuncion.update({
          where: { funcionId: ev.funcionId },
          data: {
            inicio: new Date(ev.nuevo.inicio),
            fin: new Date(ev.nuevo.fin),
            sedeId: ev.nuevo.sedeId,
            ...(ev.sede?.nombre ? { sedeNombre: ev.sede.nombre } : {}),
            estadoFuncion: 'reprogramada',
            versionOrigen: ev.version,
          },
          include: { edicion: true },
        });
        await crearAuditoriaEnTx(tx, {
          accion: 'funcion_reprogramada',
          entidad: 'inventario_funcion',
          entidadId: ev.funcionId,
          datos: { inicio: ev.nuevo.inicio, fin: ev.nuevo.fin, sedeId: ev.nuevo.sedeId },
          correlacionId: p.correlacionId,
        });
        return { aplicado: true, funcionAfectada: mapFuncion(act) };
      }

      if (p.tipo === 'FuncionCancelada') {
        const ev = d as { funcionId: string; version: number };
        const actual = await tx.inventarioFuncion.findUnique({ where: { funcionId: ev.funcionId } });
        if (!actual || ev.version <= actual.versionOrigen) return { aplicado: false };

        await tx.entradaBoleteria.updateMany({
          where: { funcionId: ev.funcionId, estado: 'valida' },
          data: { estado: 'anulada' },
        });

        const plazo = new Date(p.ahora.getTime() + SIETE_DIAS_MS);
        await tx.pedidoBoleteria.updateMany({
          where: { funcionId: ev.funcionId, estado: 'pagado', resolucionCancelacion: null },
          data: { resolucionCancelacion: 'pendiente_eleccion', plazoEleccionHasta: plazo },
        });

        // Expirar pendientes y liberar retenciones
        await tx.pedidoBoleteria.updateMany({
          where: { funcionId: ev.funcionId, estado: 'pendiente' },
          data: { estado: 'expirado', venceEn: null },
        });

        const act = await tx.inventarioFuncion.update({
          where: { funcionId: ev.funcionId },
          data: {
            estadoFuncion: 'cancelada',
            retenidos: 0,
            emitidos: 0,
            versionOrigen: ev.version,
          },
          include: { edicion: true },
        });

        await crearAuditoriaEnTx(tx, {
          accion: 'funcion_cancelada',
          entidad: 'inventario_funcion',
          entidadId: ev.funcionId,
          correlacionId: p.correlacionId,
        });

        return { aplicado: true, funcionAfectada: mapFuncion(act) };
      }

      if (p.tipo === 'AforoCambiado') {
        const ev = d as { funcionId: string; version: number; aforoHabilitado: number };
        const actual = await tx.inventarioFuncion.findUnique({ where: { funcionId: ev.funcionId } });
        if (!actual || ev.version <= actual.versionOrigen) return { aplicado: false };

        const act = await tx.inventarioFuncion.update({
          where: { funcionId: ev.funcionId },
          data: { aforoHabilitado: ev.aforoHabilitado, versionOrigen: ev.version },
          include: { edicion: true },
        });
        const exceso = calcularExcesoAforo({
          aforoHabilitado: act.aforoHabilitado,
          emitidos: act.emitidos,
          retenidos: act.retenidos,
        });
        return {
          aplicado: true,
          funcionAfectada: mapFuncion(act),
          excesoAforo:
            exceso > 0
              ? {
                  funcionId: act.funcionId,
                  sedeId: act.sedeId,
                  edicionId: act.edicionId,
                  aforoHabilitado: act.aforoHabilitado,
                  entradasActivas: act.emitidos + act.retenidos,
                  exceso,
                }
              : null,
        };
      }

      return { aplicado: false };
    });
  }

  async registrarAuditoria(input: AuditoriaInput): Promise<void> {
    await crearAuditoriaEnTx(this.db, input);
  }
}

async function bloquearCuentaFuncion(tx: Prisma.TransactionClient, cuentaId: string, funcionId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${cuentaId}:${funcionId}`}))`;
}

async function contarAcumuladoCuenta(tx: Prisma.TransactionClient, cuentaId: string, funcionId: string): Promise<number> {
  const entradasActivas = await tx.entradaBoleteria.count({
    where: {
      funcionId,
      estado: { in: ['valida', 'usada'] },
      pedido: { cuentaId },
    },
  });
  const pedidosPendientes = await tx.pedidoBoleteria.aggregate({
    where: { funcionId, cuentaId, estado: 'pendiente' },
    _sum: { cantidad: true },
  });
  return entradasActivas + (pedidosPendientes._sum.cantidad ?? 0);
}

async function generarEntradasEnTx(
  tx: Prisma.TransactionClient,
  p: { pedidoId: string; funcionId: string; cantidad: number; ahora: Date; llaves: ParLlavesQr },
) {
  const epoch = Math.floor(p.ahora.getTime() / 1000);
  const filas: Prisma.EntradaBoleteriaCreateManyInput[] = [];
  const codigos = new Set<string>();
  for (let i = 0; i < p.cantidad; i++) {
    const entradaId = randomUUID();
    let codigoCorto = generarCodigoCorto();
    while (codigos.has(codigoCorto)) codigoCorto = generarCodigoCorto();
    codigos.add(codigoCorto);
    filas.push({
      id: entradaId,
      pedidoId: p.pedidoId,
      funcionId: p.funcionId,
      tokenQr: firmarTokenQr({
        entradaId,
        funcionId: p.funcionId,
        emitidaEnEpoch: epoch,
        privadaPem: p.llaves.privadaPem,
      }),
      codigoCorto,
      estado: 'valida',
      emitidaEn: p.ahora,
    });
  }
  await tx.entradaBoleteria.createMany({ data: filas });
}

async function crearAuditoriaEnTx(db: DbCliente, input: AuditoriaInput) {
  await db.auditoriaBoleteria.create({
    data: {
      id: randomUUID(),
      accion: input.accion,
      actorId: input.actorId ?? null,
      rol: input.rol ?? null,
      entidad: input.entidad,
      entidadId: input.entidadId,
      motivo: input.motivo ?? null,
      datos: (input.datos ?? {}) as Prisma.InputJsonValue,
      correlacionId: input.correlacionId,
    },
  });
}

type InventarioConEdicionRow = Prisma.InventarioFuncionGetPayload<{ include: { edicion: true } }>;
type PedidoConDetalleRow = Prisma.PedidoBoleteriaGetPayload<{ include: { funcion: true; entradas: true } }>;
type CajaConMovsRow = Prisma.CajaBoleteriaGetPayload<{ include: { movimientos: true } }>;

function mapFuncion(row: InventarioConEdicionRow): FuncionConEdicion {
  return {
    funcionId: row.funcionId,
    edicionId: row.edicionId,
    obraId: row.obraId,
    obraTitulo: row.obraTitulo,
    sedeId: row.sedeId,
    sedeNombre: row.sedeNombre,
    inicio: row.inicio,
    fin: row.fin,
    tipoAcceso: row.tipoAcceso as TipoAcceso,
    publico: row.publico as PublicoObjetivo,
    estadoFuncion: row.estadoFuncion as EstadoFuncion,
    estadoEdicion: row.edicion.estado as EstadoEdicion,
    precioCentavos: row.precioCentavos,
    maxPorPedido: row.maxPorPedido,
    maxPorPersona: row.maxPorPersona,
    aforoHabilitado: row.aforoHabilitado,
    retenidos: row.retenidos,
    emitidos: row.emitidos,
    usados: row.usados,
    reservasLiberadas: row.reservasLiberadas,
    versionOrigen: row.versionOrigen,
  };
}

function mapEntrada(row: {
  id: string;
  pedidoId: string;
  funcionId: string;
  tokenQr: string;
  codigoCorto: string;
  estado: string;
  emitidaEn: Date;
}): EntradaRegistro {
  return {
    id: row.id,
    pedidoId: row.pedidoId,
    funcionId: row.funcionId,
    tokenQr: row.tokenQr,
    codigoCorto: row.codigoCorto,
    estado: row.estado as EstadoEntrada,
    emitidaEn: row.emitidaEn,
  };
}

function mapPedido(row: PedidoConDetalleRow): PedidoRegistro {
  return {
    id: row.id,
    funcionId: row.funcionId,
    obraId: row.funcion.obraId,
    obraTitulo: row.funcion.obraTitulo,
    sedeId: row.funcion.sedeId,
    sedeNombre: row.funcion.sedeNombre,
    inicio: row.funcion.inicio,
    cuentaId: row.cuentaId,
    correoComprador: row.correoComprador,
    canal: row.canal as CanalPedido,
    tipo: row.tipo as TipoPedido,
    cantidad: row.cantidad,
    precioUnitarioCentavos: row.precioUnitarioCentavos,
    importeCentavos: row.importeCentavos,
    estado: row.estado as EstadoPedido,
    claveIdempotencia: row.claveIdempotencia,
    venceEn: row.venceEn,
    cajaId: row.cajaId,
    resolucionCancelacion: (row.resolucionCancelacion as ResolucionCancelacion | null) ?? null,
    plazoEleccionHasta: row.plazoEleccionHasta,
    pedidoOrigenId: row.pedidoOrigenId,
    creadoEn: row.creadoEn,
    entradas: row.entradas.map(mapEntrada),
  };
}

function mapCaja(row: CajaConMovsRow): CajaRegistro {
  return {
    id: row.id,
    vendedorId: row.vendedorId,
    sedeId: row.sedeId,
    estado: row.estado as EstadoCaja,
    fondoInicialCentavos: row.fondoInicialCentavos,
    efectivoEsperadoCentavos: row.efectivoEsperadoCentavos,
    efectivoDeclaradoCentavos: row.efectivoDeclaradoCentavos,
    diferenciaCentavos: row.diferenciaCentavos,
    abiertaEn: row.abiertaEn,
    cerradaEn: row.cerradaEn,
    movimientos: row.movimientos.map((m) => ({
      id: m.id,
      pedidoId: m.pedidoId,
      tipo: m.tipo as TipoMovimientoCaja,
      medioPago: m.medioPago as MedioPagoTaquilla,
      importeCentavos: m.importeCentavos,
      registradoEn: m.registradoEn,
    })),
  };
}
