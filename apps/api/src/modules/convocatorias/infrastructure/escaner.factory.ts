import type { EscanerAntivirusPort } from '../application/puertos';
import { ClamAvTcpEscaner } from './escaner-clamav.adapter';
import { FalsoEscanerAntivirus, type ResultadoFalsoAntivirus } from './escaner-antivirus-falso';

export function crearEscanerAntivirus(env = process.env): EscanerAntivirusPort {
  const modo = env.CONVOCATORIAS_ANTIVIRUS ?? 'simulador';
  if (env.NODE_ENV === 'production' && modo !== 'clamav') throw new Error('Producción requiere ClamAV');
  if (modo === 'simulador') {
    return new FalsoEscanerAntivirus((env.CONVOCATORIAS_ANTIVIRUS_RESULTADO ?? 'limpio') as ResultadoFalsoAntivirus);
  }
  if (modo === 'clamav') {
    return new ClamAvTcpEscaner(env.CONVOCATORIAS_CLAMAV_HOST ?? 'localhost', Number(env.CONVOCATORIAS_CLAMAV_PORT ?? 3310));
  }
  throw new Error(`CONVOCATORIAS_ANTIVIRUS inválido: ${modo}`);
}
