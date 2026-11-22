import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

/**
 * Contraseñas (RN-008, RNF-006, research R10/R11). scrypt de `node:crypto` con los parámetros de
 * OWASP; el hash guarda algoritmo y parámetros para poder subirlos más adelante. La contraseña ni
 * ningún derivado suyo sale del servidor ni aparece en logs.
 */
export const PARAMETROS_SCRYPT = { N: 2 ** 15, r: 8, p: 3, longitud: 32, sal: 16 } as const;
const MINIMO = 10;
const MAXIMO = 128;
/** 128·N·r bytes + margen: scrypt de Node rechaza por defecto más de 32 MiB. */
const MAXMEM = 128 * PARAMETROS_SCRYPT.N * PARAMETROS_SCRYPT.r * 2;

export type ResultadoValidacion = { ok: true } | { ok: false; codigo: 'contrasena_corta' | 'contrasena_larga' | 'contrasena_filtrada' };

/** US7-AS4: mínimo 10 caracteres (no bytes) y fuera de la lista de filtradas, sin distinguir mayúsculas. */
export function validarContrasena(contrasena: string, esFiltrada: (c: string) => boolean): ResultadoValidacion {
  const largo = [...contrasena].length;
  if (largo < MINIMO) return { ok: false, codigo: 'contrasena_corta' };
  if (largo > MAXIMO) return { ok: false, codigo: 'contrasena_larga' };
  if (esFiltrada(contrasena.toLowerCase())) return { ok: false, codigo: 'contrasena_filtrada' };
  return { ok: true };
}

function derivar(contrasena: string, sal: Buffer, N: number, r: number, p: number, longitud: number): Promise<Buffer> {
  return new Promise((ok, mal) =>
    scrypt(contrasena.normalize('NFC'), sal, longitud, { N, r, p, maxmem: Math.max(MAXMEM, 128 * N * r * 2) }, (e, clave) => (e ? mal(e) : ok(clave))),
  );
}

/** `scrypt$N$r$p$sal$hash` (sal y hash en base64). */
export async function hashContrasena(contrasena: string): Promise<string> {
  const { N, r, p, longitud } = PARAMETROS_SCRYPT;
  const sal = randomBytes(PARAMETROS_SCRYPT.sal);
  const hash = await derivar(contrasena, sal, N, r, p, longitud);
  return ['scrypt', N, r, p, sal.toString('base64'), hash.toString('base64')].join('$');
}

/** Comparación en tiempo constante; un hash malformado o de otro algoritmo no verifica. */
export async function verificarContrasena(contrasena: string, guardado: string): Promise<boolean> {
  const partes = guardado.split('$');
  if (partes.length !== 6 || partes[0] !== 'scrypt') return false;
  const [N, r, p] = partes.slice(1, 4).map(Number) as [number, number, number];
  const sal = Buffer.from(partes[4]!, 'base64');
  const esperado = Buffer.from(partes[5]!, 'base64');
  if (!Number.isInteger(N) || N < 2 || (N & (N - 1)) !== 0 || !r || !p || esperado.length === 0) return false;
  try {
    const calculado = await derivar(contrasena, sal, N, r, p, esperado.length);
    return timingSafeEqual(calculado, esperado);
  } catch {
    return false;
  }
}

/** El hash se guardó con parámetros más débiles que los vigentes: rehacerlo al iniciar sesión. */
export function necesitaRehash(guardado: string): boolean {
  const [, N, r, p] = guardado.split('$').map(Number);
  return N !== PARAMETROS_SCRYPT.N || r !== PARAMETROS_SCRYPT.r || p !== PARAMETROS_SCRYPT.p;
}
