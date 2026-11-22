import { describe, expect, it } from 'vitest';
import { PARAMETROS_SCRYPT, hashContrasena, necesitaRehash, validarContrasena, verificarContrasena } from './contrasenas';

const filtradas = new Set(['contrasena123', 'qwertyuiop', '1234567890']);
const esFiltrada = (c: string) => filtradas.has(c.toLowerCase());

describe('requisitos de contraseña (RN-008, US7-AS4)', () => {
  it('rechaza menos de 10 caracteres con el motivo', () => {
    expect(validarContrasena('corta9chr', esFiltrada)).toEqual({ ok: false, codigo: 'contrasena_corta' });
    expect(validarContrasena('diezchars!', esFiltrada)).toEqual({ ok: true });
  });

  it('cuenta caracteres, no bytes: "ñandú" y emojis cuentan uno cada uno', () => {
    expect(validarContrasena('ñandúñandú', esFiltrada)).toEqual({ ok: true });
    expect(validarContrasena('🎭🎭🎭🎭🎭🎭🎭🎭🎭', esFiltrada)).toEqual({ ok: false, codigo: 'contrasena_corta' });
  });

  it('rechaza una contraseña de la lista filtrada sin distinguir mayúsculas', () => {
    expect(validarContrasena('QWERTYUIOP', esFiltrada)).toEqual({ ok: false, codigo: 'contrasena_filtrada' });
    expect(validarContrasena('Contrasena123', esFiltrada)).toEqual({ ok: false, codigo: 'contrasena_filtrada' });
  });

  it('rechaza más de 128 caracteres', () => {
    expect(validarContrasena('a'.repeat(129), esFiltrada)).toEqual({ ok: false, codigo: 'contrasena_larga' });
  });
});

describe('hash scrypt (R10, RNF-006)', () => {
  it('guarda algoritmo, parámetros, sal y hash: scrypt$N$r$p$sal$hash', async () => {
    const h = await hashContrasena('Teatro-en-Loja-2026');
    const [alg, n, r, p, sal, hash] = h.split('$');
    expect(alg).toBe('scrypt');
    expect([Number(n), Number(r), Number(p)]).toEqual([PARAMETROS_SCRYPT.N, PARAMETROS_SCRYPT.r, PARAMETROS_SCRYPT.p]);
    expect(PARAMETROS_SCRYPT).toMatchObject({ N: 2 ** 15, r: 8, p: 3 });
    expect(Buffer.from(sal!, 'base64')).toHaveLength(16);
    expect(Buffer.from(hash!, 'base64')).toHaveLength(32);
    expect(h).not.toContain('Teatro-en-Loja-2026');
  });

  it('dos hashes de la misma contraseña son distintos (sal aleatoria) y ambos verifican', async () => {
    const a = await hashContrasena('Teatro-en-Loja-2026');
    const b = await hashContrasena('Teatro-en-Loja-2026');
    expect(a).not.toBe(b);
    expect(await verificarContrasena('Teatro-en-Loja-2026', a)).toBe(true);
    expect(await verificarContrasena('Teatro-en-Loja-2026', b)).toBe(true);
  });

  it('una contraseña distinta o un hash malformado no verifican', async () => {
    const h = await hashContrasena('Teatro-en-Loja-2026');
    expect(await verificarContrasena('teatro-en-loja-2026', h)).toBe(false);
    expect(await verificarContrasena('Teatro-en-Loja-2026', 'bcrypt$algo')).toBe(false);
    expect(await verificarContrasena('Teatro-en-Loja-2026', 'scrypt$1$1$1$xx$yy')).toBe(false);
  });

  it('pide rehacer el hash si se guardó con parámetros más débiles', async () => {
    expect(necesitaRehash(await hashContrasena('Teatro-en-Loja-2026'))).toBe(false);
    expect(necesitaRehash('scrypt$16384$8$1$c2Fs$aGFzaA==')).toBe(true);
  });
});
