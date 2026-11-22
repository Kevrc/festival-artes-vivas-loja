/**
 * Sesiones opacas (ADR-0009, research R12): expiración deslizante según el tipo de cuenta y
 * registro de actividad como máximo una vez por minuto. Dominio puro.
 */
const MINUTO = 60_000;
export const DURACION_SESION = { publico: 30 * 24 * 60 * MINUTO, personal: 8 * 60 * MINUTO } as const;
const RENOVAR_CADA = MINUTO;

/** US8-AS1: 30 días de inactividad para el público; 8 horas para el personal. */
export const expiracionSesion = (esPersonal: boolean, ahora: Date): Date =>
  new Date(ahora.getTime() + (esPersonal ? DURACION_SESION.personal : DURACION_SESION.publico));

export const sesionVigente = (s: { expiraEn: Date; revocadaEn: Date | null }, ahora: Date): boolean =>
  s.revocadaEn === null && ahora.getTime() < s.expiraEn.getTime();

export const debeRenovar = (ultimaActividad: Date, ahora: Date): boolean => ahora.getTime() - ultimaActividad.getTime() >= RENOVAR_CADA;

/** "Chrome en Windows": suficiente para reconocer el dispositivo sin guardar el agente completo. */
export function describirDispositivo(agente: string | undefined): string {
  if (!agente) return 'Dispositivo desconocido';
  const navegador = /Edg\//.test(agente)
    ? 'Edge'
    : /Firefox\//.test(agente)
      ? 'Firefox'
      : /Chrome\//.test(agente)
        ? 'Chrome'
        : /Safari\//.test(agente)
          ? 'Safari'
          : 'Navegador';
  const sistema = /iPhone|iPad/.test(agente)
    ? 'iPhone'
    : /Android/.test(agente)
      ? 'Android'
      : /Windows/.test(agente)
        ? 'Windows'
        : /Mac OS X|Macintosh/.test(agente)
          ? 'macOS'
          : /Linux/.test(agente)
            ? 'Linux'
            : 'otro sistema';
  return `${navegador} en ${sistema}`;
}
