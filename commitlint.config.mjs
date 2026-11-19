// Constitución §6: Conventional Commits en español con ámbitos por módulo.
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [2, 'always', ['feat', 'fix', 'docs', 'test', 'refactor', 'chore', 'ci', 'build', 'perf']],
    'scope-enum': [
      2,
      'always',
      ['cartelera', 'boleteria', 'convocatorias', 'operacion', 'identidad', 'arquitectura', 'specs',
        'constitucion', 'adr', 'dominio', 'investigacion', 'ci', 'monorepo', 'contratos', 'web', 'api', 'deps'],
    ],
    'subject-case': [0],
    'body-max-line-length': [0],
  },
};
