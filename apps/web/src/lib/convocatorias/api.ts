export const API_CONVOCATORIAS = `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'}/api/convocatorias`;

export interface ConvocatoriaPublica {
  id: string; codigo: string; componente: string; provincia: string | null; abreEn: string; cierraEn: string;
  maxObrasPorElenco: number; requisitos: string[]; criterios?: Array<{ nombre: string; descripcion: string; peso: number }>;
}

export function cuentaDemo(): string {
  const actual = localStorage.getItem('fiavl-convocatorias-cuenta');
  if (actual) return actual;
  const id = crypto.randomUUID();
  localStorage.setItem('fiavl-convocatorias-cuenta', id);
  return id;
}

export function encabezadosDemo(rol = 'postulante'): Record<string, string> {
  return { 'x-cuenta-dev': cuentaDemo(), 'x-rol-dev': rol };
}

/** Sesión de desarrollo de coordinación (Identidad real llega con la spec 004). */
export function encabezadosCoordinacion(): Record<string, string> {
  let cuenta = localStorage.getItem('fiavl-coordinacion-cuenta');
  if (!cuenta) {
    cuenta = crypto.randomUUID();
    localStorage.setItem('fiavl-coordinacion-cuenta', cuenta);
  }
  return { 'x-cuenta-dev': cuenta, 'x-rol-dev': encodeURIComponent('coordinación de convocatorias') };
}

/** Solo el documento más reciente de cada tipo: un reemplazo en subsanación conserva el anterior en el servidor. */
export function documentosVigentes<T extends { tipo: string }>(documentos: T[]): T[] {
  const vigentes = new Map<string, T>();
  for (const documento of documentos) vigentes.set(documento.tipo, documento);
  return [...vigentes.values()];
}

export function fechaEcuador(iso: string): string {
  return new Intl.DateTimeFormat('es-EC', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Guayaquil' }).format(new Date(iso));
}

export function tiempoRestante(ms: number): string {
  if (ms <= 0) return 'Plazo vencido';
  const minutos = Math.floor(ms / 60_000);
  return `${Math.floor(minutos / 60)} h ${String(minutos % 60).padStart(2, '0')} min`;
}

const CLAVE_CURADOR = 'fiavl-curador-cuenta';

/** Cuenta de curador de la sesión de desarrollo (se elige en /curaduria; Identidad real llega con la spec 004). */
export function cuentaCurador(): string { return localStorage.getItem(CLAVE_CURADOR) ?? ''; }
export function fijarCuentaCurador(cuenta: string): void { localStorage.setItem(CLAVE_CURADOR, cuenta.trim()); }
export function encabezadosCurador(): Record<string, string> { return { 'x-cuenta-dev': cuentaCurador(), 'x-rol-dev': encodeURIComponent('curador') }; }

/** "79.00" (API) → "79,00" (es-EC). */
export function puntajeEc(valor: string | null | undefined): string { return valor ? valor.replace('.', ',') : '—'; }

export const ETIQUETA_ESTADO: Record<string, string> = {
  en_evaluacion: 'en evaluación', evaluada: 'evaluada', requiere_deliberacion: 'requiere deliberación', admitida: 'admitida',
  borrador: 'borrador', enviada: 'enviada', reabierta: 'reabierta', sin_iniciar: 'sin iniciar',
  asignada: 'asignada', completada: 'completada',
};

export async function respuestaApi<T>(ruta: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_CONVOCATORIAS}${ruta}`, {
    ...init,
    headers: { ...encabezadosDemo(), ...(init.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...init.headers },
  });
  const body = await response.json().catch(() => ({})) as { detail?: string; faltantes?: string[] };
  if (!response.ok) throw Object.assign(new Error(body.detail ?? `La API respondió ${response.status}`), { faltantes: body.faltantes ?? [] });
  return body as T;
}
