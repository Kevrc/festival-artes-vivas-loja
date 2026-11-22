import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.ts'],
      // Reglas puras (equivalente a domain/, puerta Q2). api.ts, favoritos.ts, api-boleteria.ts y
      // cartelera-operacion.ts son adaptadores HTTP/navegador cubiertos por E2E; tipos.ts solo declara tipos.
      exclude: [
        '**/*.test.ts',
        'src/lib/cartelera/api.ts',
        'src/lib/cartelera/favoritos.ts',
        'src/lib/cartelera/tipos.ts',
        'src/lib/boleteria/api-boleteria.ts',
        'src/lib/boleteria/cartelera-operacion.ts',
        'src/lib/operacion/api.ts',
        'src/lib/identidad/api.ts',
      ],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
