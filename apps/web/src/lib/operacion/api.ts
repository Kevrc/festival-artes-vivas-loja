import type { ApiOperacion } from '@fiavl/contracts';

/** Cliente HTTP tipado de la API de Operación (spec 004, contracts/api-operacion.openapi.yaml). */
type Schemas = ApiOperacion.components['schemas'];

export type Edicion = Schemas['Edicion'];
export type Sede = Schemas['Sede'];
export type Obra = Schemas['Obra'];
export type ObraEntrada = Schemas['ObraEntrada'];
export type Funcion = Schemas['Funcion'];
export type FuncionEntrada = Schemas['FuncionEntrada'];
export type FuncionEdicion = Schemas['FuncionEdicion'];
export type Grilla = Schemas['Grilla'];
export type Conflicto = Schemas['Conflicto'];
export type ValidacionPublicacion = Schemas['ValidacionPublicacion'];
export type CambioFuncion = Schemas['CambioFuncion'];
export type Reprogramacion = Schemas['Reprogramacion'];
export type RolOperacion = 'programador' | 'direccion' | 'jefe_sala' | 'administrador';

/**
 * shortcut: sesión de demostración hasta que Identidad (US8) dé inicio de sesión real. Se manda
 * en las cabeceras `x-*-dev`, que la API solo acepta en development/test (falla cerrado).
 */
export interface SesionDevOperacion {
  cuentaId: string;
  rol: RolOperacion;
  /** Alcance de sede para jefe de sala. */
  sedeId?: string;
}

const CLAVE_SESION = 'fiavl.sesion_dev_operacion';

export function baseApiUrl(): string {
  if (typeof window !== 'undefined') return process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
  return process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
}

export function leerSesionDev(): SesionDevOperacion | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(CLAVE_SESION);
    return raw ? (JSON.parse(raw) as SesionDevOperacion) : null;
  } catch {
    return null;
  }
}

export function guardarSesionDev(sesion: SesionDevOperacion | null): void {
  try {
    if (sesion) window.localStorage.setItem(CLAVE_SESION, JSON.stringify(sesion));
    else window.localStorage.removeItem(CLAVE_SESION);
  } catch {
    // almacenamiento bloqueado: la sesión dura lo que la página
  }
}

export class ErrorApiOperacion extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly codigo?: string,
    readonly conflictos: Conflicto[] = [],
    readonly versionVigente?: number,
    /** Errores de validación de la publicación (422, US2-AS2). */
    readonly errores: ValidacionPublicacion['errores'] = [],
    /** Entradas activas por encima del nuevo aforo (409 `exceso_aforo`, US3-AS2). */
    readonly exceso?: number,
  ) {
    super(message);
  }
}

async function pedir<T>(ruta: string, init: RequestInit & { version?: number } = {}): Promise<{ datos: T; version?: number }> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set('Content-Type', 'application/json');
  if (init.version !== undefined) headers.set('If-Match', `"${init.version}"`);
  const sesion = leerSesionDev();
  if (sesion) {
    headers.set('x-cuenta-dev', sesion.cuentaId);
    headers.set('x-roles-dev', sesion.sedeId ? `${sesion.rol}@sede:${sesion.sedeId}` : sesion.rol);
  }
  const res = await fetch(`${baseApiUrl()}/api/operacion${ruta}`, { ...init, headers, credentials: 'include', cache: 'no-store' });
  if (!res.ok) {
    let p: { detail?: string; title?: string; codigo?: string; conflictos?: Conflicto[]; version?: number; errores?: ValidacionPublicacion['errores']; exceso?: number } = {};
    try {
      p = await res.json();
    } catch {
      // sin cuerpo
    }
    throw new ErrorApiOperacion(res.status, p.detail ?? p.title ?? `Error ${res.status}`, p.codigo, p.conflictos ?? [], p.version, p.errores ?? [], p.exceso);
  }
  const etag = res.headers.get('ETag')?.match(/\d+/)?.[0];
  const datos = res.status === 204 ? (undefined as T) : ((await res.json()) as T);
  return { datos, version: etag ? Number(etag) : undefined };
}

const json = (cuerpo: unknown) => JSON.stringify(cuerpo);

export interface Incidencia {
  id: string;
  sedeId: string;
  funcionId?: string;
  tipo: 'retraso' | 'falla_tecnica' | 'clima' | 'emergencia_medica' | 'aforo_superado' | 'conflicto_ingreso' | 'desistimiento' | 'otra';
  descripcion: string;
  afectaPublico: boolean;
  origen: 'manual' | 'automatica';
  estado: 'abierta' | 'atendida';
  ofrecerReprogramar?: boolean;
  ocurridaEn: string;
}

export interface IncidenciaEntrada {
  sedeId: string;
  funcionId?: string;
  tipo: 'retraso' | 'falla_tecnica' | 'clima' | 'emergencia_medica' | 'aforo_superado' | 'otra';
  descripcion: string;
  afectaPublico: boolean;
}

export interface Conteo {
  id: string;
  funcionId: string;
  cantidad: number;
  metodo: string;
  registradoEn: string;
}

export type Dimension = 'dia' | 'sede' | 'disciplina' | 'componente' | 'pais' | 'funcion';

export interface FilaIndicador {
  clave: string;
  etiqueta: string;
  funcionesRealizadas: number;
  funcionesCanceladas: number;
  entradasEmitidas: number;
  ingresosValidados: number;
  asistenciaEstimada: number;
  asistenciaTotal: number;
  ocupacion: number | null;
  recaudacionCentavos: number;
}

export interface Indicadores {
  dimension: Dimension;
  totales: FilaIndicador;
  filas: FilaIndicador[];
  actualizadoEn: string;
}

export interface FiltroIndicadores {
  dimension: Dimension;
  desde?: string;
  hasta?: string;
  sedeId?: string;
}

export interface InformeCierre {
  edicionId: string;
  anio: number;
  generadoEn: string;
  actividades: number;
  elencos: number;
  obras: number;
  paises: number;
  asistenciaValidada: number;
  asistenciaEstimada: number;
  asistenciaTotal: number;
  ocupacionMedia: number | null;
  recaudacionCentavos: number;
  variacion: Record<string, number> | null;
  anterior: { anio: number; fuente: 'informe' | 'cifras_historicas' } | null;
}

const consulta = (f: FiltroIndicadores) => new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]).toString();

export const apiOperacion = {
  ediciones: async () => (await pedir<Edicion[]>('/ediciones')).datos,
  grilla: async (edicionId: string, fecha: string) => (await pedir<Grilla>(`/ediciones/${edicionId}/grilla?fecha=${fecha}`)).datos,
  obras: async (edicionId: string, filtro: { q?: string; origen?: 'invitado' | 'convocatoria' } = {}) => {
    const qs = new URLSearchParams(Object.entries(filtro).filter(([, v]) => v) as [string, string][]);
    return (await pedir<Obra[]>(`/ediciones/${edicionId}/obras${qs.size ? `?${qs}` : ''}`)).datos;
  },
  crearObra: async (edicionId: string, obra: ObraEntrada) =>
    (await pedir<Obra>(`/ediciones/${edicionId}/obras`, { method: 'POST', body: json(obra) })).datos,
  funcion: async (id: string) => (await pedir<Funcion>(`/funciones/${id}`)).datos,
  crearFuncion: async (edicionId: string, f: FuncionEntrada) =>
    (await pedir<Funcion>(`/ediciones/${edicionId}/funciones`, { method: 'POST', body: json(f) })).datos,
  editarFuncion: async (id: string, version: number, cambios: FuncionEdicion) =>
    (await pedir<Funcion>(`/funciones/${id}`, { method: 'PATCH', body: json(cambios), version })).datos,
  validarPublicacion: async (edicionId: string) => (await pedir<ValidacionPublicacion>(`/ediciones/${edicionId}/publicacion/validacion`)).datos,
  publicarEdicion: async (edicionId: string, claveIdempotencia: string) =>
    (await pedir<{ funcionesPublicadas: number }>(`/ediciones/${edicionId}/publicacion`, { method: 'POST', headers: { 'Idempotency-Key': claveIdempotencia } })).datos,
  publicarFuncion: async (id: string, version: number) => (await pedir<Funcion>(`/funciones/${id}/publicacion`, { method: 'POST', version })).datos,
  sedes: async (edicionId: string) => (await pedir<Sede[]>(`/ediciones/${edicionId}/sedes`)).datos,
  incidencias: async (edicionId: string, filtro: { sedeId?: string; fecha?: string } = {}) => {
    const qs = new URLSearchParams(Object.entries(filtro).filter(([, v]) => v) as [string, string][]);
    return (await pedir<Incidencia[]>(`/ediciones/${edicionId}/incidencias${qs.size ? `?${qs}` : ''}`)).datos;
  },
  registrarIncidencia: async (edicionId: string, i: IncidenciaEntrada, claveIdempotencia: string) =>
    (await pedir<Incidencia>(`/ediciones/${edicionId}/incidencias`, { method: 'POST', body: json(i), headers: { 'Idempotency-Key': claveIdempotencia } })).datos,
  atenderIncidencia: async (id: string) => (await pedir<Incidencia>(`/incidencias/${id}`, { method: 'PATCH', body: json({ estado: 'atendida' }) })).datos,
  registrarConteo: async (funcionId: string, cantidad: number, metodo: string, claveIdempotencia: string) =>
    (await pedir<Conteo>(`/funciones/${funcionId}/conteos`, { method: 'POST', body: json({ cantidad, metodo }), headers: { 'Idempotency-Key': claveIdempotencia } })).datos,
  indicadores: async (edicionId: string, f: FiltroIndicadores) => (await pedir<Indicadores>(`/ediciones/${edicionId}/indicadores?${consulta(f)}`)).datos,
  /** US5-AS3: el CSV con los mismos filtros, como archivo para descargar. */
  indicadoresCsv: async (edicionId: string, f: FiltroIndicadores): Promise<Blob> => {
    const headers = new Headers();
    const sesion = leerSesionDev();
    if (sesion) {
      headers.set('x-cuenta-dev', sesion.cuentaId);
      headers.set('x-roles-dev', sesion.rol);
    }
    const res = await fetch(`${baseApiUrl()}/api/operacion/ediciones/${edicionId}/indicadores.csv?${consulta(f)}`, { headers, credentials: 'include', cache: 'no-store' });
    if (!res.ok) throw new ErrorApiOperacion(res.status, `No se pudo exportar (error ${res.status})`);
    return res.blob();
  },
  informe: async (edicionId: string) => (await pedir<InformeCierre>(`/ediciones/${edicionId}/informe`)).datos,
  regenerarInforme: async (edicionId: string) => (await pedir<InformeCierre>(`/ediciones/${edicionId}/informe`, { method: 'POST' })).datos,
  historial: async (id: string) => (await pedir<CambioFuncion[]>(`/funciones/${id}/cambios`)).datos,
  reprogramar: async (id: string, version: number, r: Reprogramacion) =>
    (await pedir<Funcion>(`/funciones/${id}/reprogramacion`, { method: 'POST', body: json(r), version })).datos,
  cancelar: async (id: string, version: number, motivo: string) =>
    (await pedir<Funcion>(`/funciones/${id}/cancelacion`, { method: 'POST', body: json({ motivo }), version })).datos,
  eliminarFuncion: async (id: string, version: number) => {
    await pedir<void>(`/funciones/${id}`, { method: 'DELETE', version });
  },
};

export { diaFestival, diasEntre, fechaLarga, horaDeInicio, horaLoja } from './formato';
