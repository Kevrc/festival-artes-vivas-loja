import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { correoUnico, crearAppIdentidad } from './app';

// T095 · avisos de Convocatorias (003) con la forma de sus eventos en main.
let ctx: Awaited<ReturnType<typeof crearAppIdentidad>>;
let manejar: (evento: { id: string; tipo: string }) => Promise<void>;
beforeAll(async () => {
  ctx = await crearAppIdentidad();
  const { MANEJADORES_IDENTIDAD } = await import('../../src/modules/identidad/application/puertos');
  const manejadores = ctx.app.get<{ tipo: string; esquema: { parse: (x: unknown) => { id: string; tipo: string } }; manejar: (e: unknown) => Promise<void> }[]>(MANEJADORES_IDENTIDAD);
  manejar = async (e) => {
    const m = manejadores.find((x) => x.tipo === e.tipo)!;
    await m.manejar(m.esquema.parse(e));
  };
});
afterAll(() => ctx.cerrar());

const sobre = <T extends string>(tipo: T, datos: Record<string, unknown>) => ({
  id: randomUUID(), tipo, version: 1 as const, ocurridoEn: new Date().toISOString(), edicionId: randomUUID(), correlacionId: randomUUID(), datos,
});

describe('T095 · acuse, subsanación y resultado de postulaciones', () => {
  it('acuse, aviso de subsanación, segundo acuse al reenviar y resultado; postulacion_en_curso al día', async () => {
    const correo = correoUnico('postulante');
    await ctx.http().post('/api/identidad/registro').send({ nombre: 'Colectivo Umbral', correo, contrasena: 'Teatro-en-Loja-2026', aceptaPolitica: true, versionPolitica: 1 });
    const cuentaPostulanteId = (await ctx.db.cuenta.findUniqueOrThrow({ where: { correo } })).id;
    const ids = { postulacionId: randomUUID(), convocatoriaId: randomUUID(), cuentaPostulanteId, numero: 'PN-2026-0042' };
    const estado = async () => (await ctx.db.postulacionEnCurso.findUniqueOrThrow({ where: { postulacionId: ids.postulacionId } })).estado;
    const plantillas = async () => (await ctx.db.notificacion.findMany({ where: { correoDestino: correo }, orderBy: { creadaEn: 'asc' } })).map((n) => n.plantilla);

    await manejar(sobre('PostulacionEnviada', { ...ids, enviadaEn: new Date().toISOString() }));
    expect(await estado()).toBe('enviada');
    await manejar(sobre('SubsanacionSolicitada', { ...ids, detalle: 'Falta el rider técnico.', venceEn: '2026-07-01T23:59:00-05:00' }));
    expect(await estado()).toBe('subsanacion');
    const reenvio = sobre('PostulacionEnviada', { ...ids, enviadaEn: new Date().toISOString() });
    await manejar(reenvio);
    await manejar(reenvio); // repetido: sin tercer acuse
    expect(await estado()).toBe('enviada');
    await manejar(sobre('ResultadoPublicado', { ...ids, resultado: 'seleccionada' }));
    expect(await estado()).toBe('cerrada');

    expect(await plantillas()).toEqual(['acuse_postulacion', 'subsanacion', 'acuse_postulacion', 'resultado']);
    const subsanacion = await ctx.db.notificacion.findFirstOrThrow({ where: { correoDestino: correo, plantilla: 'subsanacion' } });
    expect(subsanacion.datos).toMatchObject({ numero: 'PN-2026-0042', detalle: 'Falta el rider técnico.' });
  });

  it('una postulación de una cuenta que no existe en Identidad no genera aviso', async () => {
    const ids = { postulacionId: randomUUID(), convocatoriaId: randomUUID(), cuentaPostulanteId: randomUUID(), numero: 'PN-2026-0099' };
    await manejar(sobre('PostulacionEnviada', { ...ids, enviadaEn: new Date().toISOString() }));
    expect(await ctx.db.notificacion.count({ where: { datos: { path: ['postulacionId'], equals: ids.postulacionId } } })).toBe(0);
    expect(await ctx.db.postulacionEnCurso.count({ where: { postulacionId: ids.postulacionId } })).toBe(1);
  });
});
