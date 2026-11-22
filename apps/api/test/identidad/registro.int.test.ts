import { EventoPublicadoIdentidad } from '@fiavl/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { correoUnico, crearAppIdentidad, esperarEnvios, tokenDelCorreo } from './app';

// T062: US7 — registro y verificación de correo, contra PostgreSQL real.
let ctx: Awaited<ReturnType<typeof crearAppIdentidad>>;
beforeAll(async () => (ctx = await crearAppIdentidad()));
afterAll(() => ctx.cerrar());
beforeEach(() => {
  ctx.publicados.length = 0;
  ctx.correo.enviados.length = 0;
  ctx.correo.falla = false;
});

const registro = (datos: Record<string, unknown>) =>
  ctx.http().post('/api/identidad/registro').send({ nombre: 'Ana Torres', contrasena: 'Teatro-en-Loja-2026', aceptaPolitica: true, versionPolitica: 1, ...datos });

describe('US7 — registro y verificación de correo', () => {
  it('la política vigente se publica para el formulario', async () => {
    const r = await ctx.http().get('/api/identidad/politica');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ version: 1, url: '/privacidad' });
  });

  it('US7-AS1: la cuenta queda pendiente de verificación y recibe el enlace', async () => {
    const correo = correoUnico();
    const r = await registro({ correo });
    expect(r.status).toBe(202);
    const cuenta = await ctx.db.cuenta.findUnique({ where: { correo }, include: { credencial: true, consentimientos: true } });
    expect(cuenta).toMatchObject({ estado: 'pendiente_verificacion', nombre: 'Ana Torres' });
    expect(cuenta!.credencial!.hashContrasena).toMatch(/^scrypt\$32768\$8\$3\$/);
    expect(cuenta!.consentimientos).toEqual([expect.objectContaining({ documento: 'politica_privacidad', version: 1 })]);
    await esperarEnvios();
    expect(ctx.correo.enviados).toEqual([expect.objectContaining({ para: correo, asunto: 'Verifica tu correo · FIAVL' })]);
    expect(ctx.correo.enviados[0]!.texto).toContain('https://fiavl.test/cuenta/verificar?token=');
    // El token no se guarda en claro.
    const token = tokenDelCorreo(ctx.correo, correo);
    expect(JSON.stringify(await ctx.db.tokenCuenta.findMany({ where: { cuentaId: cuenta!.id } }))).not.toContain(token);
  });

  it('US7-AS2: el enlace verifica la cuenta dentro de 24 h, una sola vez, y publica CuentaVerificada', async () => {
    const correo = correoUnico();
    await registro({ correo });
    await esperarEnvios();
    const token = tokenDelCorreo(ctx.correo, correo);
    const r = await ctx.http().post('/api/identidad/verificacion').send({ token });
    expect(r.status).toBe(200);
    const cuenta = await ctx.db.cuenta.findUnique({ where: { correo } });
    expect(cuenta).toMatchObject({ estado: 'verificada' });
    expect(ctx.publicados.map((e) => e.tipo)).toEqual(['CuentaVerificada']);
    expect(EventoPublicadoIdentidad.safeParse(ctx.publicados[0]).success).toBe(true);
    expect(ctx.publicados[0]!.datos).toEqual({ cuentaId: cuenta!.id, verificadaEn: expect.any(String) });
    const otraVez = await ctx.http().post('/api/identidad/verificacion').send({ token });
    expect(otraVez.status).toBe(410);
    expect(otraVez.body.codigo).toBe('enlace_usado');
  });

  it('un enlace vencido (más de 24 h) no verifica y se puede pedir otro', async () => {
    const correo = correoUnico();
    await registro({ correo });
    await esperarEnvios();
    const token = tokenDelCorreo(ctx.correo, correo);
    const antes = ctx.reloj.ahora;
    ctx.reloj.ahora = new Date(antes.getTime() + 25 * 3_600_000);
    try {
      const r = await ctx.http().post('/api/identidad/verificacion').send({ token });
      expect(r.status).toBe(410);
      expect(r.body.codigo).toBe('enlace_vencido');
      expect((await ctx.http().post('/api/identidad/verificacion/reenvio').send({ correo })).status).toBe(202);
      await esperarEnvios();
      expect((await ctx.http().post('/api/identidad/verificacion').send({ token: tokenDelCorreo(ctx.correo, correo) })).status).toBe(200);
    } finally {
      ctx.reloj.ahora = antes;
    }
  });

  it('US7-AS3: un correo ya registrado (con mayúsculas y espacios) recibe la misma respuesta y su dueño un aviso', async () => {
    const correo = correoUnico();
    await registro({ correo });
    await esperarEnvios();
    await ctx.http().post('/api/identidad/verificacion').send({ token: tokenDelCorreo(ctx.correo, correo) });
    ctx.correo.enviados.length = 0;

    const r = await registro({ correo: `  ${correo.toUpperCase()} `, nombre: 'Intruso' });
    expect(r.status).toBe(202);
    expect(r.body).toEqual((await registro({ correo: correoUnico('nuevo') })).body);
    await esperarEnvios();
    const aviso = ctx.correo.enviados.find((m) => m.para === correo);
    expect(aviso).toMatchObject({ asunto: 'Ya tienes una cuenta · FIAVL' });
    expect(aviso!.texto).not.toContain('token=');
    expect(await ctx.db.cuenta.count({ where: { correo } })).toBe(1);
    expect((await ctx.db.cuenta.findUnique({ where: { correo } }))!.nombre).toBe('Ana Torres');
  });

  it('US7-AS4: contraseña de menos de 10 caracteres o filtrada se rechaza con el motivo', async () => {
    const corta = await registro({ correo: correoUnico(), contrasena: 'Corta123' });
    expect(corta.status).toBe(400);
    expect(corta.body).toMatchObject({ codigo: 'contrasena_corta' });
    const filtrada = await registro({ correo: correoUnico(), contrasena: '1234567890' });
    expect(filtrada.status).toBe(400);
    expect(filtrada.body.codigo).toBe('contrasena_filtrada');
  });

  it('US7-AS5: sin aceptar la política de privacidad no se crea la cuenta', async () => {
    const correo = correoUnico();
    const r = await registro({ correo, aceptaPolitica: false });
    expect(r.status).toBe(400);
    expect(r.body.codigo).toBe('politica_no_aceptada');
    expect(await ctx.db.cuenta.count({ where: { correo } })).toBe(0);
    const vieja = await registro({ correo, versionPolitica: 99 });
    expect(vieja.body).toMatchObject({ codigo: 'politica_no_aceptada', versionVigente: 1 });
  });

  it('caso borde: como máximo 3 enlaces de verificación por hora', async () => {
    const correo = correoUnico();
    await registro({ correo }); // 1.º enlace
    expect((await ctx.http().post('/api/identidad/verificacion/reenvio').send({ correo })).status).toBe(202); // 2.º
    expect((await ctx.http().post('/api/identidad/verificacion/reenvio').send({ correo })).status).toBe(202); // 3.º
    const cuarto = await ctx.http().post('/api/identidad/verificacion/reenvio').send({ correo });
    expect(cuarto.status).toBe(429);
    expect(cuarto.body.codigo).toBe('limite_reenvios');
    // Registrarse otra vez pasado el límite no lo delata: misma respuesta 202.
    expect((await registro({ correo })).status).toBe(202);
    // Un correo sin cuenta también recibe 202 en el reenvío.
    expect((await ctx.http().post('/api/identidad/verificacion/reenvio').send({ correo: correoUnico('nadie') })).status).toBe(202);
  });

  it('RNF-007: si el servidor de correo falla, el registro igual se completa', async () => {
    ctx.correo.falla = true;
    const correo = correoUnico();
    expect((await registro({ correo })).status).toBe(202);
    expect(await ctx.db.cuenta.findUnique({ where: { correo } })).toMatchObject({ estado: 'pendiente_verificacion' });
  });

  it('auditoría del registro y la verificación sin datos sensibles', async () => {
    const correo = correoUnico();
    await registro({ correo, contrasena: 'Contraseña-Única-Auditoría' });
    const cuenta = await ctx.db.cuenta.findUniqueOrThrow({ where: { correo } });
    const registros = await ctx.db.auditoriaIdentidad.findMany({ where: { entidadId: cuenta.id } });
    expect(registros.map((x) => x.accion)).toEqual(['cuenta.registro']);
    expect(JSON.stringify(registros)).not.toContain('Contraseña-Única-Auditoría');
  });
});
