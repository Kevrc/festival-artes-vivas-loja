import { createHmac, randomBytes } from 'node:crypto';

/**
 * Segundo factor del personal (FR-018, research R13): TOTP de RFC 6238 con HMAC-SHA1, pasos de
 * 30 s y 6 dígitos. Funciones puras con `node:crypto`; el secreto nunca sale de Identidad salvo en
 * el alta, dentro del URI `otpauth://`.
 */
export const TOTP = { pasoSegundos: 30, digitos: 6, ventana: 1, bytesSecreto: 20 } as const;

const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** 160 bits, el tamaño que recomienda RFC 4226 para HMAC-SHA1. */
export const generarSecretoTotp = (): Buffer => randomBytes(TOTP.bytesSecreto);

/** Base32 de RFC 4648 sin relleno: el formato que leen las aplicaciones de códigos. */
export function base32(datos: Buffer): string {
  let bits = 0;
  let valor = 0;
  let salida = '';
  for (const byte of datos) {
    valor = (valor << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      salida += ALFABETO[(valor >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) salida += ALFABETO[(valor << (5 - bits)) & 31];
  return salida;
}

export function desdeBase32(texto: string): Buffer {
  const limpio = texto.replace(/[\s=-]/g, '').toUpperCase();
  let bits = 0;
  let valor = 0;
  const bytes: number[] = [];
  for (const c of limpio) {
    const i = ALFABETO.indexOf(c);
    if (i < 0) throw new Error('Base32 inválido');
    valor = (valor << 5) | i;
    bits += 5;
    if (bits >= 8) {
      bytes.push((valor >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** Paso de tiempo T = floor(unix / 30). */
export const pasoDe = (ahora: Date): number => Math.floor(ahora.getTime() / 1000 / TOTP.pasoSegundos);

/** HOTP de RFC 4226 con truncamiento dinámico; `digitos` 6 por defecto (8 para los vectores del RFC). */
export function codigoTotp(secreto: Buffer, paso: number, digitos: number = TOTP.digitos): string {
  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(paso));
  const hmac = createHmac('sha1', secreto).update(contador).digest();
  const desplazamiento = hmac[hmac.length - 1]! & 0x0f;
  const binario = hmac.readUInt32BE(desplazamiento) & 0x7fffffff;
  return String(binario % 10 ** digitos).padStart(digitos, '0');
}

/**
 * Acepta el código del paso actual o de uno adyacente (±1, desfase del reloj del teléfono) y nunca
 * un paso igual o anterior al último aceptado (`credencial.totp_ultimo_paso`): así un código
 * interceptado no se puede reutilizar. Devuelve el paso aceptado, o null.
 */
export function verificarTotp(secreto: Buffer, codigo: string, ahora: Date, ultimoPaso: number | null): number | null {
  if (!/^\d{6}$/.test(codigo)) return null;
  const actual = pasoDe(ahora);
  for (let d = -TOTP.ventana; d <= TOTP.ventana; d++) {
    const paso = actual + d;
    if (ultimoPaso !== null && paso <= ultimoPaso) continue;
    if (igualEnTiempoConstante(codigoTotp(secreto, paso), codigo)) return paso;
  }
  return null;
}

function igualEnTiempoConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diferencia = 0;
  for (let i = 0; i < a.length; i++) diferencia |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferencia === 0;
}

/** URI de configuración (formato Key Uri de Google Authenticator) para el QR del alta. */
export function otpauthUri(secreto: Buffer, cuenta: string, emisor = 'FIAVL'): string {
  const etiqueta = `${encodeURIComponent(emisor)}:${encodeURIComponent(cuenta)}`;
  const q = new URLSearchParams({ secret: base32(secreto), issuer: emisor, algorithm: 'SHA1', digits: String(TOTP.digitos), period: String(TOTP.pasoSegundos) });
  return `otpauth://totp/${etiqueta}?${q.toString()}`;
}

/** La clave en grupos de 4 para escribirla a mano o leerla con un lector de pantalla. */
export const claveLegible = (secreto: Buffer): string => base32(secreto).match(/.{1,4}/g)!.join(' ');
