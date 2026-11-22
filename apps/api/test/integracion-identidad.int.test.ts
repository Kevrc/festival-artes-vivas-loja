import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { hashContrasena } from '../src/modules/identidad/domain/contrasenas';
import { codigoTotp, generarSecretoTotp, pasoDe } from '../src/modules/identidad/domain/totp';
import { cifradorDelEntorno } from '../src/modules/identidad/infrastructure/cifrador-aes-gcm';
import { crearAppBoleteria } from './boleteria/app';

/**
 * T092 · Integración de la spec 004 con 001, 002 y 003: los módulos existentes autorizan con la
 * sesión real de Identidad (cookie `fiavl_sesion`) a través de sus propios puertos. US9-AS1
 * (taquilla del Bolívar no vende para otra sede), validador fuera de sede, sin sesión ⇒ 401 y
 * cuenta desactivada ⇒ 401 inmediato.
 */
let ctx: Awaited<ReturnType<typeof crearAppBoleteria>>;
let hash = '';
beforeAll(async () => {
  ctx = await crearAppBoleteria();
  hash = await hashContrasena(CLAVE);
});
afterAll(() => ctx.cerrar());
beforeEach(() => ctx.limpiarTodo());

const CLAVE = 'Integrar-con-Identidad-26';
const WEB = { Origin: process.env.WEB_URL ?? 'http://localhost:3100' };
const cookieDe = (r: { headers: Record<string, unknown> }) =>
  (r.headers['set-cookie'] as string[] | undefined)?.find((c) => c.startsWith('fiavl_sesion='))?.split(';')[0] ?? '';

/** Cuenta con rol, contraseña y TOTP ya configurado; devuelve la cookie de una sesión completa. */
async function sesionDe(rol: 'taquilla' | 'validador' | 'jefe_sala' | null, sedeId?: string) {
  const id = randomUUID();
  const correo = `integracion.${id.slice(0, 8)}@fiavl.test`;
  const secreto = generarSecretoTotp();
  await ctx.db.cuenta.create({
    data: {
      id,
      nombre: 'Integración',
      correo,
      estado: 'verificada',
      verificadaEn: new Date(),
      esPersonal: rol !== null,
      credencial: { create: { hashContrasena: hash, ...(rol ? { totpSecretoCifrado: new Uint8Array(cifradorDelEntorno().cifrar(secreto)), totpActivo: true } : {}) } },
      consentimientos: { create: [{ id: randomUUID(), documento: 'politica_privacidad', version: 1 }] },
      ...(rol ? { roles: { create: [{ id: randomUUID(), rol, asignadoPor: id, alcanceTipo: 'sede', alcanceValor: sedeId! }] } } : {}),
    },
  });
  const r = await ctx.http().post('/api/identidad/sesion').set(WEB).send({ correo, contrasena: CLAVE });
  expect(r.status).toBe(200);
  const cookie = cookieDe(r);
  if (rol) {
    // Los pasos TOTP usan la hora real (RELOJ_TOTP).
    const v = await ctx.http().post('/api/identidad/segundo-factor/verificacion').set(WEB).set('Cookie', cookie).send({ codigo: codigoTotp(secreto, pasoDe(new Date())) });
    expect(v.status).toBe(200);
  }
  return { cookie, cuentaId: id };
}

describe('T092 · Boletería, Cartelera y Convocatorias con la sesión de Identidad', () => {
  it('US9-AS1: la taquilla del Bolívar abre caja y vende en su sede, pero no en otra', async () => {
    const bolivar = await ctx.sembrarFuncion({ sedeNombre: 'Teatro Bolívar' });
    const otra = await ctx.sembrarFuncion({ sedeNombre: 'Teatro Segundo Cueva Celi' });
    const { cookie } = await sesionDe('taquilla', bolivar.sedeId);
    const conSesion = (r: ReturnType<ReturnType<typeof ctx.http>['post']>) => r.set('Cookie', cookie);

    const caja = await conSesion(ctx.http().post('/api/boleteria/taquilla/cajas')).send({ sedeId: bolivar.sedeId, fondoInicialCentavos: 1000 });
    expect(caja.status).toBe(201);
    const venta = (funcionId: string) =>
      conSesion(ctx.http().post('/api/boleteria/taquilla/ventas'))
        .set('Idempotency-Key', `int-${randomUUID()}`)
        .send({ cajaId: caja.body.id, funcionId, cantidad: 1, medioPago: 'efectivo' });
    expect((await venta(bolivar.funcionId)).status).toBe(201);
    expect((await venta(otra.funcionId)).status).toBe(403);
    expect((await conSesion(ctx.http().post('/api/boleteria/taquilla/cajas')).send({ sedeId: otra.sedeId, fondoInicialCentavos: 0 })).status).toBe(403);
  });

  it('el validador del Bolívar no valida funciones de otra sede', async () => {
    const bolivar = await ctx.sembrarFuncion();
    const otra = await ctx.sembrarFuncion();
    const { cookie } = await sesionDe('validador', bolivar.sedeId);
    expect((await ctx.http().get(`/api/boleteria/validador/funciones/${bolivar.funcionId}/paquete`).set('Cookie', cookie)).status).toBe(200);
    expect((await ctx.http().get(`/api/boleteria/validador/funciones/${otra.funcionId}/paquete`).set('Cookie', cookie)).status).toBe(403);
    // Un rol que no es de puerta no entra aunque la sede coincida.
    const taquilla = await sesionDe('taquilla', bolivar.sedeId);
    expect((await ctx.http().get(`/api/boleteria/validador/funciones/${bolivar.funcionId}/paquete`).set('Cookie', taquilla.cookie)).status).toBe(403);
  });

  it('sin sesión 401; una sesión del personal sin segundo factor tampoco autoriza en Boletería', async () => {
    const { funcionId, sedeId } = await ctx.sembrarFuncion();
    expect((await ctx.http().get(`/api/boleteria/validador/funciones/${funcionId}/paquete`)).status).toBe(401);
    expect((await ctx.http().get('/api/cartelera/favoritos')).status).toBe(401);
    // Cookie inventada: manda Identidad, no el puente de desarrollo.
    expect((await ctx.http().get('/api/cartelera/favoritos').set('Cookie', `fiavl_sesion=${'a'.repeat(43)}`).set('x-cuenta-dev', randomUUID())).status).toBe(401);

    const id = randomUUID();
    const correo = `restringida.${id.slice(0, 8)}@fiavl.test`;
    await ctx.db.cuenta.create({
      data: { id, nombre: 'Sin TOTP', correo, estado: 'verificada', esPersonal: true, credencial: { create: { hashContrasena: hash } }, roles: { create: [{ id: randomUUID(), rol: 'validador', asignadoPor: id, alcanceTipo: 'sede', alcanceValor: sedeId }] } },
    });
    const r = await ctx.http().post('/api/identidad/sesion').set(WEB).send({ correo, contrasena: CLAVE });
    expect(r.body.segundoFactorOk).toBe(false);
    expect((await ctx.http().get(`/api/boleteria/validador/funciones/${funcionId}/paquete`).set('Cookie', cookieDe(r))).status).toBe(401);
  });

  it('una cuenta desactivada pierde el acceso en la siguiente petición (401 inmediato)', async () => {
    const { funcionId, sedeId } = await ctx.sembrarFuncion();
    const { cookie, cuentaId } = await sesionDe('validador', sedeId);
    const url = `/api/boleteria/validador/funciones/${funcionId}/paquete`;
    expect((await ctx.http().get(url).set('Cookie', cookie)).status).toBe(200);
    await ctx.db.cuenta.update({ where: { id: cuentaId }, data: { estado: 'desactivada' } });
    expect((await ctx.http().get(url).set('Cookie', cookie)).status).toBe(401);
  });

  it('Mi agenda y Convocatorias aceptan la sesión real del público', async () => {
    const { cookie } = await sesionDe(null);
    expect((await ctx.http().get('/api/cartelera/favoritos').set('Cookie', cookie)).status).toBe(200);
    // Toda cuenta es postulante: la ruta autoriza y responde 404 por el id inventado.
    expect((await ctx.http().get(`/api/convocatorias/postulaciones/${randomUUID()}`).set('Cookie', cookie)).status).toBe(404);
    expect((await ctx.http().get(`/api/convocatorias/postulaciones/${randomUUID()}`)).status).toBe(401);
  });
});
