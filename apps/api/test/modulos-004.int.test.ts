import 'reflect-metadata';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { Test } from '@nestjs/testing';
import { IDENTIDAD_PUBLICA } from '@fiavl/contracts';
import { afterAll, describe, expect, inject, it } from 'vitest';

// T006: los módulos de la spec 004 arrancan en el API y en el worker sin romper los existentes.
process.env.DATABASE_URL = inject('databaseUrl');
process.env.LOG_LEVEL = 'silent';

const cerrar: (() => Promise<void>)[] = [];
afterAll(async () => {
  for (const c of cerrar) await c();
});

describe('registro de Operación e Identidad', () => {
  it('el API arranca con todos los módulos y ofrece IDENTIDAD_PUBLICA a todos', async () => {
    const { AppModule } = await import('../src/app.module');
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = modulo.createNestApplication({ logger: false });
    await app.init();
    cerrar.push(() => app.close());
    const identidad = app.get(IDENTIDAD_PUBLICA);
    expect(await identidad.resolverSesion({ headers: {} })).toBeNull();
  });

  /**
   * Humo real del proceso worker (apps/worker/src/main.ts, con su propia copia de @nestjs/core):
   * compilar el módulo no basta, hace falta arrancarlo. Detectó que el guard HTTP rompía el worker.
   * También detectó que, en una base nueva, crear colas a la vez interbloqueaba pg-boss (40P01):
   * ColaEventos las crea ahora de una en una.
   */
  it('el proceso worker arranca y escucha las colas, sin errores de inyección', async () => {
    const raiz = resolve(import.meta.dirname, '../../..');
    const arrancar = () =>
      new Promise<{ resultado: string; salida: string }>((fin) => {
        const hijo = spawn(process.execPath, ['--import', 'tsx', 'apps/worker/src/main.ts'], {
          cwd: raiz,
          env: { ...process.env, NODE_ENV: 'development', LOG_LEVEL: 'info', WORKER_METRICS_PORT: '0', TSX_TSCONFIG_PATH: 'apps/api/tsconfig.json' },
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        let salida = '';
        const terminar = (resultado: string) => {
          clearTimeout(reloj);
          hijo.kill();
          fin({ resultado, salida });
        };
        const leer = (b: Buffer) => {
          salida += b.toString();
          if (/ExceptionHandler|UnknownDependencies|Error:|code: '/.test(salida)) setTimeout(() => terminar('error'), 300);
          else if (/Escuchando \d+ colas de la cartelera/.test(salida) && /Escuchando \d+ colas y trabajos programados de Boletería/.test(salida)) terminar('listo');
        };
        const reloj = setTimeout(() => terminar('tiempo'), 40_000);
        hijo.stdout.on('data', leer);
        hijo.stderr.on('data', leer);
        hijo.on('exit', () => terminar(salida.includes('Escuchando') ? 'salio' : 'error'));
      });
    const intento = await arrancar();
    expect(intento.resultado, intento.salida.slice(-2000)).toBe('listo');
  }, 60_000);
});
