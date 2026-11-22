import { randomUUID } from 'node:crypto';
import { ejemplo } from '@fiavl/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { datosFuncion } from '../programacion/fixtures';
import { correoUnico, crearAppIdentidad, esperarEnvios } from './app';

// T094 · US10 — notificaciones con deduplicación, reintentos y plazo de 24 h, contra PostgreSQL real.
let ctx: Awaited<ReturnType<typeof crearAppIdentidad>>;
let manejar: (evento: { id: string; tipo: string }) => Promise<void>;
let enviar: (id: string) => Promise<string | null>;
beforeAll(async () => {
  ctx = await crearAppIdentidad();
  const { MANEJADORES_IDENTIDAD } = await import('../../src/modules/identidad/application/puertos');
  const { NotificacionesServicio } = await import('../../src/modules/identidad/application/notificaciones/notificaciones.servicio');
  const manejadores = ctx.app.get<{ tipo: string; esquema: { parse: (x: unknown) => { id: string; tipo: string } }; manejar: (e: unknown) => Promise<void> }[]>(MANEJADORES_IDENTIDAD);
  manejar = async (e) => {
    const m = manejadores.find((x) => x.tipo === e.tipo)!;
    await m.manejar(m.esquema.parse(e));
  };
  const servicio = ctx.app.get(NotificacionesServicio);
  enviar = (id) => servicio.enviar(id);
});
afterAll(() => ctx.cerrar());
beforeEach(() => {
  ctx.correo.enviados.length = 0;
  ctx.correo.falla = false;
  ctx.reloj.ahora = new Date('2026-11-14T12:00:00-05:00');
});

const EDICION = randomUUID();
/** Lo que haría el trabajo `identidad.enviar-notificacion` en el worker. */
async function enviarPendientes() {
  const pendientes = await ctx.db.notificacion.findMany({ where: { estado: 'pendiente' } });
  for (const n of pendientes) await enviar(n.id).catch(() => undefined);
}
const emitidas = (funcionId: string, correo: string, cuentaId?: string) =>
  ejemplo.entradasEmitidas(EDICION, {
    pedidoId: randomUUID(),
    funcionId,
    sedeId: randomUUID(),
    canal: 'web',
    tipo: 'compra',
    cantidad: 1,
    importeCentavos: 500,
    ...(cuentaId ? { cuentaId } : { correoDestino: correo }),
    entradas: [{ entradaId: randomUUID(), codigoCorto: 'AB12', tokenQr: `token-${randomUUID()}` }],
  });

async function cuentaPublica() {
  const correo = correoUnico('aviso');
  await ctx.http().post('/api/identidad/registro').send({ nombre: 'Rosa Paz', correo, contrasena: 'Teatro-en-Loja-2026', aceptaPolitica: true, versionPolitica: 1 });
  const cuenta = await ctx.db.cuenta.findUniqueOrThrow({ where: { correo } });
  await esperarEnvios(); // el correo de verificación del registro no es parte de estas pruebas
  const i = ctx.correo.enviados.findIndex((c) => c.para === correo);
  if (i >= 0) ctx.correo.enviados.splice(i, 1);
  return { correo, cuentaId: cuenta.id };
}

describe('US10 — notificaciones', () => {
  it('independent test: 3 compradores y FuncionCancelada ⇒ 3 avisos de cancelación enviados', async () => {
    const funcionId = randomUUID();
    await manejar(ejemplo.funcionProgramada(EDICION, datosFuncion({ edicionId: EDICION, funcionId, titulo: 'Bondi Beach' })));
    const compradores = [await cuentaPublica(), await cuentaPublica(), { correo: correoUnico('taquilla'), cuentaId: undefined }];
    for (const c of compradores) await manejar(emitidas(funcionId, c.correo, c.cuentaId));
    await enviarPendientes();
    ctx.correo.enviados.length = 0;

    const cancelada = ejemplo.funcionCancelada(EDICION, { funcionId, version: 2 });
    await manejar(cancelada);
    await enviarPendientes();
    const avisos = await ctx.db.notificacion.findMany({ where: { eventoOrigenId: cancelada.id } });
    expect(avisos).toHaveLength(3);
    expect(avisos.every((a) => a.estado === 'enviada' && a.plantilla === 'funcion_cancelada' && a.categoria === 'servicio')).toBe(true);
    expect(ctx.correo.enviados.map((c) => c.para).sort()).toEqual(compradores.map((c) => c.correo).sort());
    expect(ctx.correo.enviados[0]!.texto).toContain('«Bondi Beach»');
  });

  it('US10-AS1: el correo de entradas lleva el QR adjunto y el token se borra de la fila al enviar', async () => {
    const { correo, cuentaId } = await cuentaPublica();
    const evento = emitidas(randomUUID(), correo, cuentaId);
    const antes = Date.now();
    await manejar(evento);
    await enviarPendientes();
    expect(Date.now() - antes).toBeLessThan(60_000);
    const [n] = await ctx.db.notificacion.findMany({ where: { eventoOrigenId: evento.id } });
    expect(n).toMatchObject({ estado: 'enviada', cuentaId, correoDestino: correo, intentos: 1 });
    expect(JSON.stringify(n!.datos)).not.toContain('token-');
    const enviado = ctx.correo.enviados.find((c) => c.para === correo)!;
    expect(enviado.adjuntos).toHaveLength(1);
    expect(enviado.adjuntos![0]).toMatchObject({ cid: 'qr-1@fiavl', tipo: 'image/png' });
    expect(enviado.html).toContain('cid:qr-1@fiavl');
  });

  it('US10-AS3: el mismo evento dos veces ⇒ un solo correo', async () => {
    const { correo, cuentaId } = await cuentaPublica();
    const evento = emitidas(randomUUID(), correo, cuentaId);
    await manejar(evento);
    await manejar(evento);
    await enviarPendientes();
    await enviarPendientes();
    expect(await ctx.db.notificacion.count({ where: { eventoOrigenId: evento.id } })).toBe(1);
    expect(ctx.correo.enviados.filter((c) => c.para === correo)).toHaveLength(1);
  });

  it('US10-AS2: si el correo falla se reintenta; cuando vuelve se envía; tras 24 h queda fallida', async () => {
    const a = await cuentaPublica();
    const b = await cuentaPublica();
    const ea = emitidas(randomUUID(), a.correo, a.cuentaId);
    const eb = emitidas(randomUUID(), b.correo, b.cuentaId);
    await manejar(ea);
    await manejar(eb);
    const [na] = await ctx.db.notificacion.findMany({ where: { eventoOrigenId: ea.id } });
    const [nb] = await ctx.db.notificacion.findMany({ where: { eventoOrigenId: eb.id } });

    ctx.correo.falla = true;
    await expect(enviar(na!.id)).rejects.toThrow();
    await expect(enviar(nb!.id)).rejects.toThrow();
    expect(await ctx.db.notificacion.findUniqueOrThrow({ where: { id: na!.id } })).toMatchObject({ estado: 'pendiente', intentos: 1, ultimoError: expect.stringContaining('no disponible') });

    // El proveedor vuelve: el siguiente reintento la envía.
    ctx.correo.falla = false;
    ctx.reloj.ahora = new Date(ctx.reloj.ahora.getTime() + 60_000);
    expect(await enviar(na!.id)).toBe('enviada');
    expect(await ctx.db.notificacion.findUniqueOrThrow({ where: { id: na!.id } })).toMatchObject({ estado: 'enviada', intentos: 2, ultimoError: null });

    // La otra sigue fallando hasta pasar 24 h: queda fallida para revisión, sin más reintentos.
    ctx.reloj.ahora = new Date(ctx.reloj.ahora.getTime() + 24 * 3_600_000);
    expect(await enviar(nb!.id)).toBe('fallida');
    expect(await enviar(nb!.id)).toBe('fallida');
    const fallida = await ctx.db.notificacion.findUniqueOrThrow({ where: { id: nb!.id } });
    expect(fallida.estado).toBe('fallida');
    expect(fallida.ultimoError).not.toContain(b.correo);
  });

  it('reprogramación: un aviso por persona aunque tenga varios pedidos; un pedido devuelto ya no recibe avisos', async () => {
    const funcionId = randomUUID();
    await manejar(ejemplo.funcionProgramada(EDICION, datosFuncion({ edicionId: EDICION, funcionId, titulo: 'Cometa' })));
    const ana = await cuentaPublica();
    const luis = await cuentaPublica();
    await manejar(emitidas(funcionId, ana.correo, ana.cuentaId));
    await manejar(emitidas(funcionId, ana.correo, ana.cuentaId));
    const pedidoLuis = emitidas(funcionId, luis.correo, luis.cuentaId);
    await manejar(pedidoLuis);
    await manejar(
      ejemplo.pedidoReembolsado(EDICION, {
        pedidoId: pedidoLuis.datos.pedidoId, funcionId, sedeId: randomUUID(), importeCentavos: 500, canal: 'web', motivo: 'plazo_7_dias_vencido', cuentaId: luis.cuentaId,
      }),
    );
    const sede = datosFuncion({ edicionId: EDICION }).sede;
    const reprogramada = ejemplo.funcionReprogramada(EDICION, {
      funcionId,
      version: 2,
      anterior: { inicio: '2026-11-14T19:00:00-05:00', fin: '2026-11-14T20:00:00-05:00', sedeId: sede.id },
      nuevo: { inicio: '2026-11-15T19:00:00-05:00', fin: '2026-11-15T20:00:00-05:00', sedeId: sede.id },
      motivo: 'lluvia',
    });
    await manejar(reprogramada);
    const avisos = await ctx.db.notificacion.findMany({ where: { eventoOrigenId: reprogramada.id } });
    expect(avisos.map((a) => a.correoDestino)).toEqual([ana.correo]);
    expect(await ctx.db.notificacion.count({ where: { correoDestino: luis.correo, plantilla: 'devolucion' } })).toBe(1);
    expect((await ctx.db.funcionAviso.findUniqueOrThrow({ where: { funcionId } })).estado).toBe('reprogramada');
  });

  it('US10-AS5: «Mis notificaciones» muestra solo las propias y sin datos de la plantilla; las fallidas son solo del administrador', async () => {
    const { correo, cuentaId } = await cuentaPublica();
    await manejar(emitidas(randomUUID(), correo, cuentaId));
    const sesion = await ctx.http().post('/api/identidad/sesion').send({ correo, contrasena: 'Teatro-en-Loja-2026' });
    const cookie = (sesion.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('fiavl_sesion='))!.split(';')[0]!;
    const r = await ctx.http().get('/api/identidad/yo/notificaciones').set('Cookie', cookie);
    expect(r.status).toBe(200);
    expect(r.body.items).toHaveLength(1);
    expect(r.body.items[0]).toMatchObject({ plantilla: 'entradas_emitidas', asunto: 'Tus entradas · FIAVL', categoria: 'servicio', estado: 'pendiente' });
    expect(JSON.stringify(r.body)).not.toContain('token-');
    expect(r.body.siguiente).toBeNull();
    expect((await ctx.http().get('/api/identidad/notificaciones/fallidas').set('Cookie', cookie)).status).toBe(403);
    expect((await ctx.http().get('/api/identidad/notificaciones/fallidas').set({ 'x-cuenta-dev': randomUUID(), 'x-roles-dev': 'administrador' })).status).toBe(200);
  });

  it('US10-AS4: una novedad sin consentimiento queda omitida y no se envía', async () => {
    const { NotificacionesServicio } = await import('../../src/modules/identidad/application/notificaciones/notificaciones.servicio');
    const { correo, cuentaId } = await cuentaPublica();
    const id = await ctx.app.get(NotificacionesServicio).crear({ plantilla: 'novedad', evento: { id: randomUUID(), tipo: 'Novedad' }, cuentaId, datos: { titulo: 'x', texto: 'y' } });
    expect((await ctx.db.notificacion.findUniqueOrThrow({ where: { id: id! } })).estado).toBe('omitida');
    await enviarPendientes();
    expect(ctx.correo.enviados.filter((c) => c.para === correo)).toHaveLength(0);
  });
});
