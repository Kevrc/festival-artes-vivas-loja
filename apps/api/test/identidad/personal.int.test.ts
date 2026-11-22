import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CUENTAS_PRUEBA } from '../../../../prisma/seed/identidad';
import { codigoTotp, desdeBase32, pasoDe } from '../../src/modules/identidad/domain/totp';
import { correoUnico, crearAppIdentidad, esperarEnvios, tokenDelCorreo } from './app';

// T080: US9 — cuentas del personal, segundo factor y roles con alcance, contra PostgreSQL real.
let ctx: Awaited<ReturnType<typeof crearAppIdentidad>>;
beforeAll(async () => {
  ctx = await crearAppIdentidad();
  ctx.reloj.ahora = new Date('2026-11-10T08:00:00-05:00');
});
afterAll(() => ctx.cerrar());

const CLAVE = 'Validar-en-el-Bolivar-26';
const BOLIVAR = { tipo: 'sede', valor: '6f1c7a8e-0000-4000-8000-000000000001' } as const;
const SECRETO_SEMILLA = desdeBase32(CUENTAS_PRUEBA.secretoTotp);

/** Cada verificación TOTP necesita un paso nuevo (el mismo código no sirve dos veces). */
const avanzar = (segundos = 31) => (ctx.reloj.ahora = new Date(ctx.reloj.ahora.getTime() + segundos * 1000));
const codigoAhora = (secreto: Buffer) => codigoTotp(secreto, pasoDe(ctx.reloj.ahora));
const cookieDe = (r: { headers: Record<string, unknown> }) =>
  (r.headers['set-cookie'] as string[] | undefined)?.find((c) => c.startsWith('fiavl_sesion='))?.split(';')[0] ?? '';

async function ingresar(correo: string, contrasena: string) {
  const r = await ctx.http().post('/api/identidad/sesion').send({ correo, contrasena });
  expect(r.status).toBe(200);
  return { cookie: cookieDe(r), yo: r.body, respuesta: r };
}

/** Sesión completa (con TOTP) de una cuenta sembrada. */
async function sesionSembrada(correo: string) {
  const { cookie } = await ingresar(correo, CUENTAS_PRUEBA.contrasena);
  avanzar();
  const v = await ctx.http().post('/api/identidad/segundo-factor/verificacion').set('Cookie', cookie).send({ codigo: codigoAhora(SECRETO_SEMILLA) });
  expect(v.status).toBe(200);
  return cookie;
}

let admin = '';
const comoAdmin = () => ({ Cookie: admin });

/** El administrador crea la cuenta y el titular elige su contraseña con el enlace del correo. */
async function crearPersonal(roles: unknown[], nombre = 'Valeria Ordóñez') {
  const correo = correoUnico('personal');
  const r = await ctx.http().post('/api/identidad/personal').set(comoAdmin()).send({ nombre, correo, roles });
  expect(r.status).toBe(201);
  await esperarEnvios();
  const token = tokenDelCorreo(ctx.correo, correo);
  expect((await ctx.http().post('/api/identidad/recuperacion/confirmacion').send({ token, contrasenaNueva: CLAVE })).status).toBe(204);
  return { correo, cuentaId: r.body.cuentaId as string, alta: r.body };
}

/** Primer ingreso: da de alta el TOTP y lo verifica; devuelve la cookie completa y el secreto. */
async function primerIngreso(correo: string) {
  const { cookie } = await ingresar(correo, CLAVE);
  const alta = await ctx.http().post('/api/identidad/segundo-factor/alta').set('Cookie', cookie);
  expect(alta.status).toBe(200);
  const secreto = desdeBase32(new URL(alta.body.otpauthUri).searchParams.get('secret')!);
  avanzar();
  const v = await ctx.http().post('/api/identidad/segundo-factor/verificacion').set('Cookie', cookie).send({ codigo: codigoAhora(secreto) });
  expect(v.status).toBe(200);
  // Una cuenta creada por el administrador nunca aceptó la política: la acepta al primer ingreso (US11-AS4).
  expect(v.body.politicaPendiente).toBe('1');
  expect((await ctx.http().post('/api/identidad/yo/politica').set('Cookie', cookie).send({ version: '1' })).status).toBe(204);
  return { cookie, secreto };
}

const auditoria = (accion: string, entidadId: string) => ctx.db.auditoriaIdentidad.findMany({ where: { accion, entidadId } });

describe('US9 — cuentas del personal, roles y segundo factor', () => {
  beforeAll(async () => {
    admin = await sesionSembrada('admin@fiavl.test');
  });

  it('US9-AS3: el primer ingreso exige configurar el segundo factor antes de continuar', async () => {
    const { correo, cuentaId, alta } = await crearPersonal([{ rol: 'validador', alcance: BOLIVAR }]);
    expect(alta).toMatchObject({ correo, estado: 'pendiente_verificacion', segundoFactorActivo: false, roles: [{ rol: 'validador', alcance: BOLIVAR }] });

    const { cookie, yo, respuesta } = await ingresar(correo, CLAVE);
    expect(yo).toMatchObject({ segundoFactorOk: false, segundoFactorActivo: false, esPersonal: true, correoVerificado: true });
    expect((respuesta.headers['set-cookie'] as unknown as string[]).join()).toMatch(/Max-Age=28800/); // 8 h para el personal

    // Restringida: solo /yo y el alta o verificación del TOTP.
    expect((await ctx.http().get('/api/identidad/yo').set('Cookie', cookie)).status).toBe(200);
    const bloqueada = await ctx.http().get('/api/identidad/yo/sesiones').set('Cookie', cookie);
    expect(bloqueada.status).toBe(403);
    expect(bloqueada.body.codigo).toBe('segundo_factor_requerido');
    expect((await ctx.http().patch('/api/identidad/yo').set('Cookie', cookie).send({ nombre: 'Otra' })).status).toBe(403);
    expect((await ctx.http().post('/api/identidad/segundo-factor/verificacion').set('Cookie', cookie).send({ codigo: '123456' })).body.codigo).toBe('sin_segundo_factor');

    const r = await ctx.http().post('/api/identidad/segundo-factor/alta').set('Cookie', cookie);
    expect(r.status).toBe(200);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.body.qrSvg).toMatch(/^<svg/);
    expect(r.body.clave).toMatch(/^([A-Z2-7]{4} ){7}[A-Z2-7]{4}$/);
    const secreto = desdeBase32(new URL(r.body.otpauthUri).searchParams.get('secret')!);
    // En la base el secreto va cifrado (AES-256-GCM), nunca en claro.
    const credencial = await ctx.db.credencial.findUniqueOrThrow({ where: { cuentaId } });
    expect(Buffer.from(credencial.totpSecretoCifrado!).includes(secreto)).toBe(false);
    expect(credencial.totpActivo).toBe(false);

    avanzar();
    const mala = await ctx.http().post('/api/identidad/segundo-factor/verificacion').set('Cookie', cookie).send({ codigo: codigoTotp(secreto, pasoDe(ctx.reloj.ahora) + 5) });
    expect(mala.status).toBe(401);
    expect(mala.body.codigo).toBe('codigo_invalido');
    const codigo = codigoAhora(secreto);
    const ok = await ctx.http().post('/api/identidad/segundo-factor/verificacion').set('Cookie', cookie).send({ codigo });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ segundoFactorOk: true, segundoFactorActivo: true, politicaPendiente: '1' });
    // Falta aceptar la política: hasta entonces solo puede aceptarla (US11-AS4).
    expect((await ctx.http().get('/api/identidad/yo/sesiones').set('Cookie', cookie)).body.codigo).toBe('requiere_politica');
    expect((await ctx.http().post('/api/identidad/yo/politica').set('Cookie', cookie).send({ version: '1' })).status).toBe(204);
    expect((await ctx.http().get('/api/identidad/yo/sesiones').set('Cookie', cookie)).status).toBe(200);
    expect(await ctx.db.auditoriaIdentidad.count({ where: { accion: 'segundo_factor.activado', actorId: cuentaId } })).toBe(1);

    // Con el TOTP activo, una sesión nueva solo lo verifica: no puede darlo de alta otra vez.
    const otra = await ingresar(correo, CLAVE);
    expect(otra.yo).toMatchObject({ segundoFactorOk: false, segundoFactorActivo: true });
    expect((await ctx.http().post('/api/identidad/segundo-factor/alta').set('Cookie', otra.cookie)).body.codigo).toBe('segundo_factor_activo');
    // El mismo código (mismo paso) no sirve dos veces.
    expect((await ctx.http().post('/api/identidad/segundo-factor/verificacion').set('Cookie', otra.cookie).send({ codigo })).status).toBe(401);
    avanzar();
    expect((await ctx.http().post('/api/identidad/segundo-factor/verificacion').set('Cookie', otra.cookie).send({ codigo: codigoAhora(secreto) })).status).toBe(200);

    // FR-024: los inicios de sesión del personal quedan auditados.
    expect((await ctx.db.auditoriaIdentidad.findMany({ where: { accion: 'sesion.inicio_personal', actorId: cuentaId } })).length).toBe(2);
  });

  it('5 códigos fallidos cierran la sesión y bloquean la cuenta 15 minutos', async () => {
    const { correo, cuentaId } = await crearPersonal([{ rol: 'taquilla', alcance: BOLIVAR }]);
    const { cookie } = await primerIngreso(correo);
    const nueva = await ingresar(correo, CLAVE);
    for (let i = 0; i < 5; i++) {
      expect((await ctx.http().post('/api/identidad/segundo-factor/verificacion').set('Cookie', nueva.cookie).send({ codigo: '000000' })).status).toBe(401);
    }
    expect((await ctx.http().get('/api/identidad/yo').set('Cookie', nueva.cookie)).status).toBe(401);
    expect((await ctx.http().get('/api/identidad/yo').set('Cookie', cookie)).status).toBe(401);
    expect((await ctx.http().post('/api/identidad/sesion').send({ correo, contrasena: CLAVE })).status).toBe(401);
    expect(await auditoria('cuenta.bloqueada', cuentaId)).toHaveLength(1);
    avanzar(16 * 60);
  });

  it('el alcance es obligatorio según el rol y solo el administrador gestiona el personal', async () => {
    const enviar = (roles: unknown[]) => ctx.http().post('/api/identidad/personal').set(comoAdmin()).send({ nombre: 'Sin alcance', correo: correoUnico('x'), roles });
    expect((await enviar([{ rol: 'taquilla' }])).body.codigo).toBe('alcance_requerido');
    expect((await enviar([{ rol: 'curador', alcance: BOLIVAR }])).body.codigo).toBe('alcance_invalido');
    expect((await enviar([{ rol: 'programador', alcance: BOLIVAR }])).body.codigo).toBe('alcance_no_aplica');
    expect((await enviar([{ rol: 'asistente' }])).body.codigo).toBe('rol_personal_requerido');

    const programador = await sesionSembrada('programador@fiavl.test');
    expect((await ctx.http().get('/api/identidad/personal').set('Cookie', programador)).status).toBe(403);
    expect((await ctx.http().get('/api/identidad/personal')).status).toBe(401);
    const lista = await ctx.http().get('/api/identidad/personal').set(comoAdmin());
    expect(lista.status).toBe(200);
    expect(lista.body.map((c: { correo: string }) => c.correo)).toEqual(expect.arrayContaining(['admin@fiavl.test', 'validador.bolivar@fiavl.test']));
    expect(lista.body.find((c: { correo: string }) => c.correo === 'validador.bolivar@fiavl.test')).toMatchObject({
      roles: [{ rol: 'validador', alcance: { tipo: 'sede' } }],
      segundoFactorActivo: true,
    });
  });

  it('US9-AS4: el cambio de rol queda auditado, se publica RolAsignado y rige en la siguiente petición', async () => {
    const { correo, cuentaId } = await crearPersonal([{ rol: 'validador', alcance: BOLIVAR }]);
    const { cookie } = await primerIngreso(correo);
    expect((await ctx.http().get('/api/operacion/ediciones').set('Cookie', cookie)).status).toBe(403);

    ctx.publicados.length = 0;
    const r = await ctx.http().put(`/api/identidad/personal/${cuentaId}/roles`).set(comoAdmin()).send({ roles: [{ rol: 'programador', alcance: null }] });
    expect(r.status).toBe(200);
    expect(r.body.roles).toEqual([{ rol: 'programador', alcance: null }]);
    // Misma sesión, sin volver a ingresar: el permiso nuevo ya rige.
    expect((await ctx.http().get('/api/operacion/ediciones').set('Cookie', cookie)).status).toBe(200);

    const [fila] = await auditoria('personal.roles_cambiados', cuentaId);
    expect(fila).toMatchObject({ rol: 'administrador', anterior: { roles: [{ rol: 'validador', alcance: BOLIVAR }] }, nuevo: { roles: [{ rol: 'programador', alcance: null }] } });
    expect(ctx.publicados.map((e) => e.tipo === 'RolAsignado' && [e.datos.rol, e.datos.operacion])).toEqual([
      ['programador', 'asignado'],
      ['validador', 'revocado'],
    ]);
    // El historial de roles se conserva: el revocado queda con fecha.
    expect(await ctx.db.rolAsignado.count({ where: { cuentaId, revocadoEn: { not: null } } })).toBe(1);

    // Mismos roles otra vez: sin cambios, sin eventos ni auditoría nuevos.
    ctx.publicados.length = 0;
    await ctx.http().put(`/api/identidad/personal/${cuentaId}/roles`).set(comoAdmin()).send({ roles: [{ rol: 'programador', alcance: null }] });
    expect(ctx.publicados).toHaveLength(0);
    expect(await auditoria('personal.roles_cambiados', cuentaId)).toHaveLength(1);
  });

  it('una cuenta del público que pasa a ser personal pierde sus sesiones abiertas (debe pasar por el TOTP)', async () => {
    const correo = correoUnico('publico');
    await ctx.http().post('/api/identidad/registro').send({ nombre: 'Luis Jaramillo', correo, contrasena: CLAVE, aceptaPolitica: true, versionPolitica: 1 });
    const { cookie } = await ingresar(correo, CLAVE);
    const r = await ctx.http().post('/api/identidad/personal').set(comoAdmin()).send({ nombre: 'Luis Jaramillo', correo, roles: [{ rol: 'jefe_sala', alcance: BOLIVAR }] });
    expect(r.status).toBe(201);
    expect(r.body.roles).toEqual([{ rol: 'jefe_sala', alcance: BOLIVAR }]);
    expect((await ctx.http().get('/api/identidad/yo').set('Cookie', cookie)).status).toBe(401);
    expect((await ingresar(correo, CLAVE)).yo.segundoFactorOk).toBe(false);
  });

  it('US9-AS5: desactivar quita el acceso de inmediato y conserva el historial; reactivar lo devuelve', async () => {
    const { correo, cuentaId } = await crearPersonal([{ rol: 'jefe_sala', alcance: BOLIVAR }]);
    const { cookie, secreto } = await primerIngreso(correo);
    expect((await ctx.http().put(`/api/identidad/personal/${cuentaId}/estado`).set(comoAdmin()).send({ estado: 'desactivada' })).status).toBe(204);
    expect((await ctx.http().get('/api/identidad/yo').set('Cookie', cookie)).status).toBe(401);
    const intento = await ctx.http().post('/api/identidad/sesion').send({ correo, contrasena: CLAVE });
    expect(intento.status).toBe(401);
    expect(intento.body.codigo).toBe('credenciales_invalidas');
    expect(await ctx.db.rolAsignado.count({ where: { cuentaId, revocadoEn: null } })).toBe(1);
    expect(await ctx.db.auditoriaIdentidad.count({ where: { entidadId: cuentaId } })).toBeGreaterThan(1);
    expect((await auditoria('personal.desactivada', cuentaId))[0]?.nuevo).toMatchObject({ estado: 'desactivada', sesionesCerradas: 1 });

    expect((await ctx.http().put(`/api/identidad/personal/${cuentaId}/estado`).set(comoAdmin()).send({ estado: 'verificada' })).status).toBe(204);
    const vuelta = await ingresar(correo, CLAVE);
    avanzar();
    expect((await ctx.http().post('/api/identidad/segundo-factor/verificacion').set('Cookie', vuelta.cookie).send({ codigo: codigoAhora(secreto) })).status).toBe(200);
  });

  it('restablecer el segundo factor exige motivo, cierra sus sesiones y queda auditado', async () => {
    const { correo, cuentaId } = await crearPersonal([{ rol: 'validador', alcance: BOLIVAR }]);
    const { cookie } = await primerIngreso(correo);
    const url = `/api/identidad/personal/${cuentaId}/segundo-factor`;
    expect((await ctx.http().delete(url).set(comoAdmin()).send({})).status).toBe(400);
    expect((await ctx.http().delete(url).set(comoAdmin()).send({ motivo: 'Perdió el teléfono' })).status).toBe(204);
    expect((await ctx.http().get('/api/identidad/yo').set('Cookie', cookie)).status).toBe(401);
    expect((await auditoria('segundo_factor.restablecido', cuentaId))[0]?.nuevo).toMatchObject({ motivo: 'Perdió el teléfono' });
    const { yo } = await ingresar(correo, CLAVE);
    expect(yo).toMatchObject({ segundoFactorOk: false, segundoFactorActivo: false });
  });

  it('el administrador no puede desactivarse ni quitarse su propio rol', async () => {
    const yo = (await ctx.http().get('/api/identidad/yo').set(comoAdmin())).body.cuentaId as string;
    expect((await ctx.http().put(`/api/identidad/personal/${yo}/estado`).set(comoAdmin()).send({ estado: 'desactivada' })).body.codigo).toBe('accion_sobre_si_mismo');
    expect((await ctx.http().put(`/api/identidad/personal/${yo}/roles`).set(comoAdmin()).send({ roles: [] })).body.codigo).toBe('accion_sobre_si_mismo');
    expect((await ctx.http().put(`/api/identidad/personal/00000000-0000-4000-8000-000000000000/roles`).set(comoAdmin()).send({ roles: [] })).status).toBe(404);
  });

  it('el público no tiene segundo factor', async () => {
    const correo = correoUnico('publico');
    await ctx.http().post('/api/identidad/registro').send({ nombre: 'Ana Torres', correo, contrasena: CLAVE, aceptaPolitica: true, versionPolitica: 1 });
    const { cookie, yo } = await ingresar(correo, CLAVE);
    expect(yo).toMatchObject({ segundoFactorOk: true, esPersonal: false });
    expect((await ctx.http().post('/api/identidad/segundo-factor/alta').set('Cookie', cookie)).body.codigo).toBe('solo_personal');
  });
});
