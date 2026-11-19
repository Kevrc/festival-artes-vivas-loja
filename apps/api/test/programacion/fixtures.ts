import { ejemplo } from '@fiavl/contracts';
import { PrismaClient } from '../../src/generated/prisma/index.js';

export const nuevoId = () => crypto.randomUUID();

/** Datos de un FuncionProgramada válido, con valores por defecto sobreescribibles. */
export function datosFuncion(p: {
  edicionId: string;
  funcionId?: string;
  obraId?: string;
  sedeId?: string;
  version?: number;
  inicio?: string;
  fin?: string;
  continua?: boolean;
  titulo?: string;
  elenco?: string;
  pais?: string;
  tipoAcceso?: 'pagada' | 'gratuita_reserva' | 'gratuita_libre' | 'restringida';
  disciplina?: 'teatro' | 'danza' | 'circo' | 'musica' | 'titeres' | 'exposicion' | 'taller' | 'calle' | 'cine';
  sedeNombre?: string;
  aforoHabilitado?: number | null;
}) {
  return {
    funcion: {
      id: p.funcionId ?? nuevoId(),
      version: p.version ?? 1,
      inicio: p.inicio ?? '2026-11-14T19:00:00-05:00',
      fin: p.fin ?? '2026-11-14T20:30:00-05:00',
      continua: p.continua ?? false,
      tipoAcceso: p.tipoAcceso ?? 'pagada',
      publico: 'familiar' as const,
      aforoHabilitado: p.aforoHabilitado === undefined ? 300 : p.aforoHabilitado,
    },
    obra: {
      id: p.obraId ?? nuevoId(),
      titulo: p.titulo ?? 'Obra de prueba',
      sinopsis: 'Sinopsis',
      disciplina: p.disciplina ?? ('teatro' as const),
      duracionMin: 90,
      edadMinima: 0,
      imagenes: [],
      fichaArtistica: [],
      componente: 'nacional' as const,
    },
    elenco: { id: nuevoId(), nombre: p.elenco ?? 'Elenco de prueba', pais: p.pais ?? 'Ecuador' },
    sede: {
      id: p.sedeId ?? nuevoId(),
      nombre: p.sedeNombre ?? 'Teatro Bolívar',
      tipo: 'teatro' as const,
      direccion: 'Calle Bolívar, Loja',
      lat: -3.996,
      lng: -79.201,
      accesibilidad: { sillaRuedas: true },
    },
  };
}

export const edicion2026 = (id: string) =>
  ejemplo.programacionPublicada(id, {
    edicion: { id, anio: 2026, numero: 'XI', fechaInicio: '2026-11-12', fechaFin: '2026-11-22', paisInvitado: 'Alemania' },
    funcionIds: [],
  });

export async function limpiar(db: PrismaClient) {
  await db.$executeRawUnsafe(
    'TRUNCATE programacion.favorito, programacion.funcion_cartelera, programacion.obra_cartelera, programacion.sede_cartelera, programacion.edicion_cartelera, programacion.evento_procesado CASCADE',
  );
}
