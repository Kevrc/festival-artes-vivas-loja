import { createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, sign, verify } from 'node:crypto';

const ALFABETO_CORTO = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export interface ParLlavesQr {
  privadaPem: string;
  publicaSpkiBase64: string;
}

let llavesDesarrolloCache: ParLlavesQr | undefined;

/** Obtiene el par Ed25519 desde variable de entorno (obligatorio en producción) o genera uno efímero en dev/test. */
export function obtenerLlavesQr(privadaPemEnv = process.env.BOLETERIA_QR_PRIVADA_PEM, entorno = process.env.NODE_ENV): ParLlavesQr {
  const pem = privadaPemEnv?.replace(/\\n/g, '\n').trim();
  if (pem) {
    const privada = createPrivateKey(pem);
    const publicaDer = createPublicKey(privada).export({ type: 'spki', format: 'der' });
    return { privadaPem: pem, publicaSpkiBase64: Buffer.from(publicaDer).toString('base64') };
  }
  if (entorno === 'production') {
    throw new Error('BOLETERIA_QR_PRIVADA_PEM es obligatoria en producción (Constitución VI)');
  }
  if (!llavesDesarrolloCache) {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'der' },
    });
    llavesDesarrolloCache = {
      privadaPem: privateKey,
      publicaSpkiBase64: Buffer.from(publicKey).toString('base64'),
    };
  }
  return llavesDesarrolloCache;
}

export function construirCargaQr(entradaId: string, funcionId: string, emitidaEnEpoch: number): string {
  return `v1.${entradaId}.${funcionId}.${emitidaEnEpoch}`;
}

/** FR-007: Token compacto firmado con Ed25519 (v1.entradaId.funcionId.epoch.firmaBase64Url). */
export function firmarTokenQr(p: {
  entradaId: string;
  funcionId: string;
  emitidaEnEpoch: number;
  privadaPem: string;
}): string {
  const carga = construirCargaQr(p.entradaId, p.funcionId, p.emitidaEnEpoch);
  const firma = sign(null, Buffer.from(carga, 'utf8'), createPrivateKey(p.privadaPem));
  return `${carga}.${firma.toString('base64url')}`;
}

export type ResultadoVerificacionQr =
  | { valido: true; entradaId: string; funcionId: string; emitidaEnEpoch: number }
  | { valido: false };

export function verificarTokenQr(tokenQr: string, publicaSpkiBase64: string): ResultadoVerificacionQr {
  const partes = tokenQr.trim().split('.');
  if (partes.length !== 5 || partes[0] !== 'v1') return { valido: false };
  const [, entradaId, funcionId, epochStr, firmaB64] = partes;
  const emitidaEnEpoch = Number(epochStr);
  if (!entradaId || !funcionId || !Number.isInteger(emitidaEnEpoch) || !firmaB64) return { valido: false };
  try {
    const carga = construirCargaQr(entradaId, funcionId, emitidaEnEpoch);
    const publica = createPublicKey({ key: Buffer.from(publicaSpkiBase64, 'base64'), format: 'der', type: 'spki' });
    const ok = verify(null, Buffer.from(carga, 'utf8'), publica, Buffer.from(firmaB64, 'base64url'));
    return ok ? { valido: true, entradaId, funcionId, emitidaEnEpoch } : { valido: false };
  } catch {
    return { valido: false };
  }
}

/** Código corto legible de 8 caracteres sin ambigüedad (US2-AS7). */
export function generarCodigoCorto(): string {
  const bytes = randomBytes(8);
  let out = '';
  for (let i = 0; i < 8; i++) {
    out += ALFABETO_CORTO[bytes[i]! % ALFABETO_CORTO.length];
  }
  return out;
}

export function normalizarCodigoCorto(codigo: string): string {
  return codigo.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function formatearCodigoCorto(codigo: string): string {
  const limpio = normalizarCodigoCorto(codigo);
  if (limpio.length !== 8) return limpio;
  return `${limpio.slice(0, 4)}-${limpio.slice(4)}`;
}
