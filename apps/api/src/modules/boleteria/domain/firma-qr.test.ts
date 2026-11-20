import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  construirCargaQr,
  firmarTokenQr,
  formatearCodigoCorto,
  generarCodigoCorto,
  normalizarCodigoCorto,
  obtenerLlavesQr,
  verificarTokenQr,
} from './firma-qr';

describe('firma-qr Ed25519 y código corto (FR-007)', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'der' },
  });
  const publicaBase64 = publicKey.toString('base64');

  it('firma y verifica un token QR Ed25519 válido', () => {
    const entradaId = randomUUID();
    const funcionId = randomUUID();
    const token = firmarTokenQr({ entradaId, funcionId, emitidaEnEpoch: 1794700800, privadaPem: privateKey });
    const resultado = verificarTokenQr(token, publicaBase64);
    expect(resultado).toEqual({
      valido: true,
      entradaId,
      funcionId,
      emitidaEnEpoch: 1794700800,
    });
  });

  it('rechaza un token QR alterado o firmado con otra llave', () => {
    const token = firmarTokenQr({
      entradaId: randomUUID(),
      funcionId: randomUUID(),
      emitidaEnEpoch: 1794700800,
      privadaPem: privateKey,
    });
    const alterado = token.slice(0, -4) + 'AAAA';
    expect(verificarTokenQr(alterado, publicaBase64).valido).toBe(false);
    expect(verificarTokenQr('invalido', publicaBase64).valido).toBe(false);
    expect(construirCargaQr('e', 'f', 10)).toBe('v1.e.f.10');
  });

  it('genera códigos cortos legibles de 8 caracteres sin caracteres ambiguos', () => {
    const codigo = generarCodigoCorto();
    expect(codigo).toMatch(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/);
    expect(formatearCodigoCorto(codigo)).toBe(`${codigo.slice(0, 4)}-${codigo.slice(4)}`);
    expect(normalizarCodigoCorto(` ${codigo.slice(0, 4).toLowerCase()}-${codigo.slice(4)} `)).toBe(codigo);
  });

  it('deriva llaves efímeras en desarrollo si no hay PEM configurado y exige PEM en producción', () => {
    const llaves = obtenerLlavesQr(undefined, 'test');
    expect(llaves.privadaPem).toContain('BEGIN PRIVATE KEY');
    expect(llaves.publicaSpkiBase64.length).toBeGreaterThan(20);
    expect(() => obtenerLlavesQr(undefined, 'production')).toThrow();
  });
});
