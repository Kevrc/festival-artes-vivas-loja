import { z } from 'zod';
import { sobre } from './sobre';

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const instante = z.string().datetime({ offset: true });

export const Disciplina = z.enum(['teatro', 'danza', 'circo', 'musica', 'titeres', 'exposicion', 'taller', 'calle', 'cine']);
export const Componente = z.enum(['internacional', 'nacional', 'camino_a_loja', 'escuela', 'salud_arte']);
export const TipoSede = z.enum(['teatro', 'centro_cultural', 'museo', 'espacio_publico', 'recorrido']);
export const TipoAcceso = z.enum(['pagada', 'gratuita_reserva', 'gratuita_libre', 'restringida']);
export const Publico = z.enum(['familiar', 'adultos', 'estudiantes']);

const punto = z.object({ lat: z.number(), lng: z.number(), nombre: z.string().optional() });

export const EdicionDto = z.object({
  id: z.string().uuid(),
  anio: z.number().int(),
  numero: z.string(),
  fechaInicio: fecha,
  fechaFin: fecha,
  paisInvitado: z.string().optional(),
});

export const FuncionDto = z
  .object({
    id: z.string().uuid(),
    version: z.number().int().min(1),
    inicio: instante,
    fin: instante,
    continua: z.boolean(),
    tipoAcceso: TipoAcceso,
    publico: Publico,
    aforoHabilitado: z.number().int().positive().nullable(),
  })
  .refine((f) => Date.parse(f.fin) > Date.parse(f.inicio), { message: 'fin debe ser posterior a inicio' });

export const ObraDto = z.object({
  id: z.string().uuid(),
  titulo: z.string().min(1),
  sinopsis: z.string(),
  disciplina: Disciplina,
  duracionMin: z.number().int().positive(),
  edadMinima: z.number().int().min(0),
  idioma: z.string().optional(),
  imagenes: z.array(z.string().url()),
  fichaArtistica: z.array(z.object({ rol: z.string(), nombre: z.string() })),
  componente: Componente,
});

export const ElencoDto = z.object({
  id: z.string().uuid(),
  nombre: z.string().min(1),
  pais: z.string().min(1),
  ciudad: z.string().optional(),
});

export const SedeDto = z.object({
  id: z.string().uuid(),
  nombre: z.string().min(1),
  tipo: TipoSede,
  direccion: z.string(),
  lat: z.number(),
  lng: z.number(),
  recorrido: z.array(punto).optional(),
  aforo: z.number().int().positive().optional(),
  accesibilidad: z.object({
    sillaRuedas: z.boolean().optional(),
    banoAccesible: z.boolean().optional(),
    rampa: z.boolean().optional(),
  }),
});

const horario = z.object({ inicio: instante, fin: instante, sedeId: z.string().uuid() });

export const ProgramacionPublicada = sobre(
  'ProgramacionPublicada',
  z.object({ edicion: EdicionDto, funcionIds: z.array(z.string().uuid()) }),
);

const datosFuncion = z.object({ funcion: FuncionDto, obra: ObraDto, elenco: ElencoDto, sede: SedeDto });
export const FuncionProgramada = sobre('FuncionProgramada', datosFuncion);
export const FuncionActualizada = sobre('FuncionActualizada', datosFuncion);

export const FuncionReprogramada = sobre(
  'FuncionReprogramada',
  z.object({
    funcionId: z.string().uuid(),
    version: z.number().int().min(1),
    anterior: horario,
    nuevo: horario,
    motivo: z.string().min(1),
    sede: SedeDto.optional(),
  }),
);

export const FuncionCancelada = sobre(
  'FuncionCancelada',
  z.object({ funcionId: z.string().uuid(), version: z.number().int().min(1) }),
);
