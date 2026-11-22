import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { Writable } from 'node:stream';
import { Logger } from '@nestjs/common';
import { ejemplo } from '@fiavl/contracts';
import pino from 'pino';
import pinoHttp from 'pino-http';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { CUENTAS_PRUEBA } from '../../../../prisma/seed/identidad';
import { opcionesLogHttp } from '../../src/common/observabilidad/observabilidad.module';
import { codigoTotp, desdeBase32, pasoDe } from '../../src/modules/identidad/domain/totp';
import { correoUnico, crearAppIdentidad, esperarEnvios, tokenDelCorreo } from './app';

/**
 * T130 · Constitución IX: los logs nunca llevan contraseñas, tokens de sesión o de enlace, secretos
 * TOTP ni `tokenQr`. Se comprueban las opciones reales de pino-http y todo lo que los servicios
 * registran durante los flujos sensibles.
 */
describe('T130 · logs sin secretos', () => {
  it('pino-http oculta la cookie de entrada y el Set-Cookie de salida', async () => {
    const lineas: string[] = [];
    const destino = new Writable({ write: (c, _e, cb) => (lineas.push(String(c)), cb()) });
    const registro = pinoHttp({ ...opcionesLogHttp(), level: 'info', logger: pino({ level: 'info' }, destino) });
    const servidor = createServer((req, res) => {
      registro(req, res);
      res.setHeader('Set-Cookie', 'fiavl_sesion=TOKEN-DE-SALIDA-123; HttpOnly');
      res.end('ok');
    });
    await request(servidor).get('/x').set('Cookie', 'fiavl_sesion=TOKEN-DE-ENTRADA-456').set('Authorization', 'Bearer SECRETO-789');
    const texto = lineas.join('\n');
    expect(texto).toContain('"url":"/x"');
    for (const secreto of ['TOKEN-DE-SALIDA-123', 'TOKEN-DE-ENTRADA-456', 'SECRETO-789']) expect(texto).not.toContain(secreto);
    expect(texto).toContain('[Redacted]');
  });

  describe('servicios de Identidad', () => {
    let ctx: Awaited<ReturnType<typeof crearAppIdentidad>>;
    const registrado: string[] = [];
    beforeAll(async () => {
      ctx = await crearAppIdentidad();
      for (const nivel of ['log', 'error', 'warn', 'debug', 'verbose'] as const) {
        vi.spyOn(Logger.prototype, nivel).mockImplementation(function (this: unknown, ...args: unknown[]) {
          registrado.push(JSON.stringify(args));
        });
      }
    });
    afterAll(async () => {
      vi.restoreAllMocks();
      await ctx.cerrar();
    });

    it('registro, ingreso fallido, recuperación, segundo factor y notificación con QR', async () => {
      const secretos: string[] = [];
      const correo = correoUnico('logs');
      const clave = 'Clave-que-no-se-registra-77';
      secretos.push(clave);
      await ctx.http().post('/api/identidad/registro').send({ nombre: 'Rosa Logs', correo, contrasena: clave, aceptaPolitica: true, versionPolitica: 1 });
      await esperarEnvios();
      secretos.push(tokenDelCorreo(ctx.correo, correo));
      await ctx.http().post('/api/identidad/sesion').send({ correo, contrasena: 'otra-clave-equivocada' });
      const s = await ctx.http().post('/api/identidad/sesion').send({ correo, contrasena: clave });
      secretos.push(((s.headers['set-cookie'] as unknown as string[])[0] ?? '').split(';')[0]!.split('=')[1]!);
      await ctx.http().post('/api/identidad/recuperacion').send({ correo });
      await esperarEnvios();
      secretos.push(tokenDelCorreo(ctx.correo, correo));

      // Segundo factor con la cuenta sembrada (su secreto es conocido).
      const admin = await ctx.http().post('/api/identidad/sesion').send({ correo: 'admin@fiavl.test', contrasena: CUENTAS_PRUEBA.contrasena });
      const cookie = (admin.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
      ctx.reloj.ahora = new Date(Date.now() + 3600_000 * 24 * 400);
      await ctx.http().post('/api/identidad/segundo-factor/verificacion').set('Cookie', cookie).send({ codigo: codigoTotp(desdeBase32(CUENTAS_PRUEBA.secretoTotp), pasoDe(ctx.reloj.ahora)) });
      secretos.push(CUENTAS_PRUEBA.secretoTotp, CUENTAS_PRUEBA.contrasena);

      // Notificación de entradas: el tokenQr solo vive en la fila y en el adjunto.
      const { MANEJADORES_IDENTIDAD } = await import('../../src/modules/identidad/application/puertos');
      const { NotificacionesServicio } = await import('../../src/modules/identidad/application/notificaciones/notificaciones.servicio');
      const tokenQr = `QR-${randomUUID()}`;
      secretos.push(tokenQr);
      const m = ctx.app.get<{ tipo: string; esquema: { parse(x: unknown): unknown }; manejar(e: unknown): Promise<void> }[]>(MANEJADORES_IDENTIDAD).find((x) => x.tipo === 'EntradasEmitidas')!;
      const evento = ejemplo.entradasEmitidas(randomUUID(), {
        pedidoId: randomUUID(), funcionId: randomUUID(), sedeId: randomUUID(), canal: 'web', tipo: 'compra', cantidad: 1, importeCentavos: 500,
        correoDestino: correo, entradas: [{ entradaId: randomUUID(), codigoCorto: 'LOG1', tokenQr }],
      });
      await m.manejar(m.esquema.parse(evento));
      const n = await ctx.db.notificacion.findFirstOrThrow({ where: { eventoOrigenId: evento.id } });
      ctx.correo.falla = true; // también el camino del error
      await ctx.app.get(NotificacionesServicio).enviar(n.id).catch(() => undefined);
      ctx.correo.falla = false;
      await ctx.app.get(NotificacionesServicio).enviar(n.id);

      expect(registrado.length).toBeGreaterThan(0);
      const todo = registrado.join('\n');
      for (const secreto of secretos) expect(todo, `el log contiene un secreto (${secreto.slice(0, 4)}…)`).not.toContain(secreto);
      expect(todo).not.toMatch(/scrypt\$/);
    });
  });
});
