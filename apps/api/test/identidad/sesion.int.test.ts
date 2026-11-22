import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { correoUnico, crearAppIdentidad, esperarEnvios, tokenDelCorreo } from './app';

// T072: US8 — inicio de sesión, bloqueo, recuperación y "Mis sesiones", contra PostgreSQL real.
let ctx: Awaited<ReturnType<typeof crearAppIdentidad>>;
beforeAll(async () => (ctx = await crearAppIdentidad()));
afterAll(() => ctx.cerrar());
beforeEach(() => {
  ctx.correo.enviados.length = 0;
  ctx.reloj.ahora = new Date('2026-11-10T12:00:00-05:00');
});

const CLAVE = 'Teatro-en-Loja-2026';
const NAVEGADOR = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36';

/** Cuenta verificada lista para ingresar. */
async function cuentaVerificada(correo = correoUnico()) {
  await ctx.http().post('/api/identidad/registro').send({ nombre: 'Ana Torres', correo, contrasena: CLAVE, aceptaPolitica: true, versionPolitica: 1 });
  await esperarEnvios();
  await ctx.http().post('/api/identidad/verificacion').send({ token: tokenDelCorreo(ctx.correo, correo) });
  return correo;
}
const ingresar = (correo: string, contrasena = CLAVE, agente = NAVEGADOR) =>
  ctx.http().post('/api/identidad/sesion').set('User-Agent', agente).send({ correo, contrasena });
/** "fiavl_sesion=…" de la respuesta, listo para la cabecera Cookie. */
const cookieDe = (r: { headers: Record<string, unknown> }) => {
  const lista = r.headers['set-cookie'] as string[] | undefined;
  return lista?.find((c) => c.startsWith('fiavl_sesion='))?.split(';')[0] ?? '';
};

describe('US8 — inicio de sesión y recuperación', () => {
  it('US8-AS1: con credenciales correctas entra; la cookie es HttpOnly, SameSite=Lax y dura 30 días', async () => {
    const correo = await cuentaVerificada();
    const r = await ingresar(` ${correo.toUpperCase()} `);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ correo, correoVerificado: true, segundoFactorOk: true, politicaPendiente: null, roles: [] });
    const cookie = (r.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('fiavl_sesion='))!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Max-Age=2592000/);
    expect(JSON.stringify(r.body)).not.toContain(cookieDe(r).split('=')[1]); // el token no va en el cuerpo
    const yo = await ctx.http().get('/api/identidad/yo').set('Cookie', cookieDe(r));
    expect(yo.status).toBe(200);
    expect(yo.body.correo).toBe(correo);
    // La base guarda solo el SHA-256 del token.
    const sesion = await ctx.db.sesion.findFirstOrThrow({ where: { cuenta: { correo } } });
    expect(Buffer.from(sesion.hashToken).toString('base64url')).not.toBe(cookieDe(r).split('=')[1]);
    expect(sesion.dispositivo).toBe('Chrome en Windows');
    expect(sesion.expiraEn.getTime() - sesion.creadaEn.getTime()).toBe(30 * 24 * 3_600_000);
  });

  it('FR-016: correo inexistente y contraseña errónea dan la misma respuesta', async () => {
    const correo = await cuentaVerificada();
    const mala = await ingresar(correo, 'Otra-clave-incorrecta');
    const nadie = await ingresar(correoUnico('nadie'), 'Otra-clave-incorrecta');
    expect(mala.status).toBe(401);
    expect(nadie.status).toBe(401);
    expect(mala.body).toEqual(nadie.body);
    expect(mala.body.codigo).toBe('credenciales_invalidas');
    expect(mala.headers['set-cookie']).toBeUndefined();
  });

  it('US8-AS2: 5 fallos en 15 minutos bloquean la cuenta 15 minutos y se avisa al titular', async () => {
    const correo = await cuentaVerificada();
    ctx.correo.enviados.length = 0;
    for (let i = 0; i < 5; i++) expect((await ingresar(correo, `mala-clave-${i}-xx`)).status).toBe(401);
    const bloqueada = await ingresar(correo); // contraseña correcta, pero bloqueada
    expect(bloqueada.status).toBe(401);
    expect(bloqueada.body).toEqual((await ingresar(correoUnico('nadie'), 'x'.repeat(12))).body); // mismo mensaje
    await esperarEnvios();
    expect(ctx.correo.enviados).toEqual([expect.objectContaining({ para: correo, asunto: 'Bloqueamos tu cuenta por seguridad · FIAVL' })]);
    expect((await ctx.db.cuenta.findUniqueOrThrow({ where: { correo } })).bloqueadaHasta).not.toBeNull();
    ctx.reloj.ahora = new Date(ctx.reloj.ahora.getTime() + 16 * 60_000);
    expect((await ingresar(correo)).status).toBe(200); // se levanta sola
  });

  it('US8-AS3: el enlace de recuperación vale una vez; al cambiar la contraseña se cierran las sesiones', async () => {
    const correo = await cuentaVerificada();
    const otra = await ingresar(correo);
    expect((await ctx.http().post('/api/identidad/recuperacion').send({ correo })).status).toBe(202);
    await esperarEnvios();
    const mensaje = ctx.correo.enviados.find((m) => m.para === correo && m.asunto.startsWith('Elige'))!;
    const token = mensaje.texto.match(/token=([A-Za-z0-9_-]+)/)![1]!;
    expect(mensaje.texto).toContain('https://fiavl.test/cuenta/recuperar/nueva?token=');

    const filtrada = await ctx.http().post('/api/identidad/recuperacion/confirmacion').send({ token, contrasenaNueva: '1234567890' });
    expect(filtrada.body.codigo).toBe('contrasena_filtrada');
    const ok = await ctx.http().post('/api/identidad/recuperacion/confirmacion').send({ token, contrasenaNueva: 'Nueva-clave-del-festival' });
    expect(ok.status).toBe(204);
    const otraVez = await ctx.http().post('/api/identidad/recuperacion/confirmacion').send({ token, contrasenaNueva: 'Otra-clave-del-festival' });
    expect(otraVez.status).toBe(410);
    expect(otraVez.body.codigo).toBe('enlace_usado');

    expect((await ctx.http().get('/api/identidad/yo').set('Cookie', cookieDe(otra))).status).toBe(401); // sesión cerrada
    expect((await ingresar(correo)).status).toBe(401);
    expect((await ingresar(correo, 'Nueva-clave-del-festival')).status).toBe(200);
  });

  it('el enlace de recuperación vence a la hora; un correo sin cuenta recibe la misma respuesta', async () => {
    const correo = await cuentaVerificada();
    await ctx.http().post('/api/identidad/recuperacion').send({ correo });
    await esperarEnvios();
    const token = tokenDelCorreo(ctx.correo, correo);
    ctx.reloj.ahora = new Date(ctx.reloj.ahora.getTime() + 61 * 60_000);
    const r = await ctx.http().post('/api/identidad/recuperacion/confirmacion').send({ token, contrasenaNueva: 'Nueva-clave-del-festival' });
    expect(r.status).toBe(410);
    expect(r.body.codigo).toBe('enlace_vencido');
    const nadie = await ctx.http().post('/api/identidad/recuperacion').send({ correo: correoUnico('nadie') });
    expect(nadie.status).toBe(202);
  });

  it('US8-AS4: cerrar la sesión de otro dispositivo le quita el acceso de inmediato', async () => {
    const correo = await cuentaVerificada();
    const movil = await ingresar(correo, CLAVE, 'Mozilla/5.0 (Linux; Android 14; Pixel 7) Chrome/130.0 Mobile Safari/537.36');
    const pc = await ingresar(correo);
    const lista = await ctx.http().get('/api/identidad/yo/sesiones').set('Cookie', cookieDe(pc));
    expect(lista.body).toHaveLength(2);
    const delMovil = lista.body.find((s: { actual: boolean }) => !s.actual);
    expect(delMovil).toMatchObject({ dispositivo: 'Chrome en Android', actual: false });
    expect((await ctx.http().delete(`/api/identidad/yo/sesiones/${delMovil.id}`).set('Cookie', cookieDe(pc))).status).toBe(204);
    expect((await ctx.http().get('/api/identidad/yo').set('Cookie', cookieDe(movil))).status).toBe(401);
    expect((await ctx.http().get('/api/identidad/yo').set('Cookie', cookieDe(pc))).status).toBe(200);
    // No se puede cerrar la sesión de otra cuenta.
    const ajena = await ingresar(await cuentaVerificada());
    const idAjena = (await ctx.http().get('/api/identidad/yo/sesiones').set('Cookie', cookieDe(ajena))).body[0].id;
    expect((await ctx.http().delete(`/api/identidad/yo/sesiones/${idAjena}`).set('Cookie', cookieDe(pc))).status).toBe(404);
  });

  it('cambiar la contraseña desde "Mi cuenta" cierra las demás sesiones pero no la actual', async () => {
    const correo = await cuentaVerificada();
    const otra = await ingresar(correo);
    const actual = await ingresar(correo);
    const r = await ctx.http().put('/api/identidad/yo/contrasena').set('Cookie', cookieDe(actual)).send({ contrasenaActual: CLAVE, contrasenaNueva: 'Nueva-clave-del-festival' });
    expect(r.status).toBe(204);
    expect((await ctx.http().get('/api/identidad/yo').set('Cookie', cookieDe(otra))).status).toBe(401);
    expect((await ctx.http().get('/api/identidad/yo').set('Cookie', cookieDe(actual))).status).toBe(200);
    const mala = await ctx.http().put('/api/identidad/yo/contrasena').set('Cookie', cookieDe(actual)).send({ contrasenaActual: 'no-es-la-actual', contrasenaNueva: 'Otra-clave-del-festival' });
    expect(mala.body.codigo).toBe('credenciales_invalidas');
  });

  it('cerrar sesión revoca la cookie; la sesión vence tras 30 días sin actividad (deslizante)', async () => {
    const correo = await cuentaVerificada();
    const s = await ingresar(correo);
    ctx.reloj.ahora = new Date(ctx.reloj.ahora.getTime() + 20 * 24 * 3_600_000);
    expect((await ctx.http().get('/api/identidad/yo').set('Cookie', cookieDe(s))).status).toBe(200); // renueva
    ctx.reloj.ahora = new Date(ctx.reloj.ahora.getTime() + 20 * 24 * 3_600_000);
    expect((await ctx.http().get('/api/identidad/yo').set('Cookie', cookieDe(s))).status).toBe(200); // sigue (deslizante)
    const fuera = await ctx.http().delete('/api/identidad/sesion').set('Cookie', cookieDe(s));
    expect(fuera.status).toBe(204);
    expect(String(fuera.headers['set-cookie'])).toMatch(/fiavl_sesion=;/);
    expect((await ctx.http().get('/api/identidad/yo').set('Cookie', cookieDe(s))).status).toBe(401);
    const vieja = await ingresar(correo);
    ctx.reloj.ahora = new Date(ctx.reloj.ahora.getTime() + 31 * 24 * 3_600_000);
    expect((await ctx.http().get('/api/identidad/yo').set('Cookie', cookieDe(vieja))).status).toBe(401);
  });

  it('CSRF: un Origin ajeno no puede escribir; el de la web sí', async () => {
    const correo = await cuentaVerificada();
    const s = await ingresar(correo);
    const ajena = await ctx.http().patch('/api/identidad/yo').set('Cookie', cookieDe(s)).set('Origin', 'https://sitio-malicioso.example').send({ nombre: 'Hackeada' });
    expect(ajena.status).toBe(403);
    expect(ajena.body.codigo).toBe('origen_no_permitido');
    const propia = await ctx.http().patch('/api/identidad/yo').set('Cookie', cookieDe(s)).set('Origin', 'https://fiavl.test').send({ nombre: 'Ana María Torres', novedades: true });
    expect(propia.status).toBe(200);
    expect(propia.body).toMatchObject({ nombre: 'Ana María Torres', novedades: true });
  });

  it('la sesión real sirve para los demás módulos (IdentidadPublica): Operación la reconoce', async () => {
    const correo = await cuentaVerificada();
    const s = await ingresar(correo);
    // Sin rol de programador: 403 (autenticado pero sin permiso), no 401.
    expect((await ctx.http().get('/api/operacion/ediciones').set('Cookie', cookieDe(s))).status).toBe(403);
    expect((await ctx.http().get('/api/operacion/ediciones')).status).toBe(401);
  });
});
