import { describe, expect, it, vi } from 'vitest';
import { GuardarDocumento } from './guardar-documento';
import { FalsoEscanerAntivirus, type ResultadoFalsoAntivirus } from '../infrastructure/escaner-antivirus-falso';
import { MemoriaAlmacenamientoDocumentos } from '../infrastructure/almacenamiento-memoria.adapter';

const datos = { id: 'doc-1', postulacionId: 'post-1', tipo: 'dossier', nombreOriginal: 'dossier.pdf', objectKey: 'opaque/key.pdf', mimeType: 'application/pdf', bytes: 9, sha256: 'a'.repeat(64), contenido: Buffer.from('%PDF-1.7') };

describe('GuardarDocumento (T009)', () => {
  it('persiste objeto y metadata solo si el escaneo está limpio', async () => {
    const almacenamiento = new MemoriaAlmacenamientoDocumentos();
    const repo = { registrarDocumento: vi.fn().mockResolvedValue(undefined) };
    await new GuardarDocumento(new FalsoEscanerAntivirus('limpio'), almacenamiento, repo).ejecutar(datos);
    await expect(almacenamiento.leer(datos.objectKey)).resolves.toEqual(datos.contenido);
    expect(repo.registrarDocumento).toHaveBeenCalledOnce();
  });
  it.each(['infectado', 'caido'] as ResultadoFalsoAntivirus[])('no persiste objeto ni metadata cuando el escáner está %s', async (resultado) => {
    const almacenamiento = new MemoriaAlmacenamientoDocumentos();
    const repo = { registrarDocumento: vi.fn().mockResolvedValue(undefined) };
    await expect(new GuardarDocumento(new FalsoEscanerAntivirus(resultado), almacenamiento, repo).ejecutar(datos)).rejects.toThrow();
    await expect(almacenamiento.leer(datos.objectKey)).rejects.toThrow();
    expect(repo.registrarDocumento).not.toHaveBeenCalled();
  });
  it('borra el objeto si falla la transacción de metadata', async () => {
    const almacenamiento = new MemoriaAlmacenamientoDocumentos();
    const repo = { registrarDocumento: vi.fn().mockRejectedValue(new Error('db')) };
    await expect(new GuardarDocumento(new FalsoEscanerAntivirus('limpio'), almacenamiento, repo).ejecutar(datos)).rejects.toThrow('db');
    await expect(almacenamiento.leer(datos.objectKey)).rejects.toThrow();
  });
});
