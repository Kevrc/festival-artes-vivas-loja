import js from '@eslint/js';
import tseslint from 'typescript-eslint';

const MODULOS = ['programacion', 'boleteria', 'convocatorias', 'operacion', 'identidad'];

/**
 * Regla de fronteras (vista de desarrollo §2): un módulo no importa a otro;
 * solo usa @fiavl/contracts.
 */
export const fronterasEntreModulos = MODULOS.map((modulo) => ({
  files: [`**/modules/${modulo}/**/*.ts`],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: MODULOS.filter((m) => m !== modulo).map((otro) => ({
          group: [`**/modules/${otro}/**`, `../${otro}/**`, `../../${otro}/**`],
          message: `El módulo ${modulo} no puede importar ${otro}: usa @fiavl/contracts (constitución III).`,
        })),
      },
    ],
  },
}));

export default [
  { ignores: ['**/dist/**', '**/.next/**', '**/coverage/**', '**/generated/**', '**/node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' }],
    },
  },
  ...fronterasEntreModulos,
];
