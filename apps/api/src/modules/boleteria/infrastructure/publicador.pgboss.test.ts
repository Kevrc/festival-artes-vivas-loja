import { ejemplo } from '@fiavl/contracts';
import { afterEach, describe, expect, it } from 'vitest';
import { PublicadorPgBossBoleteria } from './publicador.pgboss';

const evento = () =>
  ejemplo.disponibilidadCambiada(crypto.randomUUID(), {
    funcionId: crypto.randomUUID(),
    lugaresRestantes: 3,
    aforoHabilitado: 10,
    calculadoEn: new Date().toISOString(),
  });

// Cola deshabilitada: la prueba se centra en la captura en memoria
const colaApagada = { habilitada: false } as never;

describe('PublicadorPgBossBoleteria (revisión PR #6)', () => {
  const previo = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = previo;
  });

  it('fuera de pruebas no acumula eventos en memoria', async () => {
    process.env.NODE_ENV = 'production';
    const p = new PublicadorPgBossBoleteria(colaApagada);
    for (let i = 0; i < 3; i++) await p.publicar(evento());
    expect(p.publicados).toHaveLength(0);
  });

  it('en pruebas captura los eventos para verificarlos', async () => {
    process.env.NODE_ENV = 'test';
    const p = new PublicadorPgBossBoleteria(colaApagada);
    await p.publicar(evento());
    expect(p.publicados).toHaveLength(1);
  });
});
