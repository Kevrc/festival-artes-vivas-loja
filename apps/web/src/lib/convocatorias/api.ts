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

export async function respuestaApi<T>(ruta: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_CONVOCATORIAS}${ruta}`, {
    ...init,
    headers: { ...encabezadosDemo(), ...(init.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...init.headers },
  });
  const body = await response.json().catch(() => ({})) as { detail?: string; faltantes?: string[] };
  if (!response.ok) throw Object.assign(new Error(body.detail ?? `La API respondió ${response.status}`), { faltantes: body.faltantes ?? [] });
  return body as T;
}
