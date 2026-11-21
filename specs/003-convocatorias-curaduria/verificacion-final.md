# Verificación final de Convocatorias y curaduría (003)

Registro de las tareas T051–T056 sobre la rama `003-convocatorias-curaduria` (US1–US3 completas).

## Resultados de ejecución

| Tarea | Comando | Resultado |
|---|---|---|
| T051 (Q1) | `pnpm lint && pnpm typecheck` | Sin errores ni advertencias nuevas. |
| T052 (Q2) | `pnpm test` | contracts 13, web 22, api 108 pruebas OK. Cobertura del dominio de Convocatorias: 100 % de líneas en `admisibilidad`, `documentos`, `permisos`, `puntaje`, `conflictos` y `estados` (umbral global 80 %). El falso antivirus cubre limpio, infectado y caído (`escaner-antivirus-falso.test.ts`). |
| T053 | `pnpm --filter @fiavl/api exec vitest run --config vitest.int.config.ts --exclude "**/concurrencia.int.test.ts"` | 26 archivos, 91 pruebas OK con PostgreSQL real y adaptadores memoria/disco, sin ClamAV. `concurrencia.int.test.ts` se excluyó por indicación y no se modificó: falla en Windows local pero pasa en CI (job «Integración con PostgreSQL»). No hubo fallos de Boletería en estas corridas. |
| T054 (Q7) | `pnpm --filter @fiavl/web test:e2e` contra `NODE_ENV=development` y `turbo --env-mode=loose` | 116 pruebas OK (móvil Pixel 7 y escritorio) con axe WCAG 2.1 A/AA en US1–US3, más la prueba de solo teclado de la evaluación. |
| T055 | quickstart: `pnpm db:up && db:migrate && db:generate && db:seed` (dos veces) y `pnpm dev` | Migraciones al día, cliente generado, semilla idempotente (segunda corrida sin errores ni duplicados), almacenamiento local en disco y las tres historias P1 demostrables. |
| T055 | `npx @redocly/cli@1.25.0 lint --extends=recommended …openapi.yaml` | Contrato válido (se añadieron `/panel/postulaciones`, `/panel/evaluaciones` y `/panel/postulaciones/{id}/evaluacion` y se corrigió un error preexistente en `NoAutorizado`). |
| T055 | `python scripts/validar-mermaid.py` | No se pudo ejecutar localmente (este equipo no tiene Python ni `mmdc`). Se valida en CI (job «Diagramas Mermaid»), que pasó en verde. |

## T056 · contratos, permisos y archivos compartidos

- **Eventos (Q3)**: `PostulacionEnviada` y `SubsanacionSolicitada` coinciden con `contracts/eventos-convocatorias.md`, se publican en la misma transacción (pg-boss) y sin correo directo. La curaduría no publica eventos nuevos: su rastro es la auditoría y la observabilidad.
- **Permisos (Q8)**: curador solo ve su asignación (403 en la ajena) y nunca recibe puntajes ajenos antes de enviar la propia; coordinación de convocatorias opera todo; coordinación provincial solo su provincia (listados, agregado, reapertura y descarga de documentos); postulante sin acceso a paneles. Probado en `curaduria.int.test.ts`, `api-admision.int.test.ts` y E2E.
- **Archivos compartidos**: cambios solo aditivos (`app.module.ts` y `worker.module.ts` registran el módulo; `schema.prisma` añade el schema `convocatorias`; `packages/contracts` añade eventos; layout público añade un enlace). No se tocó Boletería, `ci.yml` ni `concurrencia.int.test.ts`.
- **Secretos**: ninguno versionado; solo valores de prueba (`prueba-api-secreta`) y el valor por defecto de desarrollo documentado de la firma de descarga local.

## Cambios de arquitectura o documentación para una rama `docs/...`

1. Documentar la sesión de desarrollo de curaduría/coordinación (`x-cuenta-dev`/`x-rol-dev`, cookie `sesion_dev`) como sustituible por el adaptador real de Identidad (spec 004); la UI guarda la cuenta de curador en `localStorage`.
2. Registrar que las asignaciones siguen viniendo del seed en P1; `EvaluacionesPrismaRepository.asignarCurador` aplica RN-004 pero no tiene endpoint (alta y balanceo de carga quedan para US4/spec posterior).
3. Convención de `curador.conflictos`: lista de nombres (texto o `{ nombre, relacion? }`); la comparación ignora tildes y mayúsculas.
4. El seed añade la convocatoria cerrada `EV-2026` (3 postulaciones en evaluación) para curaduría/E2E, y corrige la colisión de ids de asignación entre curadores.
5. El perfil `antivirus` de `docker/docker-compose.yml` (ClamAV) es opcional y de una entrega anterior.
