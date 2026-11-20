import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { AlmacenamientoDocumentosPort } from '../application/puertos';

export type FirmadorS3 = (client: S3Client, command: GetObjectCommand, options: { expiresIn: number }) => Promise<string>;

export class S3AlmacenamientoDocumentos implements AlmacenamientoDocumentosPort {
  constructor(private readonly client: S3Client, private readonly bucket: string, private readonly firmador: FirmadorS3 = getSignedUrl) {}
  async guardar(objectKey: string, contenido: Buffer): Promise<void> {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: objectKey, Body: contenido }));
  }
  async leer(objectKey: string): Promise<Buffer> {
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: objectKey }));
    if (!result.Body) throw new Error('Objeto S3 inexistente');
    return Buffer.from(await result.Body.transformToByteArray());
  }
  async eliminar(objectKey: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: objectKey }));
  }
  async crearUrlDescarga(objectKey: string, venceEn: Date): Promise<string> {
    const expiresIn = Math.floor((venceEn.getTime() - Date.now()) / 1000);
    if (expiresIn <= 0 || expiresIn > 300) throw new Error('La URL debe vencer dentro de cinco minutos');
    return this.firmador(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: objectKey }), { expiresIn });
  }
}
