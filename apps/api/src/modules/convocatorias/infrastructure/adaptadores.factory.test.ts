import { describe, expect, it } from 'vitest';
import { DiscoAlmacenamientoDocumentos } from './almacenamiento-disco.adapter';
import { MemoriaAlmacenamientoDocumentos } from './almacenamiento-memoria.adapter';
import { S3AlmacenamientoDocumentos } from './almacenamiento-s3.adapter';
import { crearAlmacenamientoDocumentos } from './almacenamiento.factory';
import { ClamAvTcpEscaner } from './escaner-clamav.adapter';
import { crearEscanerAntivirus } from './escaner.factory';
import { FalsoEscanerAntivirus } from './escaner-antivirus-falso';

describe('selección de adaptadores Convocatorias', () => {
  it('elige memoria para pruebas, disco local para desarrollo y S3 obligatorio en producción', () => {
    expect(crearAlmacenamientoDocumentos({ NODE_ENV: 'test' })).toBeInstanceOf(MemoriaAlmacenamientoDocumentos);
    expect(crearAlmacenamientoDocumentos({ NODE_ENV: 'development', CONVOCATORIAS_ALMACENAMIENTO: 'disco' })).toBeInstanceOf(DiscoAlmacenamientoDocumentos);
    expect(() => crearAlmacenamientoDocumentos({ NODE_ENV: 'production', CONVOCATORIAS_ALMACENAMIENTO: 'disco' })).toThrow(/requiere almacenamiento S3/);
    expect(crearAlmacenamientoDocumentos({ NODE_ENV: 'production', CONVOCATORIAS_ALMACENAMIENTO: 's3', CONVOCATORIAS_S3_BUCKET: 'privado' })).toBeInstanceOf(S3AlmacenamientoDocumentos);
  });
  it('elige el falso configurable o ClamAV TCP sin levantarlo en las pruebas', () => {
    expect(crearEscanerAntivirus({ CONVOCATORIAS_ANTIVIRUS: 'simulador', CONVOCATORIAS_ANTIVIRUS_RESULTADO: 'infectado' })).toBeInstanceOf(FalsoEscanerAntivirus);
    expect(crearEscanerAntivirus({ CONVOCATORIAS_ANTIVIRUS: 'clamav', CONVOCATORIAS_CLAMAV_HOST: 'clamav', CONVOCATORIAS_CLAMAV_PORT: '3310' })).toBeInstanceOf(ClamAvTcpEscaner);
  });
});
