import { S3Client } from '@aws-sdk/client-s3';
import type { AlmacenamientoDocumentosPort } from '../application/puertos';
import { DiscoAlmacenamientoDocumentos } from './almacenamiento-disco.adapter';
import { MemoriaAlmacenamientoDocumentos } from './almacenamiento-memoria.adapter';
import { S3AlmacenamientoDocumentos } from './almacenamiento-s3.adapter';

export function crearAlmacenamientoDocumentos(env = process.env): AlmacenamientoDocumentosPort {
  const modo = env.CONVOCATORIAS_ALMACENAMIENTO ?? (env.NODE_ENV === 'test' ? 'memoria' : 'disco');
  if (env.NODE_ENV === 'production' && modo !== 's3') throw new Error('Producción requiere almacenamiento S3');
  if (modo === 'memoria') return new MemoriaAlmacenamientoDocumentos(env.CONVOCATORIAS_FIRMA_SECRET, env.API_URL);
  if (modo === 'disco') {
    return new DiscoAlmacenamientoDocumentos(
      env.CONVOCATORIAS_DISCO_DIRECTORIO ?? '.almacen-dev',
      env.CONVOCATORIAS_FIRMA_SECRET ?? 'solo-desarrollo-cambiar',
      env.API_URL,
    );
  }
  if (modo === 's3') {
    const bucket = env.CONVOCATORIAS_S3_BUCKET;
    if (!bucket) throw new Error('CONVOCATORIAS_S3_BUCKET es obligatoria');
    const client = new S3Client({
      region: env.CONVOCATORIAS_S3_REGION ?? 'us-east-1',
      ...(env.CONVOCATORIAS_S3_ENDPOINT ? { endpoint: env.CONVOCATORIAS_S3_ENDPOINT } : {}),
      forcePathStyle: env.CONVOCATORIAS_S3_PATH_STYLE === 'true',
      ...(env.CONVOCATORIAS_S3_ACCESS_KEY && env.CONVOCATORIAS_S3_SECRET_KEY
        ? { credentials: { accessKeyId: env.CONVOCATORIAS_S3_ACCESS_KEY, secretAccessKey: env.CONVOCATORIAS_S3_SECRET_KEY } }
        : {}),
    });
    return new S3AlmacenamientoDocumentos(client, bucket);
  }
  throw new Error(`CONVOCATORIAS_ALMACENAMIENTO inválido: ${modo}`);
}
