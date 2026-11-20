import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoriaAlmacenamientoDocumentos } from './almacenamiento-memoria.adapter';
import { DiscoAlmacenamientoDocumentos } from './almacenamiento-disco.adapter';
import { S3AlmacenamientoDocumentos } from './almacenamiento-s3.adapter';

const key = 'b1a3ce34-8002-4f04-a934-1d79a33f1374';
const contenido = Buffer.from('documento privado');
const temporal: string[] = [];
afterEach(async () => { await Promise.all(temporal.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });

describe('adaptadores de almacenamiento', () => {
  it('memoria guarda, lee, borra y crea una URL local firmada con expiración', async () => {
    const adapter = new MemoriaAlmacenamientoDocumentos('secreto-test', 'http://localhost:4000');
    await adapter.guardar(key, contenido);
    await expect(adapter.leer(key)).resolves.toEqual(contenido);
    const url = new URL(await adapter.crearUrlDescarga(key, new Date(Date.now() + 300_000)));
    expect(url.pathname).toBe('/api/convocatorias/documentos/contenido');
    expect(url.searchParams.get('key')).toBe(key);
    expect(url.searchParams.get('sig')).toMatch(/^[a-f0-9]{64}$/);
    await adapter.eliminar(key);
    await expect(adapter.leer(key)).rejects.toThrow();
  });

  it('disco restringe la escritura a su raíz y conserva lectura privada', async () => {
    const root = await mkdtemp(join(tmpdir(), 'fiavl-documentos-'));
    temporal.push(root);
    const adapter = new DiscoAlmacenamientoDocumentos(root, 'secreto-test', 'http://localhost:4000');
    await adapter.guardar(key, contenido);
    await expect(adapter.leer(key)).resolves.toEqual(contenido);
    expect(await adapter.crearUrlDescarga(key, new Date(Date.now() + 300_000))).toContain('sig=');
    await expect(adapter.guardar('../escape', contenido)).rejects.toThrow();
  });

  it('S3 delega operaciones al SDK y firma GET con cinco minutos como máximo', async () => {
    const send = vi.fn().mockResolvedValue({ Body: { transformToByteArray: async () => contenido } });
    const client = { send } as never;
    const presign = vi.fn().mockResolvedValue('https://s3.example/private-signed-url');
    const adapter = new S3AlmacenamientoDocumentos(client, 'privado', presign);
    await adapter.guardar(key, contenido);
    await expect(adapter.leer(key)).resolves.toEqual(contenido);
    await expect(adapter.crearUrlDescarga(key, new Date(Date.now() + 300_000))).resolves.toBe('https://s3.example/private-signed-url');
    expect(presign).toHaveBeenCalledWith(client, expect.anything(), { expiresIn: expect.any(Number) });
    expect(presign.mock.calls[0]?.[2].expiresIn).toBeLessThanOrEqual(300);
    expect(send).toHaveBeenCalledTimes(2);
  });
});
