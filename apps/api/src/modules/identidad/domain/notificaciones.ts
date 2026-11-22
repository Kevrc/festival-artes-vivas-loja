/**
 * Reglas de las notificaciones (US10, FR-021, FR-022, RN-011, ADR-0011). Funciones puras.
 */
export type Plantilla =
  | 'entradas_emitidas'
  | 'devolucion'
  | 'funcion_reprogramada'
  | 'funcion_cancelada'
  | 'acuse_postulacion'
  | 'subsanacion'
  | 'resultado'
  | 'novedad';

export type Categoria = 'servicio' | 'opcional';
export type EstadoNotificacion = 'pendiente' | 'enviada' | 'fallida' | 'omitida';

/** Pasado este plazo desde la creación, una notificación sin enviar queda `fallida` (US10-AS2). */
export const PLAZO_ENVIO_MS = 24 * 60 * 60_000;
/** Reintentos del trabajo con espera creciente: 30 s · 2^n cubre las 24 h. */
export const REINTENTOS = { limite: 12, esperaSegundos: 30 } as const;

/** RN-011: `tipoEvento:eventoId:destinatario`. El destinatario va normalizado. */
export const claveDedup = (tipoEvento: string, eventoId: string, destinatario: string): string =>
  `${tipoEvento}:${eventoId}:${destinatario.trim().toLowerCase()}`;

/** Solo las novedades son opcionales; entradas, cambios y postulaciones son de servicio (US10-AS4). */
export const categoriaDe = (plantilla: Plantilla): Categoria => (plantilla === 'novedad' ? 'opcional' : 'servicio');

/** US10-AS4: una opcional sin consentimiento de novedades se registra como `omitida` y no se envía. */
export function estadoInicial(categoria: Categoria, aceptaNovedades: boolean): 'pendiente' | 'omitida' {
  return categoria === 'opcional' && !aceptaNovedades ? 'omitida' : 'pendiente';
}

export const vencida = (creadaEn: Date, ahora: Date): boolean => ahora.getTime() - creadaEn.getTime() >= PLAZO_ENVIO_MS;

/** Espera antes del intento `n` (0 = primer reintento), la misma que aplica pg-boss con backoff. */
export const esperaAntesDe = (n: number): number => REINTENTOS.esperaSegundos * 2 ** n;

/**
 * Lo que se conserva en `notificacion.datos` tras enviar: los tokens de las entradas (`tokenQr`)
 * solo viven mientras la notificación está pendiente (data-model.md).
 */
export function datosTrasEnvio(datos: Record<string, unknown>): Record<string, unknown> {
  const entradas = datos.entradas;
  if (!Array.isArray(entradas)) return datos;
  return {
    ...datos,
    entradas: entradas.map((e) => {
      if (!e || typeof e !== 'object') return e;
      const { tokenQr: _omitido, ...resto } = e as Record<string, unknown>;
      return resto;
    }),
  };
}

/** Mensaje de error para `ultimo_error`: corto y sin direcciones de correo. */
export function errorSeguro(e: unknown): string {
  const texto = e instanceof Error ? e.message : String(e);
  return texto.replace(/[^\s@<>]+@[^\s@<>]+/g, '[correo]').slice(0, 300);
}
