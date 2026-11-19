import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.ts'],
      // Reglas puras (equivalente a domain/, puerta Q2). api.ts y favoritos.ts son adaptadores del
      // navegador cubiertos por las E2E; tipos.ts solo declara tipos.
      exclude: ['**/*.test.ts', 'src/lib/cartelera/api.ts', 'src/lib/cartelera/favoritos.ts', 'src/lib/cartelera/tipos.ts'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
