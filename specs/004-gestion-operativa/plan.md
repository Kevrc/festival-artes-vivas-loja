# Implementation Plan: Gestión operativa, cuentas y notificaciones

**Branch**: `004-gestion-operativa` | **Date**: 2026-11-20 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/004-gestion-operativa/spec.md`

**Responsable**: @jeimytorresg · **Revisor suplente**: @Carlos2190

## Summary

La spec 004 añade dos **módulos separados** al monolito modular
([ADR-0001](../../docs/adr/0001-monolito-modular.md)), liderados por la misma persona:

- **Operación** (US1–US6): ediciones, sedes, obras y elencos; grilla de funciones sin cruces;
  publicación; reprogramación y cancelación con motivo; incidencias y conteos; estadísticas e
  informe de cierre. Pasa a ser la **fuente real** de los eventos `ProgramacionPublicada`,
  `FuncionProgramada`, `FuncionActualizada`, `FuncionReprogramada`, `FuncionCancelada` y
  `AforoCambiado`, que hoy simulan la semilla y `pnpm events:emit`. Cumple esos contratos **sin
  modificarlos**, así que Cartelera (001) y Boletería (002) no cambian.
- **Identidad** (US7–US12): registro con correo verificado, sesiones, roles con alcance, segundo
  factor del personal, LOPDP, acreditación de estudiantes y el servicio único de notificaciones
  por correo. Sustituye los adaptadores temporales `AutorizacionDevAdapter` (002) y `SesionGuard`
  (001) mediante el contrato `IdentidadPublica`, **sin cambiar la spec 002**.

**Enfoque técnico**:
- **Cruces de agenda**: los impide una regla de dominio, respaldada por restricciones `EXCLUDE`
  sobre rangos de tiempo en PostgreSQL ([ADR-0010](../../docs/adr/0010-cruces-con-restriccion-de-exclusion.md)).
- **Ediciones concurrentes**: control optimista con versión y `If-Match`.
- **Eventos**: se publican en la misma transacción con pg-boss ([ADR-0003](../../docs/adr/0003-eventos-outbox.md)).
- **Estadísticas**: salen de una proyección propia alimentada por los eventos de Boletería.
- **Sesiones**: tokens opacos guardados en PostgreSQL ([ADR-0009](../../docs/adr/0009-sesiones-opacas.md)).
- **Contraseñas y segundo factor**: scrypt y TOTP con `node:crypto`.
- **Notificaciones**: una fila por aviso con clave de deduplicación, más un trabajo pg-boss con
  reintentos de hasta 24 h ([ADR-0011](../../docs/adr/0011-notificaciones-con-cola.md)).

Decisiones detalladas en [research.md](research.md) (R1–R23).

## Technical Context

**Language/Version**: TypeScript 5.9 sobre Node.js 22 LTS ([ADR-0002](../../docs/adr/0002-stack-por-necesidades.md))

**Primary Dependencies**:
- NestJS 11: módulos `operacion` e `identidad`.
- Next.js 15.5: rutas `(publico)/cuenta`, `(publico)/mi-cuenta` y `(panel)`.
- Prisma 6.19 con `multiSchema`.
- pg-boss 10: eventos, envío de notificaciones y cierre de ediciones.
- zod 3: contratos y DTO.
- `node:crypto`: scrypt, TOTP, tokens y AES-256-GCM.
- `qrcode`: ya presente; QR de TOTP y de entradas en el correo.
- nestjs-pino y prom-client: ya presentes.
- **Nueva**: `nodemailer`, para SMTP ([research R23](research.md#r23-pruebas-y-dependencias-nuevas)).

**Storage**: PostgreSQL 16, con esquemas exclusivos `operacion` e `identidad`
([data-model.md](data-model.md)) y la extensión `btree_gist`. En desarrollo se usa **Mailpit**
(contenedor) como servidor de correo.

**Testing**: mismo stack que 002.
- Vitest, con cobertura ≥ 80 % en `domain/` de ambos módulos (Q2).
- Vitest + Testcontainers contra PostgreSQL real: `EXCLUDE` bajo concurrencia, outbox,
  idempotencia, matriz de autorización y anonimización.
- Contratos zod de los eventos nuevos.
- Playwright + `@axe-core/playwright`.
- k6 para la grilla y el inicio de sesión.

**Target Platform**: navegadores móviles y de escritorio desde 320 px. El panel del personal se
usa en tableta y escritorio, y el registro de incidencias en celular. Servidor Linux en
contenedores ([ADR-0008](../../docs/adr/0008-despliegue-contenedores.md)).

**Project Type**: monorepo web existente (`apps/api`, `apps/worker`, `apps/web`, `packages/contracts`).

**Performance Goals**:
- Grilla de 60 funciones en < 2 s (RNF-001).
- Eventos de cambio de función a los consumidores en < 1 min (RNF-002, SC-003).
- Panel actualizado al menos cada 5 min (RNF-003).
- Inicio de sesión en < 1 s p95 (RNF-004).
- 95 % de los avisos de servicio en < 1 min (RNF-005).
- Informe de cierre en < 5 min (SC-004).

**Constraints**:
- Cero cruces publicados (SC-001).
- Ninguna lectura de esquemas ajenos (Constitución III).
- Sin cambios en la spec 002.
- Autorización por rol y alcance en el servidor (VI).
- Contraseñas con hash adaptativo y nunca en logs (RNF-006).
- Sin llamadas externas para contraseñas filtradas.
- Secretos (`IDENTIDAD_CLAVE_CIFRADO`, SMTP) fuera del repositorio.
- Importes en centavos (V).
- Hora oficial `America/Guayaquil`.

**Scale/Scope**:
- Volumen: ~450 funciones y ~170 elencos por edición; 60 funciones en el día más cargado; unas
  decenas de cuentas de personal; decenas de miles de asistentes; ~25 000 eventos en el día pico
  ([00-drivers.md](../../docs/arquitectura/00-drivers.md)).
- Alcance de la spec: 12 historias, 25 FR, 12 RN, 7 RNF y 9 SC.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio | Cumplimiento en este plan | Estado |
|-----------|---------------------------|:------:|
| I. Especificación primero | Spec sin `[NEEDS CLARIFICATION]`, 5 aclaraciones integradas (2026-11-20) y checklist 14/14. `research.md`, `data-model.md`, `contracts/` y `quickstart.md` se generan antes de tareas y código | ✅ |
| II. Arquitectura 4+1 | Tres ADR propuestas (0009–0011). En la implementación se actualizan las vistas lógica (contextos Operación/Identidad, `IdentidadPublica`), procesos (reprogramación → avisos; login con TOTP; cruces concurrentes) y física (SMTP/Mailpit) | ✅ |
| III. Módulos y contratos | Esquemas `operacion` e `identidad` propios. Comunicación solo por eventos y por `IdentidadPublica` en `@fiavl/contracts`, sin consultar tablas de Boletería: se usan sus eventos actuales. Eventos de 003 como contrato provisional acordado con su dueño. OpenAPI contract-first | ✅ |
| IV. Pruebas como aceptación | Cada `USn-ASm` con prueba nombrada. Prueba primero en cruces (RN-001), cálculo de fin (RN-002), máquina de estados, indicadores (RN-003/004), scrypt, TOTP y bloqueo. Integración con PostgreSQL real para `EXCLUDE` y matriz de roles. E2E en las historias P1 | ✅ |
| V. Integridad del aforo y dinero | Operación no emite entradas ni cobra. Valida aforo habilitado ≤ sede y advierte del exceso al reprogramar; la resolución sigue en Boletería. Recaudación en centavos desde eventos. Historial de cambios y auditoría solo de inserción | ✅ |
| VI. Seguridad y privacidad | Mínimo privilegio con rol + alcance en cada endpoint y matriz SC-007. scrypt, bloqueo, sesiones con expiración, TOTP cifrado para el personal y CSRF por `Origin`. Respuestas que no revelan cuentas. LOPDP: descarga, corrección, anonimización y consentimientos versionados. Enlaces con tokens de 256 bits. `/security-review` obligatorio (Q8) | ✅ |
| VII. Acceso público e inclusivo | Registro e inicio de sesión en español, móviles y WCAG 2.1 AA. Grilla como tabla accesible con alternativa en lista. Accesibilidad de sede obligatoria en el modelo | ✅ |
| VIII. Resiliencia ante picos | El correo se encola y nunca bloquea compras (RNF-007). Si Identidad cae, la cartelera pública sigue (no requiere sesión). Los consumidores son asíncronos. Sesiones con una sola lectura indexada | ✅ |
| IX. Observabilidad y trazabilidad | `correlacionId` en eventos y logs. Métricas: notificaciones enviadas/fallidas, logins fallidos y bloqueos, funciones publicadas y canceladas. Auditoría inmutable de cambios de función, roles, TOTP y eliminaciones (FR-012, FR-024). Sin contraseñas, tokens ni secretos en logs | ✅ |
| X. Simplicidad | Reutiliza PostgreSQL, pg-boss y el monorepo. Una sola dependencia nueva (`nodemailer`), una extensión incluida en PostgreSQL (`btree_gist`) y Mailpit solo en desarrollo. Scrypt, TOTP y CSV con `node:crypto` y código propio. Sin Redis ni JWT. Finalización de funciones derivada en lugar de un trabajo programado | ✅ |

**Puertas de calidad aplicables**: Q1–Q8.
- **Q4**: CI en verde obligatoria. La revisión del suplente (@Carlos2190) se pide siempre en los PR
  de Identidad y en los que tocan Boletería; la de @By-Alvarez06 y @Kevrc, en el PR de integración.
- **§6**: los PR de contratos compartidos (T013–T017) y de `docs/arquitectura/` (T127) **requieren
  aprobación** del responsable de cada contexto afectado.
- **Q6**: ADR 0009–0011 y las vistas afectadas.
- **Q8**: `/security-review` en Identidad y en la integración.

**Re-evaluación tras la fase 1**:
- El modelo de datos no cruza esquemas.
- Los contratos existentes no cambian.
- Los eventos nuevos (`CuentaVerificada`, `RolAsignado`, `CuentaEliminada`) son aditivos.
- De Convocatorias, `PostulacionEnviada` y `SubsanacionSolicitada` se consumen tal como los define
  la rama 003; los tres de su US4 se proponen como contrato provisional del dueño.
- No aparecen componentes con estado nuevos en producción.

**Sin violaciones.**

## Project Structure

### Documentation (this feature)

```text
specs/004-gestion-operativa/
├── spec.md
├── plan.md                                   # este archivo
├── research.md                               # fase 0: R1–R23
├── data-model.md                             # fase 1: esquemas `operacion` e `identidad`
├── quickstart.md                             # fase 1: guía de validación (33 escenarios)
├── contracts/
│   ├── api-operacion.openapi.yaml            # API HTTP de Operación (OpenAPI 3.1)
│   ├── api-identidad.openapi.yaml            # API HTTP de Identidad (OpenAPI 3.1)
│   ├── eventos-operacion-identidad.md        # eventos publicados/consumidos y provisionales de 003
│   ├── identidad-publica.md                  # contrato IdentidadPublica para todos los módulos
│   └── rutas-web.md                          # páginas de cuenta y del panel
├── checklists/requirements.md
└── tasks.md                                  # fase 2: /speckit-tasks (no lo crea este comando)

docs/adr/
├── 0009-sesiones-opacas.md                   # propuesta
├── 0010-cruces-con-restriccion-de-exclusion.md
└── 0011-notificaciones-con-cola.md
```

### Source Code (repository root)

```text
apps/api/src/modules/operacion/
├── domain/
│   ├── tipos.ts
│   ├── agenda.ts (+ .test)                   # RN-001, RN-002, bloques continuos, día festival
│   ├── ciclo-funcion.ts (+ .test)            # transiciones, RN-005, solo lectura RN-007
│   ├── publicacion.ts (+ .test)              # validarPublicacion (FR-005)
│   ├── indicadores.ts (+ .test)              # RN-003, RN-004, variación interanual
│   └── edicion.ts (+ .test)                  # advertencia noviembre, copia "a partir de"
├── application/
│   ├── puertos.ts                            # RepositorioOperacion, PublicadorOperacion, Reloj, Auditoria
│   ├── ediciones/ · sedes/ · obras/
│   ├── funciones/                            # crear, editar, eliminar borrador, grilla
│   ├── publicacion/                          # validar, publicar edición, publicar función
│   ├── cambios/                              # reprogramar, cancelar
│   ├── incidencias/                          # incidencias y conteos
│   ├── estadisticas/                         # indicadores, CSV, informe, cerrar ediciones
│   └── eventos/                              # consumidores de 002 y 003 (idempotentes)
├── infrastructure/
│   ├── prisma-operacion.repository.ts        # traduce 23P01 (EXCLUDE) a conflicto de dominio
│   ├── publicador.pgboss.ts                  # destinos programacion/boleteria/identidad
│   └── consumidores.pgboss.ts                # colas operacion.* + cron cerrar-ediciones
├── interface/                                # controladores, esquemas zod, guard de rol+alcance
└── operacion.module.ts

apps/api/src/modules/identidad/
├── domain/
│   ├── contrasenas.ts (+ .test)              # scrypt, RN-008, lista filtrada
│   ├── totp.ts (+ .test)                     # RFC 6238 con vectores oficiales
│   ├── tokens.ts (+ .test)                   # enlaces de un solo uso, hash SHA-256
│   ├── sesiones.ts (+ .test)                 # expiración 30 d / 8 h, restricción por TOTP/política
│   ├── bloqueo.ts (+ .test)                  # 5 fallos / 15 min, 3 reenvíos / hora
│   ├── roles.ts (+ .test)                    # roles, alcance obligatorio, RN-009
│   ├── notificaciones.ts (+ .test)           # clave dedup RN-011, categorías, plazo 24 h
│   └── plantillas/ (+ .test)                 # correos en texto y HTML accesible
├── application/
│   ├── puertos.ts                            # RepositorioIdentidad, ProveedorCorreo, Reloj, Cifrador
│   ├── registro/ · sesion/ · segundo-factor/ · mi-cuenta/ · personal/ · estudiantes/
│   ├── notificaciones/                       # crear desde eventos, enviar con reintento
│   └── eventos/                              # consumidores de 002, 003 y Operación
├── infrastructure/
│   ├── prisma-identidad.repository.ts
│   ├── correo-smtp.adapter.ts                # nodemailer
│   ├── correo-memoria.adapter.ts             # pruebas
│   ├── cifrador-aes-gcm.ts
│   ├── datos/contrasenas-filtradas.txt       # lista local (≥ 10 caracteres)
│   ├── publicador.pgboss.ts · consumidores.pgboss.ts
│   └── identidad-publica.provider.ts         # implementa el contrato global
├── interface/                                # controladores, cookie, CSRF por Origin, guards
└── identidad.module.ts

apps/api/src/modules/boleteria/infrastructure/autorizacion-identidad.adapter.ts   # PR de integración
apps/api/src/modules/programacion/interface/sesion.guard.ts                        # PR de integración
apps/api/src/app.module.ts · worker.module.ts                                      # registrar módulos
apps/api/src/common/identidad/identidad-publica.dev.ts                             # solo development/test: cabeceras x-*-dev, falla cerrado

apps/api/test/operacion/  ·  apps/api/test/identidad/                              # integración

apps/web/src/app/
├── (publico)/cuenta/{registro,verificar,ingresar,recuperar,segundo-factor,politica}/page.tsx
├── (publico)/mi-cuenta/{page,sesiones,notificaciones,estudiante}.tsx
└── (panel)/{programacion,sala/incidencias,estadisticas,admin}/…
apps/web/src/lib/{operacion,identidad}/       # clientes HTTP tipados
apps/web/src/components/{operacion,identidad}/ # grilla accesible, formularios
apps/web/e2e/{operacion,identidad}-*.spec.ts

packages/contracts/src/
├── eventos/identidad.ts                      # CuentaVerificada, RolAsignado, CuentaEliminada
├── eventos/convocatorias-pendientes.ts       # US4 de 003, provisional; pasa a convocatorias.ts cuando su dueño lo acepte
├── eventos/index.ts                          # uniones EventoOperacion*, EventoIdentidad*
├── identidad/publica.ts                      # IDENTIDAD_PUBLICA, ContextoIdentidad
└── api/{operacion,identidad}.ts              # tipos generados desde OpenAPI

prisma/schema/{operacion,identidad}.prisma    # + migraciones con EXCLUDE y triggers de auditoría
prisma/seed/                                  # edición 2026 desde Operación, cuentas de prueba, cifras 2025
docker/docker-compose.yml                     # + servicio mailpit
scripts/emitir-evento.ts                      # + postulacion-seleccionada, seleccion-desistida, aforo-excedido
tests/carga/operacion.js                      # k6: grilla y login
```

**Structure Decision**: se sigue la [vista de desarrollo](../../docs/arquitectura/02-vista-desarrollo.md)
y el patrón hexagonal de 001 y 002 (`domain → application → infrastructure / interface`).
- Un archivo Prisma por módulo.
- Contratos compartidos en `packages/contracts`.
- Ningún import entre `modules/*`: Boletería y Cartelera dependen solo de
  `@fiavl/contracts/identidad`.

## Orden de implementación sugerido

| Fase | Contenido | Por qué en este orden |
|------|-----------|-----------------------|
| 1. Base | Esquemas, migraciones (`EXCLUDE`, auditoría), contratos de eventos nuevos, registro de módulos, Mailpit | Lo bloquea todo |
| 2. Operación P1 | US1 → US2 → US3 | Es el escenario +1 del video; reemplaza la semilla simulada |
| 3. Identidad P1 | US7 → US8 → US9 | Los demás módulos ya funcionan con el adaptador dev; se integra después |
| 4. Integración | `IdentidadPublica` en 002 y 001 (y en 003 cuando esté en `main`); E2E con login real | PR propio con aprobación de los dueños |
| 5. P2 | US10 → US4 → US5 → US11 | Avisos primero: dependen de eventos ya disponibles |
| 6. P3 | US6, US12 | Mientras tanto, datos maestros por semilla |
| 7. Cierre | Vistas 4+1, ADR aceptadas, carga k6, revisión de seguridad | Puertas Q6–Q8 |

PRs pequeños (< 400 líneas sin contar pruebas ni documentos) en subramas
`004-gestion-operativa-<tema>`; commits `feat(operacion|identidad): …` que citan `T0nn`.

## Dependencias con otras specs

| Necesita | De | Mientras no exista |
|----------|----|--------------------|
| `PostulacionEnviada`, `SubsanacionSolicitada` | 003 Convocatorias | Ya implementados en la rama `003-convocatorias-curaduria` (sin fusionar); se consumen tal cual cuando 003 llegue a `main` |
| `PostulacionSeleccionada`, `SeleccionDesistida`, `ResultadoPublicado` | 003 Convocatorias (US4, P2) | Forma propuesta en [eventos](contracts/eventos-operacion-identidad.md#52-pendientes-de-003-us4-propuesta-provisional), a añadir por @Carlos2190; `pnpm events:emit` los simula |
| Sustituir `AutorizacionConvocatoriasDevAdapter` por `IdentidadPublica` | 003 Convocatorias | Su adaptador dev sigue; el cambio va en el PR de integración con aprobación de @Carlos2190 |
| `EntradasEmitidas`, `PedidoReembolsado`, `IngresoRegistrado`, `AforoExcedido`, `ConflictoDeIngreso` | 002 Boletería | Ya publicados hacia `operacion.*` e `identidad.*`; sin cambios |
| Consumo de los eventos de Operación | 001 y 002 | Ya implementado contra los contratos existentes |
| Aprobación del PR de integración | Responsables de 001 y 002 | El adaptador dev sigue funcionando hasta fusionar |

## Riesgos

| Riesgo | Mitigación |
|--------|------------|
| Alcance grande (12 historias, dos módulos) para una persona | Orden por prioridad; P3 (US6, US12) recortable; semilla cubre datos maestros |
| El contrato de 003 cambia o su rama se fusiona tarde | Los dos eventos ya existentes se usan sin cambios; los de US4 se acuerdan antes de fusionar; versión en el sobre |
| Conflictos al fusionar 003 y 004 (mismos archivos compartidos: `schema.prisma`, `docker-compose.yml`, semilla, módulos raíz, `eventos/index.ts`) | Cambios solo aditivos; quien fusione segundo rebasa y resuelve; la semilla de 003 pasa a usar el `edicionId` de `prisma/seed/ids.ts` |
| El PR de integración rompe pruebas de 001/002 | Adaptador dev conservado para sus pruebas; E2E migrados en el mismo PR; revisión de los dueños |
| La proyección de métricas va por detrás de Boletería al reprogramar | Es advertencia, no control; Boletería resuelve excedentes con `AforoExcedido` |
| Usuarios con avisos de una reserva ya anulada (Boletería no publica esa anulación) | Aceptado en la spec (caso borde); mensaje del aviso neutro |
| Correo del comprador en pedidos de Boletería no se anonimiza | Documentado en RN-010; conservación por obligación legal (spec 002) |
| Restricciones `EXCLUDE` no modeladas por Prisma | Migración SQL escrita a mano y prueba de integración que verifica su existencia |

## Complexity Tracking

Sin violaciones de la constitución: no aplica.
