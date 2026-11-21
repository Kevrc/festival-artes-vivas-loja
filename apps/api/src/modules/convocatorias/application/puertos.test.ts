import { describe, expect, expectTypeOf, it } from 'vitest';
import type { AlmacenamientoDocumentosPort, AutorizacionConvocatoriasPort, EscanerAntivirusPort, PublicadorConvocatoriasPort } from './puertos';

describe('puertos de Convocatorias', () => {
  it('declara contratos implementables para storage, escáner, autorización y eventos', () => {
    expectTypeOf<AlmacenamientoDocumentosPort>().toHaveProperty('crearUrlDescarga');
    expectTypeOf<EscanerAntivirusPort>().toHaveProperty('escanear');
    expectTypeOf<AutorizacionConvocatoriasPort>().toHaveProperty('resolverDesdePeticion');
    expectTypeOf<PublicadorConvocatoriasPort>().toHaveProperty('publicar');
    expectTypeOf<AlmacenamientoDocumentosPort['leer']>().returns.toEqualTypeOf<Promise<Buffer>>();
  });
  it('mantiene una prueba ejecutable para localizar la frontera de aplicación', () => {
    expect(true).toBe(true);
  });
});
