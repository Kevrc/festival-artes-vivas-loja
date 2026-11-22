import { createHash, randomBytes } from 'node:crypto';

/**
 * Enlaces de un solo uso (research R15, FR-017): token aleatorio de 256 bits en la URL; en la base
 * solo su SHA-256, con caducidad y marca de uso.
 */
export type TipoToken = 'verificacion' | 'recuperacion' | 'estudiante';

const HORA = 60 * 60_000;
const VIGENCIA: Record<TipoToken, number> = { verificacion: 24 * HORA, recuperacion: HORA, estudiante: 24 * HORA };

/** Caso borde: como máximo 3 enlaces de verificación por hora. */
export const REENVIOS_POR_HORA = 3;

export const hashToken = (token: string): Buffer => createHash('sha256').update(token, 'utf8').digest();

export function generarToken(): { token: string; hash: Buffer } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token) };
}

export const expiracionDe = (tipo: TipoToken, ahora: Date): Date => new Date(ahora.getTime() + VIGENCIA[tipo]);

export function estadoToken(t: { expiraEn: Date; usadoEn: Date | null }, ahora: Date): 'valido' | 'vencido' | 'usado' {
  if (t.usadoEn) return 'usado';
  if (ahora.getTime() >= t.expiraEn.getTime()) return 'vencido';
  return 'valido';
}

export const puedeReenviar = (enviadosUltimaHora: number): boolean => enviadosUltimaHora < REENVIOS_POR_HORA;

/** `Ana@Mail.com` y `ana@mail.com` son la misma cuenta (caso borde). */
export const normalizarCorreo = (correo: string): string => correo.trim().toLowerCase();
