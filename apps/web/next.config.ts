import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { NextConfig } from 'next';

// En el monorepo las variables viven en el .env de la raíz (las del sistema tienen prioridad)
const envRaiz = resolve(import.meta.dirname, '../../.env');
if (existsSync(envRaiz)) process.loadEnvFile(envRaiz);

const config: NextConfig = {
  transpilePackages: ['@fiavl/contracts'],
  poweredByHeader: false,
};

export default config;
