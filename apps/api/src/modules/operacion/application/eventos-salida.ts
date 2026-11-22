import { randomUUID } from 'node:crypto';
import type { EventoPublicadoOperacion } from '@fiavl/contracts';
import type { EdicionDetalle, FuncionCompleta } from './puertos';

/**
 * Arma los eventos que Operación publica con los contratos existentes de
 * `packages/contracts/src/eventos/operacion.ts` (research R3), que ya consumen Cartelera y Boletería.
 * El publicador los valida con zod antes de encolarlos.
 */
const sobre = (edicionId: string, correlacionId: string, ahora: Date) => ({
  id: randomUUID(),
  version: 1 as const,
  ocurridoEn: ahora.toISOString(),
  edicionId,
  correlacionId,
});

export function datosFuncion({ funcion: f, obra, sede }: FuncionCompleta) {
  if (f.tipoAcceso === null) throw new Error(`La función ${f.id} no tiene tipo de acceso: no se puede publicar`);
  return {
    funcion: {
      id: f.id,
      version: f.version,
      inicio: f.inicio.toISOString(),
      fin: f.fin.toISOString(),
      continua: f.continua,
      tipoAcceso: f.tipoAcceso,
      publico: f.publico,
      aforoHabilitado: f.aforoHabilitado,
    },
    obra: {
      id: obra.id,
      titulo: obra.titulo,
      sinopsis: obra.sinopsis,
      disciplina: obra.disciplina,
      duracionMin: obra.duracionMin,
      edadMinima: obra.edadMinima,
      ...(obra.idioma ? { idioma: obra.idioma } : {}),
      imagenes: obra.imagenes,
      fichaArtistica: obra.fichaArtistica,
      componente: obra.componente,
    },
    elenco: { id: obra.elenco.id, nombre: obra.elenco.nombre, pais: obra.elenco.pais, ...(obra.elenco.ciudad ? { ciudad: obra.elenco.ciudad } : {}) },
    sede: {
      id: sede.id,
      nombre: sede.nombre,
      tipo: sede.tipo,
      direccion: sede.direccion,
      lat: sede.lat,
      lng: sede.lng,
      ...(Array.isArray(sede.recorrido) ? { recorrido: sede.recorrido as { lat: number; lng: number; nombre?: string }[] } : {}),
      ...(sede.aforo !== null ? { aforo: sede.aforo } : {}),
      accesibilidad: sede.accesibilidad,
    },
  };
}

export const funcionProgramada = (c: FuncionCompleta, correlacionId: string, ahora: Date): EventoPublicadoOperacion => ({
  ...sobre(c.funcion.edicionId, correlacionId, ahora),
  tipo: 'FuncionProgramada',
  datos: datosFuncion(c),
});

export const programacionPublicada = (e: EdicionDetalle, funcionIds: string[], correlacionId: string, ahora: Date): EventoPublicadoOperacion => ({
  ...sobre(e.id, correlacionId, ahora),
  tipo: 'ProgramacionPublicada',
  datos: {
    edicion: {
      id: e.id,
      anio: e.anio,
      numero: e.numero,
      fechaInicio: e.fechaInicio,
      fechaFin: e.fechaFin,
      ...(e.paisInvitado ? { paisInvitado: e.paisInvitado } : {}),
      precioCentavos: e.precioCentavos,
      maxPagadasPersona: e.maxPagadasPersona,
      maxReservasPersona: e.maxReservasPersona,
    },
    funcionIds,
  },
});

export const funcionActualizada = (c: FuncionCompleta, correlacionId: string, ahora: Date): EventoPublicadoOperacion => ({
  ...sobre(c.funcion.edicionId, correlacionId, ahora),
  tipo: 'FuncionActualizada',
  datos: datosFuncion(c),
});

interface Horario {
  inicio: Date;
  fin: Date;
  sedeId: string;
}
const aHorario = (h: Horario) => ({ inicio: h.inicio.toISOString(), fin: h.fin.toISOString(), sedeId: h.sedeId });

/** US3-AS1. `sede` va solo cuando cambia (contrato FuncionReprogramada). */
export const funcionReprogramada = (
  c: FuncionCompleta,
  anterior: Horario,
  motivo: string,
  cambioSede: boolean,
  correlacionId: string,
  ahora: Date,
): EventoPublicadoOperacion => ({
  ...sobre(c.funcion.edicionId, correlacionId, ahora),
  tipo: 'FuncionReprogramada',
  datos: {
    funcionId: c.funcion.id,
    version: c.funcion.version,
    anterior: aHorario(anterior),
    nuevo: aHorario(c.funcion),
    motivo,
    ...(cambioSede ? { sede: datosFuncion(c).sede } : {}),
  },
});

/** US3-AS3: Boletería anula entradas e inicia devoluciones al recibirlo. */
export const funcionCancelada = (edicionId: string, funcionId: string, version: number, correlacionId: string, ahora: Date): EventoPublicadoOperacion => ({
  ...sobre(edicionId, correlacionId, ahora),
  tipo: 'FuncionCancelada',
  datos: { funcionId, version },
});

export const aforoCambiado = (
  edicionId: string,
  funcionId: string,
  version: number,
  aforoAnterior: number | null,
  aforoHabilitado: number | null,
  correlacionId: string,
  ahora: Date,
): EventoPublicadoOperacion => ({
  ...sobre(edicionId, correlacionId, ahora),
  tipo: 'AforoCambiado',
  datos: { funcionId, version, aforoAnterior: aforoAnterior ?? 0, aforoHabilitado: aforoHabilitado ?? 0 },
});
