import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { finDelDiaEnLoja } from '../../src/modules/identidad/domain/estudiantes';
import { correoUnico, crearAppIdentidad, esperarEnvios, tokenDelCorreo } from './app';

// T123 · US12 — condición de estudiante por dominio institucional, contra PostgreSQL real.
let ctx: Awaited<ReturnType<typeof crearAppIdentidad>>;
const DOMINIO = `u${randomUUID().slice(0, 8)}.edu.ec`;
const admin = { 'x-cuenta-dev': randomUUID(), 'x-roles-dev': 'administrador' };
beforeAll(async () => {
  ctx = await crearAppIdentidad();
  // La edición vigente la conoce Identidad por ProgramacionPublicada (RN-012).
  await ctx.db.edicionVigente.upsert({ where: { edicionId: '99999999-9999-4999-8999-999999999999' }, create: { edicionId: '99999999-9999-4999-8999-999999999999', fechaFin: new Date('2999-11-22T00:00:00Z') }, update: {} });
});
afterAll(() => ctx.cerrar());

const CLAVE = 'Estudio-teatro-en-Loja';
async function sesion() {
  const correo = correoUnico('estudiante');
  await ctx.http().post('/api/identidad/registro').send({ nombre: 'Lucía Paz', correo, contrasena: CLAVE, aceptaPolitica: true, versionPolitica: 1 });
  const r = await ctx.http().post('/api/identidad/sesion').send({ correo, contrasena: CLAVE });
  return { cookie: (r.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('fiavl_sesion='))!.split(';')[0]!, cuentaId: r.body.cuentaId as string };
}

describe('US12 — condición de estudiante', () => {
  it('solo el administrador registra dominios institucionales', async () => {
    expect((await ctx.http().post('/api/identidad/dominios-institucionales').set({ 'x-cuenta-dev': randomUUID(), 'x-roles-dev': 'programador' }).send({ dominio: DOMINIO, institucion: 'X' })).status).toBe(403);
    const r = await ctx.http().post('/api/identidad/dominios-institucionales').set(admin).send({ dominio: `@${DOMINIO.toUpperCase()}`, institucion: 'Universidad de Prueba' });
    expect(r.status).toBe(201);
    expect(r.body).toEqual({ dominio: DOMINIO, institucion: 'Universidad de Prueba' });
    expect((await ctx.http().post('/api/identidad/dominios-institucionales').set(admin).send({ dominio: DOMINIO, institucion: 'Otra' })).body.codigo).toBe('dominio_existente');
    expect((await ctx.http().get('/api/identidad/dominios-institucionales').set(admin)).body).toEqual(expect.arrayContaining([{ dominio: DOMINIO, institucion: 'Universidad de Prueba' }]));
  });

  it('US12-AS1: confirma un correo institucional (también de un subdominio) y queda acreditado hasta el fin de la edición', async () => {
    const { cookie, cuentaId } = await sesion();
    const institucional = `lucia.paz@alumnos.${DOMINIO}`;
    expect((await ctx.http().post('/api/identidad/yo/estudiante').set('Cookie', cookie).send({ correoInstitucional: institucional })).status).toBe(202);
    await esperarEnvios();
    const token = tokenDelCorreo(ctx.correo, institucional);

    // El enlace solo vale con la sesión de quien lo pidió.
    const otra = await sesion();
    expect((await ctx.http().post('/api/identidad/estudiante/confirmacion').set('Cookie', otra.cookie).send({ token })).status).toBe(410);

    const r = await ctx.http().post('/api/identidad/estudiante/confirmacion').set('Cookie', cookie).send({ token });
    expect(r.status).toBe(200);
    const fin = (await ctx.db.edicionVigente.findFirstOrThrow({ orderBy: { fechaFin: 'desc' } })).fechaFin.toISOString().slice(0, 10);
    expect(r.body).toEqual({ vigenteHasta: finDelDiaEnLoja(fin).toISOString(), institucion: 'Universidad de Prueba' });
    const a = await ctx.db.acreditacion.findFirstOrThrow({ where: { cuentaId } });
    expect(a).toMatchObject({ tipo: 'estudiante', evidencia: DOMINIO }); // el correo institucional no se guarda
    expect((await ctx.http().get('/api/identidad/yo').set('Cookie', cookie)).body.estudianteAcreditado).toBe(true);
    expect((await ctx.http().post('/api/identidad/estudiante/confirmacion').set('Cookie', cookie).send({ token })).body.codigo).toBe('enlace_usado');

    // Vencida la acreditación, el contexto deja de marcarla.
    await ctx.db.acreditacion.updateMany({ where: { cuentaId }, data: { vigenteHasta: new Date('2026-11-01T00:00:00Z') } });
    expect((await ctx.http().get('/api/identidad/yo').set('Cookie', cookie)).body.estudianteAcreditado).toBe(false);
  });

  it('un dominio no registrado se rechaza; como máximo 3 enlaces por hora', async () => {
    const { cookie } = await sesion();
    const r = await ctx.http().post('/api/identidad/yo/estudiante').set('Cookie', cookie).send({ correoInstitucional: 'ana@gmail.com' });
    expect(r.status).toBe(400);
    expect(r.body.codigo).toBe('dominio_no_institucional');
    for (let i = 0; i < 3; i++) expect((await ctx.http().post('/api/identidad/yo/estudiante').set('Cookie', cookie).send({ correoInstitucional: `x${i}@${DOMINIO}` })).status).toBe(202);
    expect((await ctx.http().post('/api/identidad/yo/estudiante').set('Cookie', cookie).send({ correoInstitucional: `x9@${DOMINIO}` })).body.codigo).toBe('limite_reenvios');
    expect((await ctx.http().post('/api/identidad/yo/estudiante').send({ correoInstitucional: `x@${DOMINIO}` })).status).toBe(401);
  });
});
