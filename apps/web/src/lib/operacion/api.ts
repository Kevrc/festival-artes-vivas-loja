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
    let p: { detail?: string; title?: string; codigo?: string; conflictos?: Conflicto[]; version?: number } = {};
    try {
      p = await res.json();
    } catch {
      // sin cuerpo
    }
    throw new ErrorApiOperacion(res.status, p.detail ?? p.title ?? `Error ${res.status}`, p.codigo, p.conflictos ?? [], p.version);
  }
  const etag = res.headers.get('ETag')?.match(/\d+/)?.[0];
  const datos = res.status === 204 ? (undefined as T) : ((await res.json()) as T);
  return { datos, version: etag ? Number(etag) : undefined };
}

const json = (cuerpo: unknown) => JSON.stringify(cuerpo);

export const apiOperacion = {
  ediciones: async () => (await pedir<Edicion[]>('/ediciones')).datos,
  grilla: async (edicionId: string, fecha: string) => (await pedir<Grilla>(`/ediciones/${edicionId}/grilla?fecha=${fecha}`)).datos,
  obras: async (edicionId: string, filtro: { q?: string; origen?: 'invitado' | 'convocatoria' } = {}) => {
    const qs = new URLSearchParams(Object.entries(filtro).filter(([, v]) => v) as [string, string][]);
    return (await pedir<Obra[]>(`/ediciones/${edicionId}/obras${qs.size ? `?${qs}` : ''}`)).datos;
  },
  crearObra: async (edicionId: string, obra: ObraEntrada) =>
    (await pedir<Obra>(`/ediciones/${edicionId}/obras`, { method: 'POST', body: json(obra) })).datos,
  crearFuncion: async (edicionId: string, f: FuncionEntrada) =>
    (await pedir<Funcion>(`/ediciones/${edicionId}/funciones`, { method: 'POST', body: json(f) })).datos,
  editarFuncion: async (id: string, version: number, cambios: FuncionEdicion) =>
    (await pedir<Funcion>(`/funciones/${id}`, { method: 'PATCH', body: json(cambios), version })).datos,
  eliminarFuncion: async (id: string, version: number) => {
    await pedir<void>(`/funciones/${id}`, { method: 'DELETE', version });
  },
};

export { diasEntre, fechaLarga, horaDeInicio, horaLoja } from './formato';
