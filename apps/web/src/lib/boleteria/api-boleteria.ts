import type { ApiBoleteria } from '@fiavl/contracts';

type Schemas = ApiBoleteria.components['schemas'];

export type DisponibilidadFuncion = Schemas['DisponibilidadFuncion'];
export type OcupacionFuncion = Schemas['OcupacionFuncion'];
export type PedidoDetalle = Schemas['PedidoDetalle'];
export type PedidoCreadoPago = Schemas['PedidoCreadoPago'];
export type EntradaDigital = Schemas['EntradaDigital'];
export type CajaDetalle = Schemas['CajaDetalle'];
export type PaqueteValidador = Schemas['PaqueteValidador'];
export type ResultadoValidacion = Schemas['ResultadoValidacion'];
export type ResultadoSincronizacion = Schemas['ResultadoSincronizacion'];
export type IngresoOfflineItem = Schemas['IngresoOfflineItem'];
export type MedioPagoTaquilla = Schemas['MedioPagoTaquilla'];

export interface SesionDevBoleteria {
  cuentaId: string;
  rol: 'asistente' | 'taquilla' | 'validador' | 'jefe_sala' | 'programador' | 'administrador';
  sedeId?: string;
  estudiante?: boolean;
  correo?: string;
}

const CLAVE_SESION_DEV = 'fiavl.sesion_dev';

export function baseApiUrl(): string {
  if (typeof window !== 'undefined') {
    return process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
  }
  return process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
}

export function leerSesionDev(): SesionDevBoleteria | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(CLAVE_SESION_DEV);
    if (!raw) return null;
    return JSON.parse(raw) as SesionDevBoleteria;
  } catch {
    return null;
  }
}

export function guardarSesionDev(sesion: SesionDevBoleteria | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (!sesion) {
      window.localStorage.removeItem(CLAVE_SESION_DEV);
      document.cookie = 'sesion_dev=; path=/; max-age=0';
      return;
    }
    const val = JSON.stringify(sesion);
    window.localStorage.setItem(CLAVE_SESION_DEV, val);
    document.cookie = `sesion_dev=${encodeURIComponent(val)}; path=/; SameSite=Lax`;
  } catch {
    // ignorar si el almacenamiento está bloqueado
  }
}

export class ErrorApiBoleteria extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly lugaresDisponibles?: number,
  ) {
    super(message);
  }
}

async function pedir<T>(ruta: string, init: RequestInit = {}): Promise<T> {
  const sesion = leerSesionDev();
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type') && init.body) headers.set('Content-Type', 'application/json');
  if (sesion) {
    headers.set('x-cuenta-dev', sesion.cuentaId);
    headers.set('x-rol-dev', sesion.rol);
    if (sesion.sedeId) headers.set('x-sede-dev', sesion.sedeId);
    if (sesion.estudiante) headers.set('x-estudiante-dev', 'true');
    if (sesion.correo) headers.set('x-correo-dev', sesion.correo);
  }

  const res = await fetch(`${baseApiUrl()}${ruta}`, {
    ...init,
    headers,
    credentials: 'include',
    cache: 'no-store',
  });

  if (!res.ok) {
    let mensaje = `Error ${res.status}`;
    let disponibles: number | undefined;
    try {
      const prob = (await res.json()) as { detail?: string; title?: string; lugaresDisponibles?: number };
      mensaje = prob.detail ?? prob.title ?? mensaje;
      disponibles = prob.lugaresDisponibles;
    } catch {
      // respuesta sin cuerpo JSON
    }
    throw new ErrorApiBoleteria(res.status, mensaje, disponibles);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const apiBoleteria = {
  disponibilidadFuncion: (funcionId: string) =>
    pedir<DisponibilidadFuncion>(`/api/boleteria/funciones/${funcionId}/disponibilidad`),

  ocupacionEnVivo: (funcionId: string) =>
    pedir<OcupacionFuncion>(`/api/boleteria/funciones/${funcionId}/ocupacion`),

  crearPedidoPagado: (funcionId: string, cantidad: number, claveIdempotencia: string) =>
    pedir<PedidoCreadoPago>('/api/boleteria/pedidos', {
      method: 'POST',
      headers: { 'Idempotency-Key': claveIdempotencia },
      body: JSON.stringify({ funcionId, cantidad }),
    }),

  crearReservaGratuita: (funcionId: string, cantidad: number, claveIdempotencia: string) =>
    pedir<PedidoDetalle>('/api/boleteria/reservas', {
      method: 'POST',
      headers: { 'Idempotency-Key': claveIdempotencia },
      body: JSON.stringify({ funcionId, cantidad }),
    }),

  confirmarPagoSimulado: async (p: {
    pedidoId: string;
    resultado: 'aprobado' | 'rechazado';
    importeCentavos: number;
    referenciaProveedor: string;
  }) => {
    const res = await fetch(`${baseApiUrl()}/api/boleteria/pagos/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-firma-proveedor': 'simulador-firma-valida',
      },
      body: JSON.stringify(p),
    });
    if (!res.ok) throw new ErrorApiBoleteria(res.status, 'No se pudo procesar el pago simulado');
    return (await res.json()) as { procesado: boolean; estadoPedido: PedidoDetalle['estado'] };
  },

  misEntradas: () => pedir<PedidoDetalle[]>('/api/boleteria/mis-entradas'),
  obtenerPedido: (pedidoId: string) => pedir<PedidoDetalle>(`/api/boleteria/pedidos/${pedidoId}`),
  reenviarCorreo: (pedidoId: string) =>
    pedir<{ pedidoId: string; encolado: boolean }>(`/api/boleteria/pedidos/${pedidoId}/reenviar-correo`, { method: 'POST' }),
  cancelarReserva: (pedidoId: string) =>
    pedir<PedidoDetalle>(`/api/boleteria/pedidos/${pedidoId}/cancelar-reserva`, { method: 'POST' }),
  elegirCancelacion: (pedidoId: string, eleccion: 'devolucion' | 'cambio', nuevaFuncionId?: string) =>
    pedir<PedidoDetalle>(`/api/boleteria/pedidos/${pedidoId}/eleccion-cancelacion`, {
      method: 'POST',
      body: JSON.stringify({ eleccion, ...(nuevaFuncionId ? { nuevaFuncionId } : {}) }),
    }),

  abrirCaja: (sedeId: string, fondoInicialCentavos: number) =>
    pedir<CajaDetalle>('/api/boleteria/taquilla/cajas', {
      method: 'POST',
      body: JSON.stringify({ sedeId, fondoInicialCentavos }),
    }),
  obtenerCajaActual: () => pedir<CajaDetalle>('/api/boleteria/taquilla/cajas/actual'),
  cerrarCaja: (cajaId: string, efectivoDeclaradoCentavos: number) =>
    pedir<CajaDetalle>(`/api/boleteria/taquilla/cajas/${cajaId}/cerrar`, {
      method: 'POST',
      body: JSON.stringify({ efectivoDeclaradoCentavos }),
    }),
  venderTaquilla: (
    p: { cajaId: string; funcionId: string; cantidad: number; medioPago: MedioPagoTaquilla; correoComprador?: string },
    claveIdempotencia: string,
  ) =>
    pedir<PedidoDetalle>('/api/boleteria/taquilla/ventas', {
      method: 'POST',
      headers: { 'Idempotency-Key': claveIdempotencia },
      body: JSON.stringify(p),
    }),
  devolverTaquilla: (cajaId: string, codigoEntrada: string) =>
    pedir<PedidoDetalle>('/api/boleteria/taquilla/devoluciones', {
      method: 'POST',
      body: JSON.stringify({ cajaId, codigoEntrada }),
    }),

  descargarPaqueteValidador: (funcionId: string) =>
    pedir<PaqueteValidador>(`/api/boleteria/validador/funciones/${funcionId}/paquete`),
  validarEnLinea: (p: { funcionId: string; tokenQr?: string; codigoCorto?: string; dispositivoId: string; puerta: string }) =>
    pedir<ResultadoValidacion>('/api/boleteria/validador/validar', {
      method: 'POST',
      body: JSON.stringify(p),
    }),
  sincronizarIngresos: (ingresos: IngresoOfflineItem[]) =>
    pedir<ResultadoSincronizacion>('/api/boleteria/validador/sincronizar', {
      method: 'POST',
      body: JSON.stringify({ ingresos }),
    }),
};

export function formatoDolares(centavos: number): string {
  return `USD ${(centavos / 100).toFixed(2).replace('.', ',')}`;
}
