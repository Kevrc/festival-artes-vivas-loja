/** Bloqueo temporal tras intentos fallidos (US8-AS2, research R14, Constitución VI). Dominio puro. */
const MINUTO = 60_000;
export const BLOQUEO = { fallos: 5, ventanaMs: 15 * MINUTO, duracionMs: 15 * MINUTO } as const;

export const debeBloquear = (fallosEnVentana: number): boolean => fallosEnVentana >= BLOQUEO.fallos;

export const bloqueadaHasta = (ahora: Date): Date => new Date(ahora.getTime() + BLOQUEO.duracionMs);

/** "Bloqueada" no es un estado guardado: vuelve sola a verificada al pasar la hora (data-model). */
export const estaBloqueada = (hasta: Date | null, ahora: Date): boolean => hasta !== null && ahora.getTime() < hasta.getTime();
