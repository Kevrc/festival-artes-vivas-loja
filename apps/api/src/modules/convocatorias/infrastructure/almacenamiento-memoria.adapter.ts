import type { AlmacenamientoDocumentosPort } from '../application/puertos';
import { urlDescargaLocal } from './firma-descarga-local';

export class MemoriaAlmacenamientoDocumentos implements AlmacenamientoDocumentosPort {
  private readonly objetos = new Map<string, Buffer>();
  constructor(private readonly secreto = 'fixture-solo-tests', private readonly baseUrl = 'http://localhost:4000') {}

  async guardar(objectKey: string, contenido: Buffer): Promise<void> { this.objetos.set(objectKey, Buffer.from(contenido)); }
  async leer(objectKey: string): Promise<Buffer> {
    const contenido = this.objetos.get(objectKey);
    if (!contenido) throw new Error('Documento inexistente');
    return Buffer.from(contenido);
  }
  async eliminar(objectKey: string): Promise<void> { this.objetos.delete(objectKey); }
  async crearUrlDescarga(objectKey: string, venceEn: Date): Promise<string> {
    if (!this.objetos.has(objectKey)) throw new Error('Documento inexistente');
    return urlDescargaLocal(this.baseUrl, this.secreto, objectKey, venceEn);
  }
}
