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

  it('verifica firma Ed25519 con Web Crypto y rechaza tokens malformados o manipulados', async () => {
    const entradaId = randomUUID();
    const funcionId = randomUUID();
    const token = firmar(entradaId, funcionId);
    expect(await verificarTokenQrWeb(token, spkiBase64)).toEqual({ valido: true, entradaId, funcionId });
    expect((await verificarTokenQrWeb(`${token.slice(0, -3)}xxx`, spkiBase64)).valido).toBe(false);
    expect((await verificarTokenQrWeb('invalido', spkiBase64)).valido).toBe(false);
    expect((await verificarTokenQrWeb('v1....', spkiBase64)).valido).toBe(false);
    expect((await verificarTokenQrWeb(token, 'llave-corrupta')).valido).toBe(false);
  });

  it('valida sin conexión verde, ámbar, todos los rechazos rojos, desfase de reloj y limpieza de cola', async () => {
    const funcionId = randomUUID();
    const otraFuncionId = randomUUID();
    const ent1 = randomUUID();
    const ent2 = randomUUID();
    const entAnulada = randomUUID();
    const entLiberada = randomUUID();
    const token1 = firmar(ent1, funcionId);
    const tokenOtra = firmar(randomUUID(), otraFuncionId);
    const almacen = crearAlmacenValidador();

    // Sin paquete descargado -> rojo no_encontrada
    const sinPaq = await validarLocalmenteOffline({
      almacen,
      funcionId,
      codigoCorto: 'A7K9-M2P4',
      dispositivoId: 'cel-1',
      puerta: 'Puerta A',
    });
    expect(sinPaq).toMatchObject({ semaforo: 'rojo', codigo: 'no_encontrada' });

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
        { id: entAnulada, codigoCorto: 'C2D4F6H8', estado: 'anulada', usadaEn: null, puerta: null, dispositivoId: null },
        { id: entLiberada, codigoCorto: 'J5K7L9M3', estado: 'liberada', usadaEn: null, puerta: null, dispositivoId: null },
      ],
    });

    // Firma inválida, otra función y código no existente
    expect(
      (
        await validarLocalmenteOffline({
          almacen,
          funcionId,
          tokenQr: `${token1.slice(0, -3)}xxx`,
          dispositivoId: 'cel-1',
          puerta: 'Puerta A',
        })
      ).codigo,
    ).toBe('firma_invalida');

    expect(
      (
        await validarLocalmenteOffline({
          almacen,
          funcionId,
          tokenQr: tokenOtra,
          dispositivoId: 'cel-1',
          puerta: 'Puerta A',
        })
      ).codigo,
    ).toBe('otra_funcion');

    expect(
      (
        await validarLocalmenteOffline({
          almacen,
          funcionId,
          codigoCorto: 'ZZZZ-9999',
          dispositivoId: 'cel-1',
          puerta: 'Puerta A',
        })
      ).codigo,
    ).toBe('no_encontrada');

    // Fuera de ventana horaria -> rojo fuera_de_horario
    expect(
      (
        await validarLocalmenteOffline({
          almacen,
          funcionId,
          tokenQr: token1,
          dispositivoId: 'cel-1',
          puerta: 'Puerta A',
          ahora: new Date('2026-11-14T18:00:00-05:00'),
        })
      ).codigo,
    ).toBe('fuera_de_horario');

    // Anulada y liberada -> rojo con motivo exacto
    expect(
      (
        await validarLocalmenteOffline({
          almacen,
          funcionId,
          codigoCorto: 'C2D4-F6H8',
          dispositivoId: 'cel-1',
          puerta: 'Puerta A',
          ahora: new Date('2026-11-14T19:15:00-05:00'),
        })
      ).codigo,
    ).toBe('anulada');

    expect(
      (
        await validarLocalmenteOffline({
          almacen,
          funcionId,
          codigoCorto: 'J5K7-L9M3',
          dispositivoId: 'cel-1',
          puerta: 'Puerta A',
          ahora: new Date('2026-11-14T19:15:00-05:00'),
        })
      ).codigo,
    ).toBe('liberada');

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

    // Reescaneo tras >= 1 min u otro dispositivo -> rojo ya_usada
    const rUsadaOtroDisp = await validarLocalmenteOffline({
      almacen,
      funcionId,
      tokenQr: token1,
      dispositivoId: 'cel-2',
      puerta: 'Puerta B',
      ahora: new Date('2026-11-14T19:15:30-05:00'),
    });
    expect(rUsadaOtroDisp).toMatchObject({ semaforo: 'rojo', codigo: 'ya_usada' });

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

    // Limpieza selectiva por función y limpieza total
    await almacen.limpiarCola(otraFuncionId);
    expect(await almacen.listarCola()).toHaveLength(2);
    await almacen.limpiarCola(funcionId);
    expect(await almacen.listarCola()).toHaveLength(0);

    await almacen.encolarIngreso({
      entradaId: ent2,
      funcionId,
      dispositivoId: 'cel-1',
      puerta: 'Puerta A',
      escaneadoEn: t0.toISOString(),
      desfaseMs: 0,
    });
    expect(await almacen.listarCola()).toHaveLength(1);
    await almacen.limpiarCola();
    expect(await almacen.listarCola()).toHaveLength(0);
  });
});
