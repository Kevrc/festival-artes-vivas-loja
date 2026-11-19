import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { TestProject } from 'vitest/node';

let contenedor: StartedPostgreSqlContainer;

/** PostgreSQL real con las migraciones aplicadas (constitución IV: integración contra la base real). */
export async function setup(project: TestProject) {
  contenedor = await new PostgreSqlContainer('postgres:16-alpine').start();
  const url = contenedor.getConnectionUri();
  execSync('pnpm exec prisma migrate deploy', {
    cwd: resolve(import.meta.dirname, '../../..'),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'ignore',
  });
  project.provide('databaseUrl', url);
}

export async function teardown() {
  await contenedor?.stop();
}

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}
