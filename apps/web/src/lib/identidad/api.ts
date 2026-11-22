/** Cliente HTTP de la API de Identidad (spec 004, contracts/api-identidad.openapi.yaml). */

export interface Politica {
  version: number;
  url: string;
  vigenteDesde: string;
}

export interface DatosRegistro {
  nombre: string;
  correo: string;
  contrasena: string;
  aceptaPolitica: boolean;
  versionPolitica: number;
  aceptaNovedades: boolean;
}

export class ErrorApiIdentidad extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly codigo?: string,
  ) {
    super(message);
  }
}

export function baseApiUrl(): string {
  if (typeof window !== 'undefined') return process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
  return process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
}

async function pedir<T>(ruta: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set('Content-Type', 'application/json');
  const res = await fetch(`${baseApiUrl()}/api/identidad${ruta}`, { ...init, headers, credentials: 'include', cache: 'no-store' });
  if (!res.ok) {
    let p: { detail?: string; title?: string; codigo?: string } = {};
    try {
      p = await res.json();
    } catch {
      // sin cuerpo
    }
    throw new ErrorApiIdentidad(res.status, p.detail ?? p.title ?? `Error ${res.status}`, p.codigo);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export const apiIdentidad = {
  politica: () => pedir<Politica>('/politica'),
  registrar: (d: DatosRegistro) => pedir<{ mensaje: string }>('/registro', { method: 'POST', body: JSON.stringify(d) }),
  verificar: (token: string) => pedir<{ mensaje: string }>('/verificacion', { method: 'POST', body: JSON.stringify({ token }) }),
  reenviar: (correo: string) => pedir<{ mensaje: string }>('/verificacion/reenvio', { method: 'POST', body: JSON.stringify({ correo }) }),
};
