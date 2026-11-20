import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

let efimero: string | undefined;

/**
 * Secreto con el que se firman y verifican las URLs de descarga local (adaptadores memoria y disco).
 * Siempre el mismo para firmar y verificar: `CONVOCATORIAS_FIRMA_SECRET` o, si no se define, uno aleatorio por proceso
 * (sin valores escritos a mano). Las URLs duran cinco minutos, así que reiniciar la API solo las invalida.
 */
export function secretoFirmaDescarga(env: Record<string, string | undefined> = process.env): string {
  if (env.CONVOCATORIAS_FIRMA_SECRET) return env.CONVOCATORIAS_FIRMA_SECRET;
  efimero ??= randomBytes(32).toString('hex');
  return efimero;
}

export function urlDescargaLocal(baseUrl: string, secret: string, objectKey: string, venceEn: Date): string {
  const exp = Math.floor(venceEn.getTime() / 1000);
  const ttl = exp - Math.floor(Date.now() / 1000);
  if (ttl <= 0 || ttl > 300) throw new Error('La URL debe vencer dentro de cinco minutos');
  const sig = createHmac('sha256', secret).update(`${objectKey}:${exp}`).digest('hex');
  const url = new URL('/api/convocatorias/documentos/contenido', baseUrl);
  url.searchParams.set('key', objectKey);
  url.searchParams.set('exp', String(exp));
  url.searchParams.set('sig', sig);
  return url.toString();
}

export function validarFirmaDescargaLocal(secret: string, objectKey: string, exp: number, firma: string, ahora = Date.now()): boolean {
  if (!Number.isInteger(exp) || exp * 1000 <= ahora || exp * 1000 > ahora + 300_000) return false;
  const esperada = createHmac('sha256', secret).update(`${objectKey}:${exp}`).digest();
  const recibida = Buffer.from(firma, 'hex');
  return recibida.length === esperada.length && timingSafeEqual(esperada, recibida);
}
