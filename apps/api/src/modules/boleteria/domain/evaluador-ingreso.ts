import type { CodigoValidacion, EstadoEntrada, SemaforoValidacion } from './tipos';

const SESENTA_MINUTOS_MS = 60 * 60_000;
const UN_MINUTO_MS = 60_000;

export interface EntradaEvaluada {
  id: string;
  funcionId: string;
  estado: EstadoEntrada;
  usadaEn?: Date | null;
  dispositivoAnterior?: string | null;
  puertaAnterior?: string | null;
  funcionCorrecta?: { obraTitulo: string; sedeNombre: string; inicio: Date } | null;
}

export interface ResultadoEvaluacionEscaneo {
  semaforo: SemaforoValidacion;
  codigo: CodigoValidacion;
  mensaje: string;
  entradaId: string | null;
  usadaEn: Date | null;
  puertaAnterior: string | null;
  funcionCorrecta: { obraTitulo: string; sedeNombre: string; inicio: Date } | null;
}

/** RN-003: La validación se acepta desde 60 minutos antes del inicio hasta el fin de la función. */
export function validarVentanaIngreso(p: { inicio: Date; fin: Date; ahora: Date }): boolean {
  const t = p.ahora.getTime();
  return t >= p.inicio.getTime() - SESENTA_MINUTOS_MS && t <= p.fin.getTime();
}

/** Regla semafórica de validación en puerta (US2): verde, ámbar (< 1 min mismo dispositivo) o rojo con motivo. */
export function evaluarEscaneoEntrada(p: {
  entrada: EntradaEvaluada | null;
  firmaValida: boolean;
  funcionAbiertaId: string;
  inicioFuncion: Date;
  finFuncion: Date;
  ahora: Date;
  dispositivoId: string;
}): ResultadoEvaluacionEscaneo {
  if (!p.firmaValida) {
    return rojo('firma_invalida', 'Código QR inválido o alterado.', null);
  }
  if (!p.entrada) {
    return rojo('no_encontrada', 'Entrada no encontrada para esta función.', null);
  }
  if (p.entrada.funcionId !== p.funcionAbiertaId) {
    return {
      semaforo: 'rojo',
      codigo: 'otra_funcion',
      mensaje: 'Esta entrada corresponde a otra función.',
      entradaId: p.entrada.id,
      usadaEn: null,
      puertaAnterior: null,
      funcionCorrecta: p.entrada.funcionCorrecta ?? null,
    };
  }
  if (!validarVentanaIngreso({ inicio: p.inicioFuncion, fin: p.finFuncion, ahora: p.ahora })) {
    return rojo('fuera_de_horario', 'Validación disponible desde 60 minutos antes hasta el fin de la función.', p.entrada.id);
  }
  if (p.entrada.estado === 'anulada') {
    return rojo('anulada', 'Entrada anulada por cancelación o devolución.', p.entrada.id);
  }
  if (p.entrada.estado === 'liberada') {
    return rojo('liberada', 'Reserva liberada por no presentarse 10 minutos antes del inicio.', p.entrada.id);
  }
  if (p.entrada.estado === 'usada') {
    const usadaEn = p.entrada.usadaEn ?? null;
    const mismoDispositivo = p.entrada.dispositivoAnterior === p.dispositivoId;
    const haceMenosDeUnMinuto = usadaEn !== null && p.ahora.getTime() - usadaEn.getTime() < UN_MINUTO_MS;
    if (mismoDispositivo && haceMenosDeUnMinuto) {
      return {
        semaforo: 'ambar',
        codigo: 'doble_lectura_reciente',
        mensaje: 'Ya validada hace menos de 1 minuto en este dispositivo.',
        entradaId: p.entrada.id,
        usadaEn,
        puertaAnterior: p.entrada.puertaAnterior ?? null,
        funcionCorrecta: null,
      };
    }
    return {
      semaforo: 'rojo',
      codigo: 'ya_usada',
      mensaje: `Entrada ya usada${p.entrada.puertaAnterior ? ` en ${p.entrada.puertaAnterior}` : ''}.`,
      entradaId: p.entrada.id,
      usadaEn,
      puertaAnterior: p.entrada.puertaAnterior ?? null,
      funcionCorrecta: null,
    };
  }
  return {
    semaforo: 'verde',
    codigo: 'valida',
    mensaje: 'Entrada válida. Ingreso autorizado.',
    entradaId: p.entrada.id,
    usadaEn: null,
    puertaAnterior: null,
    funcionCorrecta: null,
  };
}

function rojo(codigo: CodigoValidacion, mensaje: string, entradaId: string | null): ResultadoEvaluacionEscaneo {
  return {
    semaforo: 'rojo',
    codigo,
    mensaje,
    entradaId,
    usadaEn: null,
    puertaAnterior: null,
    funcionCorrecta: null,
  };
}
