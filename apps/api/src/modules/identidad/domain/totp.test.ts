import { describe, expect, it } from 'vitest';
import { base32, claveLegible, codigoTotp, desdeBase32, generarSecretoTotp, otpauthUri, pasoDe, verificarTotp } from './totp';

// T079: vectores oficiales de RFC 6238, apéndice B (SHA-1, 30 s).
const SECRETO_RFC = Buffer.from('12345678901234567890', 'ascii');
const VECTORES: [number, string][] = [
  [59, '94287082'],
  [1111111109, '07081804'],
  [1111111111, '14050471'],
  [1234567890, '89005924'],
  [2000000000, '69279037'],
  [20000000000, '65353130'],
];
const en = (segundos: number) => new Date(segundos * 1000);

describe('TOTP (RFC 6238)', () => {
  it.each(VECTORES)('t=%i ⇒ %s (8 dígitos) y sus 6 últimos con 6 dígitos', (t, esperado) => {
    expect(codigoTotp(SECRETO_RFC, pasoDe(en(t)), 8)).toBe(esperado);
    expect(codigoTotp(SECRETO_RFC, pasoDe(en(t)))).toBe(esperado.slice(2));
  });

  it('acepta el paso actual y los adyacentes (±1), no los de más lejos', () => {
    const ahora = en(1111111111);
    const paso = pasoDe(ahora);
    expect(verificarTotp(SECRETO_RFC, codigoTotp(SECRETO_RFC, paso), ahora, null)).toBe(paso);
    expect(verificarTotp(SECRETO_RFC, codigoTotp(SECRETO_RFC, paso - 1), ahora, null)).toBe(paso - 1);
    expect(verificarTotp(SECRETO_RFC, codigoTotp(SECRETO_RFC, paso + 1), ahora, null)).toBe(paso + 1);
    expect(verificarTotp(SECRETO_RFC, codigoTotp(SECRETO_RFC, paso - 2), ahora, null)).toBeNull();
    expect(verificarTotp(SECRETO_RFC, codigoTotp(SECRETO_RFC, paso + 2), ahora, null)).toBeNull();
  });

  it('rechaza el mismo paso dos veces y cualquier paso anterior al último usado', () => {
    const ahora = en(1234567890);
    const paso = pasoDe(ahora);
    const codigo = codigoTotp(SECRETO_RFC, paso);
    const usado = verificarTotp(SECRETO_RFC, codigo, ahora, null);
    expect(usado).toBe(paso);
    expect(verificarTotp(SECRETO_RFC, codigo, ahora, usado)).toBeNull();
    expect(verificarTotp(SECRETO_RFC, codigoTotp(SECRETO_RFC, paso - 1), ahora, usado)).toBeNull();
    expect(verificarTotp(SECRETO_RFC, codigoTotp(SECRETO_RFC, paso + 1), ahora, usado)).toBe(paso + 1);
  });

  it('rechaza códigos mal formados', () => {
    const ahora = en(59);
    for (const malo of ['', '12345', '1234567', 'abcdef', ' 28708', '287 082']) expect(verificarTotp(SECRETO_RFC, malo, ahora, null)).toBeNull();
  });

  it('base32 de RFC 4648 sin relleno, ida y vuelta', () => {
    expect(base32(Buffer.from('foobar'))).toBe('MZXW6YTBOI');
    expect(base32(SECRETO_RFC)).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    const s = generarSecretoTotp();
    expect(s).toHaveLength(20);
    expect(desdeBase32(base32(s))).toEqual(s);
    expect(desdeBase32(claveLegible(s).toLowerCase())).toEqual(s);
  });

  it('URI otpauth con emisor, cuenta y parámetros', () => {
    const texto = otpauthUri(SECRETO_RFC, 'validador@fiavl.test');
    expect(texto.startsWith('otpauth://totp/FIAVL:validador%40fiavl.test?')).toBe(true);
    const uri = new URL(texto);
    expect(uri.searchParams.get('secret')).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(uri.searchParams.get('issuer')).toBe('FIAVL');
    expect(uri.searchParams.get('digits')).toBe('6');
    expect(uri.searchParams.get('period')).toBe('30');
  });
});
