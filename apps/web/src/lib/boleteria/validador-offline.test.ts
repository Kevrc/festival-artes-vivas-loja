import { generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { crearAlmacenValidador, validarLocalmenteOffline, verificarTokenQrWeb } from './validador-offline';

describe('validador-offline (T031: Ed25519 Web Crypto, IndexedDB, ámbar y código corto)', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'der' },
  });
  const spkiBase64 = publicKey.toString('base64');

  function firmar(entradaId: string, funcionId: string) {
    const carga = `v1.${entradaId}.${funcionId}.1794700800`;
    const firma = sign(null, Buffer.from(carga, 'utf8'), privateKey).toString('base64url');
    return `${carga}.${firma}`;
  }

  it('verifica firma Ed25519 con Web Crypto y rechaza tokens manipulados', async () => {
    const entradaId = randomUUID();
    const funcionId = randomUUID();
    const token = firmar(entradaId, funcionId);
    expect(await verificarTokenQrWeb(token, spkiBase64)).toEqual({ valido: true, entradaId, funcionId });
    expect((await verificarTokenQrWeb(`${token.slice(0, -3)}xxx`, spkiBase64)).valido).toBe(false);
  });

  it('valida sin conexión en verde, ámbar (< 1 min mismo dispositivo), rojo y código corto manual', async () => {
    const funcionId = randomUUID();
    const ent1 = randomUUID();
    const ent2 = randomUUID();
    const token1 = firmar(ent1, funcionId);
    const almacen = crearAlmacenValidador();

    await almacen.guardarPaquete({
      funcionId,
      obraTitulo: 'Zombi Manifiesto',
      sedeId: randomUUID(),
      sedeNombre: 'Teatro Bolívar',
      inicio: '2026-11-14T20:00:00-05:00',
      fin: '2026-11-14T21:30:00-05:00',
      ventanaInicio: '2026-11-14T19:00:00-05:00',
      llavePublicaEd25519Spki: spkiBase64,
      horaServidor: '2026-11-14T19:15:00-05:00',
      desfaseMs: 0,
      descargadoEn: '2026-11-14T19:15:00-05:00',
      entradas: [
        { id: ent1, codigoCorto: 'A7K9M2P4', estado: 'valida', usadaEn: null, puerta: null, dispositivoId: null },
        { id: ent2, codigoCorto: 'B8N3Q5R7', estado: 'valida', usadaEn: null, puerta: null, dispositivoId: null },
      ],
    });

    const t0 = new Date('2026-11-14T19:15:00-05:00');
    const rVerde = await validarLocalmenteOffline({
      almacen,
      funcionId,
      tokenQr: token1,
      dispositivoId: 'cel-1',
      puerta: 'Puerta A',
      ahora: t0,
    });
    expect(rVerde.semaforo).toBe('verde');
    expect(await almacen.listarCola()).toHaveLength(1);

    // Reescaneo < 1 min mismo dispositivo -> ámbar sin duplicar cola
    const rAmbar = await validarLocalmenteOffline({
      almacen,
      funcionId,
      tokenQr: token1,
      dispositivoId: 'cel-1',
      puerta: 'Puerta A',
      ahora: new Date('2026-11-14T19:15:25-05:00'),
    });
    expect(rAmbar.semaforo).toBe('ambar');
    expect(await almacen.listarCola()).toHaveLength(1);

    // Código corto manual con guion -> verde
    const rCorto = await validarLocalmenteOffline({
      almacen,
      funcionId,
      codigoCorto: 'b8n3-q5r7',
      dispositivoId: 'cel-1',
      puerta: 'Puerta A',
      ahora: t0,
    });
    expect(rCorto.semaforo).toBe('verde');
    expect(await almacen.listarCola()).toHaveLength(2);
  });
});
