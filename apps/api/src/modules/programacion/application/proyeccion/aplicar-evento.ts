import { EventoCartelera } from '@fiavl/contracts';
import { diaFestival } from '../../domain/dia-festival';
import { nivelDisponibilidad } from '../../domain/reglas-dia';
import type { EscrituraProyeccion, RepositorioCartelera, Revalidador } from '../puertos';

export interface ResultadoAplicacion {
  aplicado: boolean;
  etiquetas: string[];
}

/** Días AAAA-MM-DD entre dos fechas inclusive. */
function diasEntre(desde: string, hasta: string): string[] {
  const dias: string[] = [];
  for (let d = new Date(`${desde}T00:00:00Z`); d <= new Date(`${hasta}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    dias.push(d.toISOString().slice(0, 10));
  }
  return dias;
}

const etiquetasDia = (desde: string, hasta: string, continua: boolean) =>
  (continua ? diasEntre(desde, hasta) : [desde]).map((d) => `dia:${d}`);

/**
 * Aplica un evento de Operación o Boletería a la proyección de la cartelera
 * (contracts/eventos-consumidos.md) y revalida las páginas afectadas (research R5).
 */
export class AplicarEvento {
  constructor(
    private readonly repo: RepositorioCartelera,
    private readonly revalidador: Revalidador,
  ) {}

  async ejecutar(entrada: unknown): Promise<ResultadoAplicacion> {
    const evento = EventoCartelera.parse(entrada);
    const etiquetas = await this.repo.procesarUnaVez(evento.id, evento.tipo, (w) => aplicar(w, evento));
    if (etiquetas === null) return { aplicado: false, etiquetas: [] };
    const unicas = [...new Set(etiquetas)];
    if (unicas.length) await this.revalidador.revalidar(unicas);
    return { aplicado: true, etiquetas: unicas };
  }
}

async function aplicar(w: EscrituraProyeccion, e: EventoCartelera): Promise<string[]> {
  switch (e.tipo) {
    case 'ProgramacionPublicada': {
      await w.publicarEdicion(e.datos.edicion);
      return ['edicion', ...etiquetasDia(e.datos.edicion.fechaInicio, e.datos.edicion.fechaFin, true)];
    }
    case 'FuncionProgramada':
    case 'FuncionActualizada': {
      const { funcion, obra, elenco, sede } = e.datos;
      const previa = await w.funcion(funcion.id);
      if (previa && previa.versionOrigen >= funcion.version) return [];
      const dia = diaFestival(new Date(funcion.inicio));
      const diaFin = diaFestival(new Date(funcion.fin));
      await w.asegurarEdicion(e.edicionId, dia);
      await w.guardarFuncion(e.edicionId, e.datos, {
        diaFestival: dia,
        diaFin,
        nivel: nivelDisponibilidad(funcion.tipoAcceso, null, funcion.aforoHabilitado),
      });
      return [
        'edicion',
        ...etiquetasDia(dia, diaFin, funcion.continua),
        ...(previa ? etiquetasDia(previa.diaFestival, previa.diaFin, previa.continua) : []),
        `obra:${obra.id}`,
        `elenco:${elenco.id}`,
        `sede:${sede.id}`,
      ];
    }
    case 'FuncionReprogramada': {
      const previa = await w.funcion(e.datos.funcionId);
      if (!previa || previa.versionOrigen >= e.datos.version) return [];
      if (e.datos.sede) await w.guardarSede(e.datos.sede);
      const dia = diaFestival(new Date(e.datos.nuevo.inicio));
      const diaFin = diaFestival(new Date(e.datos.nuevo.fin));
      await w.reprogramar(e.datos.funcionId, e.datos.version, e.datos.anterior, e.datos.nuevo, { diaFestival: dia, diaFin });
      return [
        ...etiquetasDia(previa.diaFestival, previa.diaFin, previa.continua),
        ...etiquetasDia(dia, diaFin, previa.continua),
        `obra:${previa.obraId}`,
        `elenco:${previa.elencoId}`,
        `sede:${previa.sedeId}`,
        `sede:${e.datos.nuevo.sedeId}`,
      ];
    }
    case 'FuncionCancelada': {
      const previa = await w.funcion(e.datos.funcionId);
      if (!previa || previa.versionOrigen >= e.datos.version) return [];
      await w.cancelar(e.datos.funcionId, e.datos.version);
      return [
        ...etiquetasDia(previa.diaFestival, previa.diaFin, previa.continua),
        `obra:${previa.obraId}`,
        `elenco:${previa.elencoId}`,
        `sede:${previa.sedeId}`,
      ];
    }
    case 'DisponibilidadCambiada': {
      const previa = await w.funcion(e.datos.funcionId);
      const calculadoEn = new Date(e.datos.calculadoEn);
      if (!previa || (previa.disponibilidadActualizadaEn && previa.disponibilidadActualizadaEn >= calculadoEn)) return [];
      await w.guardarDisponibilidad(e.datos.funcionId, {
        lugaresRestantes: e.datos.lugaresRestantes,
        aforoHabilitado: e.datos.aforoHabilitado,
        nivel: nivelDisponibilidad(previa.tipoAcceso, e.datos.lugaresRestantes, e.datos.aforoHabilitado),
        calculadoEn,
      });
      // La disponibilidad se sirve aparte con caché de 15 s (research R4): no revalida páginas.
      return [];
    }
  }
}
