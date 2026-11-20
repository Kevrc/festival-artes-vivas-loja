import { createHmac, timingSafeEqual } from 'node:crypto';

export function urlDescargaLocal(baseUrl: string, secret: string, objectKey: string, venceEn: Date): string {
  const exp = Math.floor(venceEn.getTime() / 1000);
  const ttl = exp - Math.floor(Date.now() / 1000);
  if (ttl <= 0 || ttl > 300) throw new Error('La URL debe vencer dentro de cinco minutos');
  const sig = createHmac('sha256', secret).update(`${objectKey}:${exp}`).digest('hex');
  const url = new URL(`/api/convocatorias/documentos/${encodeURIComponent(objectKey)}/contenido`, baseUrl);
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
