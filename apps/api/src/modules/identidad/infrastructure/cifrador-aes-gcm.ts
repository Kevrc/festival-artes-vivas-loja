import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { Logger } from '@nestjs/common';
import type { Cifrador } from '../application/puertos';

const IV = 12;
const ETIQUETA = 16;

/**
 * AES-256-GCM para `credencial.totp_secreto_cifrado` (research R13). Formato: iv(12) ‖ etiqueta(16)
 * ‖ texto cifrado. La llave sale de `IDENTIDAD_CLAVE_CIFRADO` (32 bytes en base64), nunca del repo.
 */
export class CifradorAesGcm implements Cifrador {
  constructor(private readonly llave: Buffer) {
    if (llave.length !== 32) throw new Error('IDENTIDAD_CLAVE_CIFRADO debe tener 32 bytes en base64');
  }

  cifrar(claro: Buffer): Buffer {
    const iv = randomBytes(IV);
    const c = createCipheriv('aes-256-gcm', this.llave, iv);
    const cifrado = Buffer.concat([c.update(claro), c.final()]);
    return Buffer.concat([iv, c.getAuthTag(), cifrado]);
  }

  descifrar(datos: Buffer): Buffer {
    const d = createDecipheriv('aes-256-gcm', this.llave, datos.subarray(0, IV));
    d.setAuthTag(datos.subarray(IV, IV + ETIQUETA));
    return Buffer.concat([d.update(datos.subarray(IV + ETIQUETA)), d.final()]);
  }
}

/** Llave fija y pública: solo para desarrollo y pruebas, cuando no se configuró la variable. */
const LLAVE_DESARROLLO = createHash('sha256').update('fiavl-solo-desarrollo-totp').digest();

/**
 * En producción la variable es obligatoria (falla al arrancar). En desarrollo y pruebas, sin ella se
 * usa una llave fija conocida, con aviso: así la semilla y la API descifran los mismos secretos.
 */
export function cifradorDelEntorno(entorno = process.env): CifradorAesGcm {
  const valor = entorno.IDENTIDAD_CLAVE_CIFRADO?.trim();
  if (valor) return new CifradorAesGcm(Buffer.from(valor, 'base64'));
  if (entorno.NODE_ENV === 'production') throw new Error('IDENTIDAD_CLAVE_CIFRADO no está configurada');
  if (entorno.NODE_ENV !== 'test') new Logger('Cifrador').warn('IDENTIDAD_CLAVE_CIFRADO vacía: se usa la llave de desarrollo');
  return new CifradorAesGcm(LLAVE_DESARROLLO);
}
