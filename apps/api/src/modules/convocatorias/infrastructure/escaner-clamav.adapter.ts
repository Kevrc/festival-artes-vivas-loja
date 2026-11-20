import { createConnection } from 'node:net';
import type { ResultadoEscaneo } from './escaner-antivirus-falso';

/** ClamAV clamd INSTREAM; errores, timeout y respuesta desconocida fallan cerrado. */
export class ClamAvTcpEscaner {
  constructor(private readonly host: string, private readonly port: number, private readonly timeoutMs = 5_000) {}

  escanear(contenido: Buffer): Promise<ResultadoEscaneo> {
    return new Promise((resolve, reject) => {
      const socket = createConnection({ host: this.host, port: this.port });
      const chunks: Buffer[] = [];
      const timeout = setTimeout(() => socket.destroy(new Error('timeout ClamAV')), this.timeoutMs);
      const finalizar = (error?: Error, resultado?: ResultadoEscaneo) => {
        clearTimeout(timeout);
        socket.destroy();
        if (error) reject(error);
        else resolve(resultado!);
      };
      socket.once('error', (error) => finalizar(error));
      socket.on('data', (data: Buffer) => {
        chunks.push(data);
        const respuesta = Buffer.concat(chunks).toString('utf8');
        if (/FOUND\s*\0?$/.test(respuesta)) finalizar(undefined, { limpio: false, motivo: 'infectado' });
        else if (/OK\s*\0?$/.test(respuesta)) finalizar(undefined, { limpio: true });
        else if (/ERROR/.test(respuesta)) finalizar(new Error('ClamAV rechazó el análisis'));
      });
      socket.once('connect', () => {
        socket.write('zINSTREAM\0');
        for (let inicio = 0; inicio < contenido.length; inicio += 64 * 1024) {
          const parte = contenido.subarray(inicio, Math.min(inicio + 64 * 1024, contenido.length));
          const longitud = Buffer.alloc(4);
          longitud.writeUInt32BE(parte.length);
          socket.write(longitud);
          socket.write(parte);
        }
        socket.end(Buffer.alloc(4));
      });
    });
  }
}
