import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { crearAppBoleteria, firmarWebhookTest } from './app';

let ctx: Awaited<ReturnType<typeof crearAppBoleteria>>;

beforeAll(async () => {
  ctx = await crearAppBoleteria();
});

afterAll(async () => {
  await ctx.cerrar();
});

beforeEach(async () => {
  ctx.relojRef.ahora = new Date('2026-11-14T19:15:00-05:00');
  await ctx.limpiarTodo();
});

async function emitirEntradaDePrueba(funcionId: string) {
  const cuentaId = randomUUID();
  const p = await ctx
    .http()
    .post('/api/boleteria/pedidos')
    .set('x-cuenta-dev', cuentaId)
    .set('Idempotency-Key', `val-${randomUUID()}`)
    .send({ funcionId, cantidad: 1 })
    .expect(201);
  const wh = {
    pedidoId: p.body.pedido.id,
    referenciaProveedor: `ref-val-${randomUUID()}`,
    resultado: 'aprobado',
    importeCentavos: 500,
  };
  await ctx.http().post('/api/boleteria/pagos/webhook').set('x-firma-proveedor', firmarWebhookTest(wh)).send(wh).expect(200);
  const det = await ctx.http().get(`/api/boleteria/pedidos/${p.body.pedido.id}`).set('x-cuenta-dev', cuentaId).expect(200);
  return det.body.entradas[0] as { id: string; tokenQr: string; codigoCorto: string };
}

describe('validación en puerta y sincronización offline (T032: US2-AS1..AS7)', () => {
  it('US2-AS1, US2-AS2, US2-AS3, US2-AS4, US2-AS7: valida QR y código corto, ámbar < 1 min, usada, otra función y anulada', async () => {
    const f1 = await ctx.sembrarFuncion({
      titulo: 'Zombi Manifiesto',
      sedeNombre: 'Teatro Bolívar',
      inicio: '2026-11-14T20:00:00-05:00',
      fin: '2026-11-14T21:30:00-05:00',
    });
    const f2 = await ctx.sembrarFuncion({
      titulo: 'Cometa',
      sedeId: f1.sedeId,
      sedeNombre: 'Teatro Bolívar',
      inicio: '2026-11-14T18:00:00-05:00',
      fin: '2026-11-14T21:00:00-05:00',
    });
    ctx.relojRef.ahora = new Date('2026-11-14T17:00:00-05:00');
    const ent1 = await emitirEntradaDePrueba(f1.funcionId);
    const ent2 = await emitirEntradaDePrueba(f1.funcionId);
    const entOtra = await emitirEntradaDePrueba(f2.funcionId);
    ctx.relojRef.ahora = new Date('2026-11-14T19:15:00-05:00');
    const valId = randomUUID();

    // Paquete offline sin datos personales
    const paq = await ctx
      .http()
      .get(`/api/boleteria/validador/funciones/${f1.funcionId}/paquete`)
      .set('x-cuenta-dev', valId)
      .set('x-rol-dev', 'validador')
      .set('x-sede-dev', f1.sedeId)
      .expect(200);
    expect(paq.body.llavePublicaEd25519Spki).toBeTruthy();
    expect(paq.body.entradas).toHaveLength(2);
    expect(JSON.stringify(paq.body.entradas)).not.toContain('@fiavl.ec');

    // US2-AS1: verde
    const v1 = await ctx
      .http()
      .post('/api/boleteria/validador/validar')
      .set('x-cuenta-dev', valId)
      .set('x-rol-dev', 'validador')
      .set('x-sede-dev', f1.sedeId)
      .send({ funcionId: f1.funcionId, tokenQr: ent1.tokenQr, dispositivoId: 'cel-1', puerta: 'Puerta A' })
      .expect(200);
    expect(v1.body.semaforo).toBe('verde');

    // Mismo dispositivo < 1 min -> ámbar
    ctx.relojRef.ahora = new Date('2026-11-14T19:15:30-05:00');
    const vAmbar = await ctx
      .http()
      .post('/api/boleteria/validador/validar')
      .set('x-cuenta-dev', valId)
      .set('x-rol-dev', 'validador')
      .set('x-sede-dev', f1.sedeId)
      .send({ funcionId: f1.funcionId, tokenQr: ent1.tokenQr, dispositivoId: 'cel-1', puerta: 'Puerta A' })
      .expect(200);
    expect(vAmbar.body.semaforo).toBe('ambar');

    // US2-AS2: otro dispositivo -> rojo ya usada con puerta
    const vRojo = await ctx
      .http()
      .post('/api/boleteria/validador/validar')
      .set('x-cuenta-dev', valId)
      .set('x-rol-dev', 'validador')
      .set('x-sede-dev', f1.sedeId)
      .send({ funcionId: f1.funcionId, tokenQr: ent1.tokenQr, dispositivoId: 'cel-2', puerta: 'Puerta B' })
      .expect(200);
    expect(vRojo.body.semaforo).toBe('rojo');
    expect(vRojo.body.codigo).toBe('ya_usada');
    expect(vRojo.body.puertaAnterior).toBe('Puerta A');

    // US2-AS7: código corto manual funciona igual
    const vCorto = await ctx
      .http()
      .post('/api/boleteria/validador/validar')
      .set('x-cuenta-dev', valId)
      .set('x-rol-dev', 'validador')
      .set('x-sede-dev', f1.sedeId)
      .send({ funcionId: f1.funcionId, codigoCorto: ent2.codigoCorto, dispositivoId: 'cel-1', puerta: 'Puerta A' })
      .expect(200);
    expect(vCorto.body.semaforo).toBe('verde');

    // US2-AS3: entrada de otra función indica función correcta
    const vOtra = await ctx
      .http()
      .post('/api/boleteria/validador/validar')
      .set('x-cuenta-dev', valId)
      .set('x-rol-dev', 'validador')
      .set('x-sede-dev', f1.sedeId)
      .send({ funcionId: f1.funcionId, tokenQr: entOtra.tokenQr, dispositivoId: 'cel-1', puerta: 'Puerta A' })
      .expect(200);
    expect(vOtra.body.semaforo).toBe('rojo');
    expect(vOtra.body.codigo).toBe('otra_funcion');
    expect(vOtra.body.funcionCorrecta.obraTitulo).toBe('Cometa');

    // US2-AS4: anulada
    await ctx.db.entradaBoleteria.update({ where: { id: entOtra.id }, data: { estado: 'anulada' } });
    const vAnulada = await ctx
      .http()
      .post('/api/boleteria/validador/validar')
      .set('x-cuenta-dev', valId)
      .set('x-rol-dev', 'validador')
      .set('x-sede-dev', f2.sedeId)
      .send({ funcionId: f2.funcionId, tokenQr: entOtra.tokenQr, dispositivoId: 'cel-1', puerta: 'Puerta A' })
      .expect(200);
    expect(vAnulada.body.semaforo).toBe('rojo');
    expect(vAnulada.body.codigo).toBe('anulada');
  });

  it('US2-AS5 y US2-AS6: sincronización offline idempotente, compensación de reloj y conflicto entre dos dispositivos', async () => {
    const f1 = await ctx.sembrarFuncion({ inicio: '2026-11-14T20:00:00-05:00', fin: '2026-11-14T21:30:00-05:00' });
    const ent = await emitirEntradaDePrueba(f1.funcionId);
    const valId = randomUUID();

    // Dos dispositivos offline escanean la misma entrada (cel-1 primero a las 19:10, cel-2 a las 19:12 con reloj manipulado)
    const sync1 = await ctx
      .http()
      .post('/api/boleteria/validador/sincronizar')
      .set('x-cuenta-dev', valId)
      .set('x-rol-dev', 'validador')
      .set('x-sede-dev', f1.sedeId)
      .send({
        ingresos: [
          {
            entradaId: ent.id,
            funcionId: f1.funcionId,
            dispositivoId: 'cel-1',
            puerta: 'Puerta 1',
            escaneadoEn: '2026-11-14T19:10:00-05:00',
            desfaseMs: 0,
          },
        ],
      })
      .expect(200);
    expect(sync1.body.aplicados).toBe(1);

    // Reintento idempotente del mismo dispositivo
    const syncDup = await ctx
      .http()
      .post('/api/boleteria/validador/sincronizar')
      .set('x-cuenta-dev', valId)
      .set('x-rol-dev', 'validador')
      .set('x-sede-dev', f1.sedeId)
      .send({
        ingresos: [
          {
            entradaId: ent.id,
            funcionId: f1.funcionId,
            dispositivoId: 'cel-1',
            puerta: 'Puerta 1',
            escaneadoEn: '2026-11-14T19:10:00-05:00',
            desfaseMs: 0,
          },
        ],
      })
      .expect(200);
    expect(syncDup.body.duplicados).toBe(1);

    // Segundo dispositivo con desfase de reloj (+3600000 ms para corregir un reloj atrasado 1h)
    const syncConf = await ctx
      .http()
      .post('/api/boleteria/validador/sincronizar')
      .set('x-cuenta-dev', valId)
      .set('x-rol-dev', 'validador')
      .set('x-sede-dev', f1.sedeId)
      .send({
        ingresos: [
          {
            entradaId: ent.id,
            funcionId: f1.funcionId,
            dispositivoId: 'cel-2',
            puerta: 'Puerta 2',
            escaneadoEn: '2026-11-14T18:12:00-05:00',
            desfaseMs: 3_600_000,
          },
        ],
      })
      .expect(200);
    expect(syncConf.body.conflictos).toHaveLength(1);
    expect(syncConf.body.conflictos[0].puertaGanadora).toBe('Puerta 1');
    expect(ctx.publicador.publicados.some((e) => e.tipo === 'ConflictoDeIngreso')).toBe(true);
  });
});
