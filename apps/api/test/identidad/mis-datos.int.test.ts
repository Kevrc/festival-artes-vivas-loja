import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { correoUnico, crearAppIdentidad, esperarEnvios } from './app';

// T114 · US11 — mis datos personales (LOPDP): descarga, eliminación y nueva versión de la política.
let ctx: Awaited<ReturnType<typeof crearAppIdentidad>>;
let olvidarPolitica: () => void;
beforeAll(async () => {
  ctx = await crearAppIdentidad();
  const { SesionServicio } = await import('../../src/modules/identidad/application/sesion/sesion.servicio');
  const s = ctx.app.get(SesionServicio);
  olvidarPolitica = () => s.olvidarPoliticaVigente();
});
afterAll(() => ctx.cerrar());
beforeEach(() => {
  ctx.reloj.ahora = new Date('2026-11-10T12:00:00-05:00');
});

const CLAVE = 'Mis-datos-del-festival';

async function cuentaConSesion(nombre = 'Marta Ruiz') {
  const correo = correoUnico('lopdp');
  await ctx.http().post('/api/identidad/registro').send({ nombre, correo, contrasena: CLAVE, aceptaPolitica: true, versionPolitica: 1, aceptaNovedades: true });
  await esperarEnvios();
  const r = await ctx.http().post('/api/identidad/sesion').send({ correo, contrasena: CLAVE });
  const cookie = (r.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('fiavl_sesion='))!.split(';')[0]!;
  const cuentaId = r.body.cuentaId as string;
  return { correo, cookie, cuentaId };
}

describe('US11 — mis datos personales', () => {
  it('US11-AS1: descarga un JSON con cuenta, consentimientos, sesiones y notificaciones, sin secretos', async () => {
    const { correo, cookie, cuentaId } = await cuentaConSesion();
    await ctx.db.notificacion.create({
      data: { id: randomUUID(), cuentaId, correoDestino: correo, plantilla: 'entradas_emitidas', categoria: 'servicio', claveDedup: `x:${randomUUID()}:${correo}`, datos: {}, estado: 'enviada' },
    });
    const r = await ctx.http().get('/api/identidad/yo/datos').set('Cookie', cookie);
    expect(r.status).toBe(200);
    expect(r.headers['content-disposition']).toContain('mis-datos-fiavl.json');
    expect(r.body.cuenta).toMatchObject({ id: cuentaId, nombre: 'Marta Ruiz', correo, estado: 'pendiente_verificacion' });
    expect(r.body.consentimientos.map((c: { documento: string }) => c.documento).sort()).toEqual(['novedades', 'politica_privacidad']);
    expect(r.body.sesiones).toHaveLength(1);
    expect(r.body.notificaciones).toHaveLength(1);
    const texto = JSON.stringify(r.body);
    for (const prohibido of ['scrypt$', 'hashToken', 'totpSecreto', cookie.split('=')[1]!]) expect(texto).not.toContain(prohibido);
    expect(await ctx.db.auditoriaIdentidad.count({ where: { accion: 'cuenta.datos_descargados', actorId: cuentaId } })).toBe(1);
  });

  it('US11-AS2: sin entradas futuras se anonimiza, no puede ingresar y se publica CuentaEliminada', async () => {
    const { correo, cookie, cuentaId } = await cuentaConSesion();
    await ctx.db.notificacion.create({
      data: { id: randomUUID(), cuentaId, correoDestino: correo, plantilla: 'devolucion', categoria: 'servicio', claveDedup: `y:${randomUUID()}:${correo}`, datos: { importeCentavos: 500 }, estado: 'enviada' },
    });
    expect((await ctx.http().get('/api/identidad/yo/eliminacion').set('Cookie', cookie)).body).toEqual({ funcionesFuturas: [], postulacionesEnCurso: 0 });
    expect((await ctx.http().post('/api/identidad/yo/eliminacion').set('Cookie', cookie).send({ contrasena: 'otra-clave-cualquiera' })).body.codigo).toBe('credenciales_invalidas');
    ctx.publicados.length = 0;
    const r = await ctx.http().post('/api/identidad/yo/eliminacion').set('Cookie', cookie).send({ contrasena: CLAVE });
    expect(r.status).toBe(204);
    expect((r.headers['set-cookie'] as unknown as string[]).join()).toMatch(/fiavl_sesion=;/);

    const c = await ctx.db.cuenta.findUniqueOrThrow({ where: { id: cuentaId }, include: { credencial: true, sesiones: true, consentimientos: true } });
    expect(c).toMatchObject({ nombre: 'Cuenta eliminada', correo: `eliminada+${cuentaId}@anonimo.invalid`, estado: 'eliminada', credencial: null, sesiones: [] });
    expect(c.consentimientos.map((x) => x.documento)).toEqual(['politica_privacidad']);
    const n = await ctx.db.notificacion.findMany({ where: { cuentaId } });
    expect(n.every((x) => x.correoDestino === c.correo && JSON.stringify(x.datos) === '{}')).toBe(true);
    expect(await ctx.db.auditoriaIdentidad.count({ where: { entidadId: cuentaId } })).toBeGreaterThan(1); // la auditoría se conserva
    expect(ctx.publicados.filter((e) => e.tipo === 'CuentaEliminada').map((e) => e.datos)).toEqual([{ cuentaId, eliminadaEn: expect.any(String) }]);
    expect((await ctx.http().get('/api/identidad/yo').set('Cookie', cookie)).status).toBe(401);
    expect((await ctx.http().post('/api/identidad/sesion').send({ correo, contrasena: CLAVE })).status).toBe(401);
    // El correo queda libre para una cuenta nueva.
    expect((await ctx.http().post('/api/identidad/registro').send({ nombre: 'Otra', correo, contrasena: CLAVE, aceptaPolitica: true, versionPolitica: 1 })).status).toBe(202);
  });

  it('US11-AS3: con entradas para una función futura o una postulación en curso se informa y pide confirmar', async () => {
    const { correo, cookie, cuentaId } = await cuentaConSesion();
    const funcionId = randomUUID();
    await ctx.db.funcionAviso.create({ data: { funcionId, titulo: 'Bondi Beach', sedeNombre: 'Teatro Bolívar', inicio: new Date('2026-11-13T20:00:00-05:00'), fin: new Date('2026-11-13T21:15:00-05:00'), estado: 'programada', version: 1 } });
    await ctx.db.destinatarioFuncion.create({ data: { pedidoId: randomUUID(), funcionId, cuentaId, correo: null } });
    await ctx.db.postulacionEnCurso.create({ data: { postulacionId: randomUUID(), cuentaId, estado: 'enviada' } });

    const ev = await ctx.http().get('/api/identidad/yo/eliminacion').set('Cookie', cookie);
    expect(ev.body).toMatchObject({ funcionesFuturas: [{ funcionId, titulo: 'Bondi Beach' }], postulacionesEnCurso: 1 });
    const sin = await ctx.http().post('/api/identidad/yo/eliminacion').set('Cookie', cookie).send({ contrasena: CLAVE });
    expect(sin.status).toBe(409);
    expect(sin.body.codigo).toBe('funciones_futuras');
    expect(await ctx.db.cuenta.count({ where: { id: cuentaId, estado: 'eliminada' } })).toBe(0);

    expect((await ctx.http().post('/api/identidad/yo/eliminacion').set('Cookie', cookie).send({ contrasena: CLAVE, asumoPerdida: true })).status).toBe(204);
    expect(await ctx.db.destinatarioFuncion.count({ where: { funcionId } })).toBe(0);
    expect(await ctx.db.postulacionEnCurso.count({ where: { cuentaId } })).toBe(0);
    expect((await ctx.db.cuenta.findUniqueOrThrow({ where: { id: cuentaId } })).correo).not.toBe(correo);
  });

  it('US11-AS4: una versión nueva de la política restringe la sesión hasta aceptarla y registra cuál y cuándo', async () => {
    ctx.reloj.ahora = new Date('2030-01-02T12:00:00-05:00');
    const { cookie, cuentaId } = await cuentaConSesion();
    const version = 1000 + Math.floor(Math.random() * 1_000_000);
    // Vigente desde 2030: las demás pruebas (relojes de 2026) siguen viendo la v1 aunque compartan la base.
    await ctx.db.documentoLegal.create({ data: { documento: 'politica_privacidad', version, url: '/privacidad', vigenteDesde: new Date('2030-01-01T00:00:00-05:00') } });
    ctx.reloj.ahora = new Date('2030-01-02T12:00:00-05:00');
    olvidarPolitica();
    try {
      const yo = await ctx.http().get('/api/identidad/yo').set('Cookie', cookie);
      expect(yo.status).toBe(200);
      expect(yo.body.politicaPendiente).toBe(String(version));
      const bloqueada = await ctx.http().get('/api/identidad/yo/sesiones').set('Cookie', cookie);
      expect(bloqueada.status).toBe(403);
      expect(bloqueada.body.codigo).toBe('requiere_politica');
      expect((await ctx.http().get('/api/identidad/yo/datos').set('Cookie', cookie)).status).toBe(200); // sus datos, siempre
      expect((await ctx.http().post('/api/identidad/yo/politica').set('Cookie', cookie).send({ version: '1' })).body.codigo).toBe('politica_no_aceptada');

      ctx.reloj.ahora = new Date('2030-01-02T13:00:00-05:00');
      expect((await ctx.http().post('/api/identidad/yo/politica').set('Cookie', cookie).send({ version: String(version) })).status).toBe(204);
      expect((await ctx.http().get('/api/identidad/yo/sesiones').set('Cookie', cookie)).status).toBe(200);
      const c = await ctx.db.consentimiento.findFirstOrThrow({ where: { cuentaId, documento: 'politica_privacidad', version } });
      expect(c.aceptadoEn.toISOString()).toBe('2030-01-02T18:00:00.000Z');
    } finally {
      // Otras pruebas comparten la base: la versión de prueba deja de estar vigente.
      await ctx.db.consentimiento.deleteMany({ where: { documento: 'politica_privacidad', version } });
      await ctx.db.documentoLegal.delete({ where: { documento_version: { documento: 'politica_privacidad', version } } });
      olvidarPolitica();
    }
  });
});
