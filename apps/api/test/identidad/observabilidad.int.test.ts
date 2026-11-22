import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { correoUnico, crearAppIdentidad } from './app';

// T101 · métricas de Identidad y Operación en /metrics (Constitución IX), sin datos personales.
let ctx: Awaited<ReturnType<typeof crearAppIdentidad>>;
beforeAll(async () => (ctx = await crearAppIdentidad()));
afterAll(() => ctx.cerrar());

const valor = (texto: string, serie: string) => Number(texto.split('\n').find((l) => l.startsWith(serie))?.split(' ').pop() ?? 0);

describe('T101 · observabilidad', () => {
  it('expone inicios de sesión, bloqueos, notificaciones y cambios de funciones', async () => {
    const antes = (await ctx.http().get('/metrics')).text;
    const correo = correoUnico('metricas');
    for (let i = 0; i < 5; i++) await ctx.http().post('/api/identidad/sesion').send({ correo, contrasena: `mala-${i}-xxxxxx` });
    const despues = (await ctx.http().get('/metrics')).text;
    expect(valor(despues, 'identidad_inicios_sesion_total{resultado="fallido"}') - valor(antes, 'identidad_inicios_sesion_total{resultado="fallido"}')).toBe(5);
    for (const serie of ['identidad_notificaciones_total', 'identidad_bloqueos_total', 'operacion_funciones_total']) {
      expect(despues).toContain(`# TYPE ${serie} counter`);
    }
    expect(despues).not.toContain(correo);
  });
});
