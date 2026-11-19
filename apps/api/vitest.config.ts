import { defineConfig } from 'vitest/config';

// Unitarias. Puerta Q2: cobertura ≥ 80 % en la capa de dominio.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/modules/*/domain/**/*.ts'],
      exclude: ['**/*.test.ts'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
