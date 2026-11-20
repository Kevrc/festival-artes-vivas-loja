import { randomUUID } from 'node:crypto';
import type {
  AforoExcedido,
  ConflictoDeIngreso,
  DisponibilidadCambiada,
  DisponibilidadCambiada as _D,
  EntradasEmitidas,
  IngresoRegistrado,
  PedidoReembolsado,
} from '@fiavl/contracts';
import type z from 'zod';
import { calcularDisponibilidad } from '../../domain/reglas-aforo';
import type { FuncionConEdicion, PedidoRegistro, PublicadorEventosBoleteria } from '../puertos';

function sobreBase(edicionId: string, correlacionId: string, ahora: Date) {
  return {
    id: randomUUID(),
    version: 1 as const,
    ocurridoEn: ahora.toISOString(),
    edicionId,
    correlacionId,
  };
}

export async function publicarDisponibilidad(
  publicador: PublicadorEventosBoleteria,
  fn: FuncionConEdicion,
  ahora: Date,
  correlacionId: string,
): Promise<void> {
  if (fn.tipoAcceso === 'gratuita_libre' || fn.aforoHabilitado <= 0) return;
  const lugaresRestantes =
    fn.estadoFuncion === 'cancelada'
      ? 0
      : calcularDisponibilidad({
          aforoHabilitado: fn.aforoHabilitado,
          emitidos: fn.emitidos,
          retenidos: fn.retenidos,
        });

  const evento: z.infer<typeof DisponibilidadCambiada> = {
    ...sobreBase(fn.edicionId, correlacionId, ahora),
    tipo: 'DisponibilidadCambiada',
    datos: {
      funcionId: fn.funcionId,
      lugaresRestantes,
      aforoHabilitado: fn.aforoHabilitado,
      calculadoEn: ahora.toISOString(),
    },
  };
  const esTerminal = lugaresRestantes === 0 || fn.estadoFuncion === 'cancelada';
  await publicador.publicar(evento, esTerminal ? undefined : { singletonKey: fn.funcionId, singletonSeconds: 5 });
}

export async function publicarEntradasEmitidas(
  publicador: PublicadorEventosBoleteria,
  p: { pedido: PedidoRegistro; edicionId: string; ahora: Date; correlacionId: string },
): Promise<void> {
  if (p.pedido.entradas.length === 0) return;
  const evento: z.infer<typeof EntradasEmitidas> = {
    ...sobreBase(p.edicionId, p.correlacionId, p.ahora),
    tipo: 'EntradasEmitidas',
    datos: {
      pedidoId: p.pedido.id,
      funcionId: p.pedido.funcionId,
      sedeId: p.pedido.sedeId,
      canal: p.pedido.canal,
      tipo: p.pedido.tipo,
      cantidad: p.pedido.cantidad,
      importeCentavos: p.pedido.importeCentavos,
      ...(p.pedido.cuentaId ? { cuentaId: p.pedido.cuentaId } : {}),
      ...(p.pedido.correoComprador ? { correoDestino: p.pedido.correoComprador } : {}),
      entradas: p.pedido.entradas.map((e) => ({
        entradaId: e.id,
        codigoCorto: e.codigoCorto,
        tokenQr: e.tokenQr,
      })),
    },
  };
  await publicador.publicar(evento);
}

export async function publicarPedidoReembolsado(
  publicador: PublicadorEventosBoleteria,
  p: {
    pedido: PedidoRegistro;
    edicionId: string;
    motivo: 'funcion_cancelada' | 'funcion_reprogramada' | 'pago_tardio_sin_cupo' | 'plazo_7_dias_vencido';
    ahora: Date;
    correlacionId: string;
  },
): Promise<void> {
  if (p.pedido.importeCentavos <= 0) return;
  const canal = p.pedido.canal === 'taquilla' ? 'taquilla' : 'web';
  const evento: z.infer<typeof PedidoReembolsado> = {
    ...sobreBase(p.edicionId, p.correlacionId, p.ahora),
    tipo: 'PedidoReembolsado',
    datos: {
      pedidoId: p.pedido.id,
      funcionId: p.pedido.funcionId,
      sedeId: p.pedido.sedeId,
      importeCentavos: p.pedido.importeCentavos,
      canal,
      motivo: p.motivo,
      ...(p.pedido.cuentaId ? { cuentaId: p.pedido.cuentaId } : {}),
      ...(p.pedido.correoComprador ? { correoDestino: p.pedido.correoComprador } : {}),
    },
  };
  await publicador.publicar(evento);
}

export async function publicarIngresoRegistrado(
  publicador: PublicadorEventosBoleteria,
  p: {
    ingresoId: string;
    entradaId: string;
    funcionId: string;
    sedeId: string;
    edicionId: string;
    validadorId: string;
    escaneadoEn: Date;
    diferido: boolean;
    ahora: Date;
    correlacionId: string;
  },
): Promise<void> {
  const evento: z.infer<typeof IngresoRegistrado> = {
    ...sobreBase(p.edicionId, p.correlacionId, p.ahora),
    tipo: 'IngresoRegistrado',
    datos: {
      ingresoId: p.ingresoId,
      entradaId: p.entradaId,
      funcionId: p.funcionId,
      sedeId: p.sedeId,
      validadorId: p.validadorId,
      escaneadoEn: p.escaneadoEn.toISOString(),
      diferido: p.diferido,
    },
  };
  await publicador.publicar(evento);
}

export async function publicarConflictoDeIngreso(
  publicador: PublicadorEventosBoleteria,
  p: {
    entradaId: string;
    funcionId: string;
    sedeId: string;
    edicionId: string;
    primerDispositivoId: string;
    segundoDispositivoId: string;
    detectadoEn: Date;
    correlacionId: string;
  },
): Promise<void> {
  const evento: z.infer<typeof ConflictoDeIngreso> = {
    ...sobreBase(p.edicionId, p.correlacionId, p.detectadoEn),
    tipo: 'ConflictoDeIngreso',
    datos: {
      entradaId: p.entradaId,
      funcionId: p.funcionId,
      sedeId: p.sedeId,
      primerDispositivoId: p.primerDispositivoId,
      segundoDispositivoId: p.segundoDispositivoId,
      detectadoEn: p.detectadoEn.toISOString(),
    },
  };
  await publicador.publicar(evento);
}

export async function publicarAforoExcedido(
  publicador: PublicadorEventosBoleteria,
  p: {
    funcionId: string;
    sedeId: string;
    edicionId: string;
    aforoHabilitado: number;
    entradasActivas: number;
    exceso: number;
    ahora: Date;
    correlacionId: string;
  },
): Promise<void> {
  const evento: z.infer<typeof AforoExcedido> = {
    ...sobreBase(p.edicionId, p.correlacionId, p.ahora),
    tipo: 'AforoExcedido',
    datos: {
      funcionId: p.funcionId,
      sedeId: p.sedeId,
      aforoHabilitado: p.aforoHabilitado,
      entradasActivas: p.entradasActivas,
      exceso: p.exceso,
    },
  };
  await publicador.publicar(evento);
}
