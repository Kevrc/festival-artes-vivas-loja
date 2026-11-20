import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { AutorizacionConvocatoriasDevAdapter } from './autorizacion-dev.adapter';

describe('AutorizacionConvocatoriasDevAdapter', () => {
  it('acepta roles canónicos con cuenta y alcance, y rechaza cuenta ausente o rol inválido', async () => {
    const adapter = new AutorizacionConvocatoriasDevAdapter('test');
    const cuenta = randomUUID();
    await expect(adapter.resolverDesdePeticion({ headers: { 'x-cuenta-dev': cuenta, 'x-rol-dev': 'curador' } })).resolves.toMatchObject({ cuentaId: cuenta, roles: [{ rol: 'curador' }] });
    await expect(adapter.resolverDesdePeticion({ headers: { 'x-rol-dev': 'postulante' } })).resolves.toBeNull();
    await expect(adapter.resolverDesdePeticion({ headers: { 'x-cuenta-dev': cuenta, 'x-rol-dev': 'admin' } })).resolves.toBeNull();
  });
  it('falla cerrado en producción e interpreta cookie de desarrollo y provincia', async () => {
    const cuenta = randomUUID();
    const cookie = encodeURIComponent(JSON.stringify({ cuentaId: cuenta, rol: 'coordinación provincial' }));
    const adapter = new AutorizacionConvocatoriasDevAdapter('development');
    await expect(adapter.resolverDesdePeticion({ headers: { cookie: `sesion_dev=${cookie}`, 'x-provincia-dev': 'Loja' } })).resolves.toMatchObject({ roles: [{ rol: 'coordinación provincial', alcance: { provincia: 'Loja' } }] });
    await expect(new AutorizacionConvocatoriasDevAdapter('production').resolverDesdePeticion({ headers: { 'x-cuenta-dev': cuenta, 'x-rol-dev': 'coordinación de convocatorias' } })).resolves.toBeNull();
  });
  it('tolera el rol codificado o leído como latin1 por clientes HTTP con cuerpo', async () => {
    const adapter = new AutorizacionConvocatoriasDevAdapter('test');
    const cuenta = randomUUID();
    for (const rol of [encodeURIComponent('coordinación de convocatorias'), Buffer.from('coordinación de convocatorias', 'utf8').toString('latin1')]) {
      await expect(adapter.resolverDesdePeticion({ headers: { 'x-cuenta-dev': cuenta, 'x-rol-dev': rol } })).resolves.toMatchObject({ roles: [{ rol: 'coordinación de convocatorias' }] });
    }
  });
});
