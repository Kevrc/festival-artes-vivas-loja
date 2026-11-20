import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import type { AlmacenamientoDocumentosPort } from '../application/puertos';
import { urlDescargaLocal } from './firma-descarga-local';

export class DiscoAlmacenamientoDocumentos implements AlmacenamientoDocumentosPort {
  private readonly raiz: string;
  constructor(raiz: string, private readonly secreto: string, private readonly baseUrl = 'http://localhost:4000') {
    this.raiz = resolve(isAbsolute(raiz) ? raiz : join(process.cwd(), raiz));
  }
  private ruta(objectKey: string): string {
    const ruta = resolve(this.raiz, objectKey);
    if (!ruta.startsWith(`${this.raiz}${sep}`)) throw new Error('Key de objeto inválida');
    return ruta;
  }
  async guardar(objectKey: string, contenido: Buffer): Promise<void> {
    const ruta = this.ruta(objectKey);
    await mkdir(dirname(ruta), { recursive: true });
    await writeFile(ruta, contenido, { mode: 0o600 });
  }
  async leer(objectKey: string): Promise<Buffer> { return readFile(this.ruta(objectKey)); }
  async eliminar(objectKey: string): Promise<void> {
    try { await unlink(this.ruta(objectKey)); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  async crearUrlDescarga(objectKey: string, venceEn: Date): Promise<string> {
    return urlDescargaLocal(this.baseUrl, this.secreto, objectKey, venceEn);
  }
}
