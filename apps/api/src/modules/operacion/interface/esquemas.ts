import { randomUUID } from 'node:crypto';
import { Componente, Disciplina, Publico, TipoAcceso } from '@fiavl/contracts';
import { z } from 'zod';
import { ErrorConCodigo } from '../../../common/http/problema-codigo.filter';
import type { FuncionVista, ObraVista, SedeVista } from '../application/puertos';
import { estadoVisible } from '../domain/tipos';

/** Esquemas de entrada de la API de Operación (contracts/api-operacion.openapi.yaml). */
export const UuidSchema = z.string().uuid();
export const FechaSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'fecha YYYY-MM-DD');
const Instante = z.string().datetime({ offset: true }).transform((s) => new Date(s));
const Aforo = z.number().int().min(1).nullable();

export const FuncionEntradaSchema = z.object({
  obraId: z.string().uuid(),
  sedeId: z.string().uuid(),
  inicio: Instante,
  continua: z.boolean().default(false),
  diasContinua: z.array(FechaSchema).optional(),
  tipoAcceso: TipoAcceso.nullable().default(null),
  publico: Publico,
  aforoHabilitado: Aforo.default(null),
});

export const FuncionEdicionSchema = z
  .object({
    obraId: z.string().uuid(),
    sedeId: z.string().uuid(),
    inicio: Instante,
    fin: Instante,
    tipoAcceso: TipoAcceso.nullable(),
    publico: Publico,
    aforoHabilitado: Aforo,
  })
  .partial()
  .strict();

const ElencoSchema = z.object({
  id: z.string().uuid().optional(),
  nombre: z.string().trim().min(1),
  pais: z.string().trim().min(1),
  ciudad: z.string().trim().min(1).nullable().optional(),
});

export const ObraEntradaSchema = z.object({
  titulo: z.string().trim().min(1),
  sinopsis: z.string(),
  disciplina: Disciplina,
  componente: Componente,
  duracionMin: z.number().int().min(1),
  edadMinima: z.number().int().min(0),
  idioma: z.string().trim().min(1).nullable().default(null),
  imagenes: z.array(z.string().url()).default([]),
  fichaArtistica: z.array(z.object({ rol: z.string(), nombre: z.string() })).default([]),
  fichaTecnica: z.record(z.unknown()).default({}),
  elenco: ElencoSchema,
});

export const FiltroObrasSchema = z.object({
  q: z.string().trim().min(1).optional(),
  origen: z.enum(['invitado', 'convocatoria']).optional(),
  incluirDesistidas: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

/** FR-013: `If-Match: "3"` (también acepta `W/"3"` y `3`). */
export function versionDe(ifMatch: string | undefined): number {
  const m = ifMatch?.match(/^(?:W\/)?"?(\d+)"?$/);
  if (!m) throw new ErrorConCodigo(428, 'version_requerida', 'Falta la cabecera If-Match con la versión del recurso.');
  return Number(m[1]);
}

export const etag = (version: number) => `"${version}"`;

export const correlacionDe = (cabecera: string | undefined) => (cabecera && UuidSchema.safeParse(cabecera).success ? cabecera : randomUUID());

export const aSedeDto = (s: SedeVista) => ({
  id: s.id,
  edicionId: s.edicionId,
  nombre: s.nombre,
  tipo: s.tipo,
  direccion: s.direccion,
  lat: s.lat,
  lng: s.lng,
  ...(Array.isArray(s.recorrido) ? { recorrido: s.recorrido } : {}),
  aforo: s.aforo,
  accesibilidad: s.accesibilidad,
  montajeMin: s.montajeMin,
  horarioTaquilla: typeof s.horarioTaquilla === 'string' ? s.horarioTaquilla : null,
  activa: s.activa,
  version: s.version,
});

export const aObraDto = (o: ObraVista) => ({
  id: o.id,
  titulo: o.titulo,
  sinopsis: o.sinopsis,
  disciplina: o.disciplina,
  componente: o.componente,
  duracionMin: o.duracionMin,
  edadMinima: o.edadMinima,
  ...(o.idioma ? { idioma: o.idioma } : {}),
  imagenes: o.imagenes,
  fichaArtistica: o.fichaArtistica,
  fichaTecnica: o.fichaTecnica,
  elenco: { id: o.elenco.id, nombre: o.elenco.nombre, pais: o.elenco.pais, ...(o.elenco.ciudad ? { ciudad: o.elenco.ciudad } : {}) },
  estado: o.estado,
  origen: o.origen,
  version: o.version,
});

export const aFuncionDto = (f: FuncionVista, ahora: Date) => ({
  id: f.id,
  edicionId: f.edicionId,
  obraId: f.obraId,
  obraTitulo: f.obraTitulo,
  sedeId: f.sedeId,
  elencoId: f.elencoId,
  inicio: f.inicio.toISOString(),
  fin: f.fin.toISOString(),
  continua: f.continua,
  tipoAcceso: f.tipoAcceso,
  publico: f.publico,
  aforoHabilitado: f.aforoHabilitado,
  estado: estadoVisible(f.estado, f.fin, ahora),
  entradasActivas: f.entradasActivas,
  version: f.version,
});
