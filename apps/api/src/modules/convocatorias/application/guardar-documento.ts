import type { AlmacenamientoDocumentosPort, EscanerAntivirusPort, RepositorioConvocatoriasPort } from './puertos';

export interface DocumentoPorGuardar {
  id: string;
  postulacionId: string;
  tipo: string;
  nombreOriginal: string;
  objectKey: string;
  mimeType: string;
  bytes: number;
  sha256: string;
  contenido: Buffer;
}

export class GuardarDocumento {
  constructor(
    private readonly escaner: EscanerAntivirusPort,
    private readonly almacenamiento: AlmacenamientoDocumentosPort,
    private readonly repositorio: Pick<RepositorioConvocatoriasPort, 'registrarDocumento'>,
  ) {}

  async ejecutar(documento: DocumentoPorGuardar): Promise<void> {
    const resultado = await this.escaner.escanear(documento.contenido);
    if (!resultado.limpio) throw new Error(resultado.motivo ?? 'Documento rechazado por antivirus');
    await this.almacenamiento.guardar(documento.objectKey, documento.contenido);
    try {
      const { contenido: _contenido, ...metadata } = documento;
      await this.repositorio.registrarDocumento(metadata);
    } catch (error) {
      await this.almacenamiento.eliminar(documento.objectKey);
      throw error;
    }
  }
}
