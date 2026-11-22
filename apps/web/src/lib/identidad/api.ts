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

export interface RolAsignado {
  rol: string;
  alcance: { tipo: 'sede' | 'provincia' | 'disciplina'; valor: string } | null;
}

export interface Yo {
  cuentaId: string;
  nombre: string;
  correo: string;
  correoVerificado: boolean;
  estudianteAcreditado: boolean;
  novedades: boolean;
  roles: RolAsignado[];
  segundoFactorOk: boolean;
  /** Personal: true ⇒ solo verificar el código; false ⇒ dar de alta el TOTP. */
  segundoFactorActivo?: boolean;
  esPersonal?: boolean;
  politicaPendiente: string | null;
}

export interface AltaTotp {
  otpauthUri: string;
  qrSvg: string;
  clave: string;
}

export interface Notificacion {
  id: string;
  plantilla: string;
  asunto: string;
  categoria: 'servicio' | 'opcional';
  estado: 'pendiente' | 'enviada' | 'fallida' | 'omitida';
  intentos: number;
  creadaEn: string;
  enviadaEn: string | null;
  ultimoError?: string | null;
}

export interface CuentaPersonal {
  cuentaId: string;
  nombre: string;
  correo: string;
  estado: 'pendiente_verificacion' | 'verificada' | 'desactivada';
  roles: RolAsignado[];
  segundoFactorActivo: boolean;
}

export interface SesionAbierta {
  id: string;
  dispositivo: string;
  creadaEn: string;
  ultimaActividadEn: string;
  actual: boolean;
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
  ingresar: (correo: string, contrasena: string) => pedir<Yo>('/sesion', { method: 'POST', body: JSON.stringify({ correo, contrasena }) }),
  salir: () => pedir<void>('/sesion', { method: 'DELETE' }),
  yo: () => pedir<Yo>('/yo'),
  actualizar: (cambios: { nombre?: string; novedades?: boolean }) => pedir<Yo>('/yo', { method: 'PATCH', body: JSON.stringify(cambios) }),
  cambiarContrasena: (contrasenaActual: string, contrasenaNueva: string) =>
    pedir<void>('/yo/contrasena', { method: 'PUT', body: JSON.stringify({ contrasenaActual, contrasenaNueva }) }),
  sesiones: () => pedir<SesionAbierta[]>('/yo/sesiones'),
  cerrarSesion: (id: string) => pedir<void>(`/yo/sesiones/${id}`, { method: 'DELETE' }),
  pedirRecuperacion: (correo: string) => pedir<{ mensaje: string }>('/recuperacion', { method: 'POST', body: JSON.stringify({ correo }) }),
  confirmarRecuperacion: (token: string, contrasenaNueva: string) =>
    pedir<void>('/recuperacion/confirmacion', { method: 'POST', body: JSON.stringify({ token, contrasenaNueva }) }),
  altaTotp: () => pedir<AltaTotp>('/segundo-factor/alta', { method: 'POST' }),
  verificarTotp: (codigo: string) => pedir<Yo>('/segundo-factor/verificacion', { method: 'POST', body: JSON.stringify({ codigo }) }),
  personal: () => pedir<CuentaPersonal[]>('/personal'),
  crearPersonal: (d: { nombre: string; correo: string; roles: RolAsignado[] }) => pedir<CuentaPersonal>('/personal', { method: 'POST', body: JSON.stringify(d) }),
  cambiarRoles: (cuentaId: string, roles: RolAsignado[]) => pedir<CuentaPersonal>(`/personal/${cuentaId}/roles`, { method: 'PUT', body: JSON.stringify({ roles }) }),
  cambiarEstado: (cuentaId: string, estado: 'desactivada' | 'verificada') =>
    pedir<void>(`/personal/${cuentaId}/estado`, { method: 'PUT', body: JSON.stringify({ estado }) }),
  restablecerTotp: (cuentaId: string, motivo: string) => pedir<void>(`/personal/${cuentaId}/segundo-factor`, { method: 'DELETE', body: JSON.stringify({ motivo }) }),
  misNotificaciones: (cursor?: string) =>
    pedir<{ items: Notificacion[]; siguiente: string | null }>(`/yo/notificaciones${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`),
  notificacionesFallidas: () => pedir<Notificacion[]>('/notificaciones/fallidas'),
  reenviar: (correo: string) => pedir<{ mensaje: string }>('/verificacion/reenvio', { method: 'POST', body: JSON.stringify({ correo }) }),
};
