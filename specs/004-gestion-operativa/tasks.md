---
description: "Tareas de implementación de la spec 004: Operación e Identidad"
---

# Tasks: Gestión operativa, cuentas y notificaciones (004)

**Input**: documentos de diseño en `specs/004-gestion-operativa/`
**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Pruebas**: obligatorias (Constitución IV, "pruebas como aceptación"). Cada escenario `USn-ASm`
tiene una prueba nombrada; en dominio se escribe **primero** la prueba y se comprueba que falla.

**Organización**: una fase por historia, en el orden del plan (P1 de Operación → P1 de Identidad
→ integración → P2 → P3). Cada historia se puede probar sola con la semilla y `pnpm events:emit`.

## Formato: `[ID] [P?] [Story] Descripción`

- **[P]**: puede hacerse en paralelo (otro archivo, sin depender de tareas abiertas).
- **[Story]**: historia de la spec (US1…US12).
- Rutas relativas a la raíz del repositorio.

## Convenciones

- Módulos: `apps/api/src/modules/operacion/` (abreviado **`op/`**) y
  `apps/api/src/modules/identidad/` (abreviado **`id/`**), con capas
  `domain → application → infrastructure / interface`. Sin imports entre `modules/*`.
- Pruebas de integración en `apps/api/test/operacion/` y `apps/api/test/identidad/` (PostgreSQL
  real con Testcontainers); E2E en `apps/web/e2e/` con Playwright + axe.
- Commits `feat(operacion|identidad): …` que citan el `T0nn`; subramas
  `004-gestion-operativa-<tema>`, PR < 400 líneas sin contar pruebas ni documentos.
- Los campos y restricciones de cada tabla están en [data-model.md](data-model.md); las tareas
  citan `entidad.campo`.
- Hasta la fase 9, los E2E de Operación se autentican con las cabeceras de desarrollo de
  `IdentidadPublicaDevProvider` (como los de 001 y 002). T091 los migra al inicio de sesión real
  con las cuentas de T086.

---

## Phase 1: Setup (infraestructura compartida)

**Purpose**: dependencias, servicios de desarrollo y esqueleto de los dos módulos.

- [X] T001 Añadir `nodemailer` y `@types/nodemailer` a `apps/api/package.json` (única dependencia nueva, R23) y actualizar `pnpm-lock.yaml`
- [X] T002 [P] Añadir el servicio `mailpit` (SMTP 1025, web 8025) a `docker/docker-compose.yml` sin tocar los servicios existentes
- [X] T003 [P] Añadir `IDENTIDAD_CLAVE_CIFRADO`, `SMTP_URL` y `CORREO_REMITENTE` a `.env.example` con valores de desarrollo y comentario, según [quickstart.md](quickstart.md#requisitos)
- [X] T004 [P] Crear el esqueleto `op/{domain,application,infrastructure,interface}` y `op/operacion.module.ts` con `OperacionModule.registrar({ consumidores })`, como `ProgramacionModule`
- [X] T005 [P] Crear el esqueleto `id/{domain,application,infrastructure,interface}` y `id/identidad.module.ts` con `IdentidadModule.registrar({ consumidores })`
- [X] T006 Registrar ambos módulos en `apps/api/src/app.module.ts` (`consumidores: false`) y `apps/api/src/worker.module.ts` (`consumidores: true`); prueba `apps/api/test/modulos-004.int.test.ts` confirma que arrancan sin leer tablas de otros esquemas
- [X] T007 [P] Descargar la lista de contraseñas filtradas (SecLists top 100 000, filtrada a ≥ 10 caracteres, en minúsculas) en `id/infrastructure/datos/contrasenas-filtradas.txt` con su licencia y origen en `id/infrastructure/datos/LEEME.md` (R11)

---

## Phase 2: Foundational (bloquea todas las historias)

**Purpose**: esquemas, migraciones, contratos compartidos, guardas y semilla base.

**⚠️ CRITICAL**: ninguna historia empieza antes de terminar esta fase.

### Base de datos

- [X] T008 Añadir `"operacion", "identidad"` a `schemas` y `btree_gist` a `extensions` en `prisma/schema/schema.prisma` (cambio aditivo; 003 también edita esta línea)
- [X] T009 [P] Crear `prisma/schema/operacion.prisma` con todas las tablas de [data-model.md §operacion](data-model.md#esquema-operacion): `edicion`, `sede`, `elenco`, `obra`, `funcion`, `bloque_ocupacion`, `cambio_funcion`, `incidencia`, `conteo_estimado`, `pedido_registrado`, `metrica_funcion`, `ingreso_registrado`, `informe_cierre`, `cifras_historicas`, `auditoria`, `evento_procesado`; enums `edicion.estado`, `obra.estado`, `funcion.estado`, `cambio_funcion.tipo`, `incidencia.tipo`, `incidencia.origen`; índices de `funcion` y únicos `elenco.postulacion_id`, `obra.postulacion_id`, `incidencia.evento_origen_id`, `(sede.edicion_id, sede.nombre)`
- [X] T010 [P] Crear `prisma/schema/identidad.prisma` con todas las tablas de [data-model.md §identidad](data-model.md#esquema-identidad): `cuenta` (único `cuenta.correo`), `credencial`, `sesion` (único `sesion.hash_token`), `token_cuenta` (único `token_cuenta.hash_token`), `intento_acceso` (índice `(correo, ocurrido_en)`), `rol_asignado`, `documento_legal`, `consentimiento`, `notificacion` (único `notificacion.clave_dedup`), `funcion_aviso`, `destinatario_funcion`, `postulacion_en_curso`, `edicion_vigente`, `dominio_institucional`, `acreditacion`, `auditoria`, `evento_procesado`
- [X] T011 Generar la migración `prisma/schema/migrations/<fecha>_operacion_identidad/migration.sql` y añadir a mano: `CREATE EXTENSION IF NOT EXISTS btree_gist`, las dos restricciones `EXCLUDE` de `bloque_ocupacion.rango_sede` y `bloque_ocupacion.rango_elenco` con `WHERE (activo)` (ADR-0010), el único parcial de `rol_asignado` `(cuenta_id, rol, alcance_valor) WHERE revocado_en IS NULL`, los `CHECK` de `edicion.fecha_fin ≥ edicion.fecha_inicio`, `funcion.aforo_habilitado > 0`, `conteo_estimado.cantidad ≥ 0`, y los triggers que rechazan `UPDATE`/`DELETE` en `operacion.auditoria`, `identidad.auditoria`, `cambio_funcion` y `conteo_estimado`
- [X] T012 Prueba `apps/api/test/operacion/migracion.int.test.ts`: las restricciones `EXCLUDE`, el único parcial de roles y los triggers de solo inserción existen y rechazan lo indebido

### Contratos compartidos (PR propio, Constitución §6)

- [X] T013 [P] Prueba primero en `packages/contracts/src/eventos/identidad.test.ts` con ejemplos válidos e inválidos de `CuentaVerificada`, `RolAsignado` y `CuentaEliminada` ([eventos §2](contracts/eventos-operacion-identidad.md))
- [X] T014 [P] Crear `packages/contracts/src/eventos/identidad.ts` con los tres eventos y la unión `EventoPublicadoIdentidad`; exportación aditiva en `packages/contracts/src/eventos/index.ts`
- [X] T015 [P] Crear `packages/contracts/src/identidad/publica.ts` con `IDENTIDAD_PUBLICA`, `RolPersonal`, `AlcanceRol`, `ContextoIdentidad` e `IdentidadPublica` según [identidad-publica.md](contracts/identidad-publica.md) y exportarlo desde `packages/contracts/src/index.ts`
- [X] T016 [P] Crear `packages/contracts/src/eventos/convocatorias-pendientes.ts` con `PostulacionSeleccionada`, `SeleccionDesistida` y `ResultadoPublicado` según la propuesta de [eventos §5.2](contracts/eventos-operacion-identidad.md#52-pendientes-de-003-us4-propuesta-provisional), marcado `@provisional — dueño 003`, más pruebas; se mueve a `convocatorias.ts` cuando @Carlos2190 lo acepte — *Hecho, con `EventoConvocatoriasOperacion` para Operación.*
- [X] T017 Generar los tipos de API con `pnpm contracts:gen` en `packages/contracts/src/api/{operacion,identidad}.ts` desde `contracts/api-*.openapi.yaml`, validando antes ambos YAML con Redocly en la CI (`.github/workflows`) — *La CI ya valida todos los OpenAPI con Redocly (`ci.yml`, job `openapi`); se corrigieron 21 errores y quedan solo advertencias.*

### Comunes de los módulos

- [X] T018 [P] Definir puertos de Operación en `op/application/puertos.ts`: `RepositorioOperacion`, `PublicadorOperacion`, `RelojOperacion` (respeta `FIAVL_AHORA`), `AuditoriaOperacion`
- [X] T019 [P] Definir puertos de Identidad en `id/application/puertos.ts`: `RepositorioIdentidad`, `ProveedorCorreo`, `RelojIdentidad`, `Cifrador`, `PublicadorIdentidad`
- [X] T020 [P] Implementar `op/infrastructure/publicador.pgboss.ts` con `DESTINOS` por tipo (programacion, boleteria, identidad; `AforoCambiado` solo boleteria) dentro de `transaccionActual()`, como el de Boletería (R3)
- [X] T021 [P] Implementar `id/infrastructure/publicador.pgboss.ts` para `EventoPublicadoIdentidad`
- [X] T022 [P] Consumidor idempotente genérico en `op/infrastructure/consumidores.pgboss.ts` y `id/infrastructure/consumidores.pgboss.ts` que registra `evento_procesado.evento_id` en la misma transacción del efecto — *La suscripción común está en `apps/api/src/common/datos/consumir-eventos.ts`; la idempotencia, en `infrastructure/persistencia.prisma.ts` de cada módulo.*
- [X] T023 Prueba primero en `id/domain/roles.test.ts` y luego `id/domain/roles.ts`: 11 roles, alcance obligatorio por rol (`rol_asignado.alcance_tipo`) y `tieneAlcance(contexto, rol, alcance)` (R16, RN-009)
- [X] T024 Guard `@Requiere(rol, { alcance })` y decorador de contexto en `op/interface/requiere.guard.ts` e `id/interface/requiere.guard.ts`, que leen `IDENTIDAD_PUBLICA`; mientras Identidad no exista, un `IdentidadPublicaDevProvider` en `apps/api/src/common/identidad/identidad-publica.dev.ts` (solo development/test, falla cerrado) lee cabeceras `x-*-dev` — *Hecho en `apps/api/src/common/identidad/` (un solo guard para ambos módulos: `@Requiere`, `@Publico`, `@PermiteSinSegundoFactor`, `exigirAlcance`); cabeceras dev `x-cuenta-dev` y `x-roles-dev` (`rol@tipo:valor`, separados por coma).*
- [X] T025 [P] Filtro de errores en `op/interface/problema.filter.ts` e `id/interface/problema.filter.ts` que responde `Problema` con `codigo` del enum de los OpenAPI — *Hecho como un filtro común `apps/api/src/common/http/problema-codigo.filter.ts` (`ErrorConCodigo`), sin tocar el filtro global de 001 y 002.*
- [X] T026 [P] Auditoría de solo inserción en `op/infrastructure/auditoria.prisma.ts` e `id/infrastructure/auditoria.prisma.ts` con `auditoria.correlacion_id` (FR-012, FR-024)
- [X] T027 Semilla base `prisma/seed/operacion.ts`: edición 2026 en el esquema `operacion` con los ids de `prisma/seed/ids.ts`, sedes, elencos, obras y funciones; publica sus eventos por el mismo camino que la aplicación; `cifras_historicas` 2025 (313 / 116 / 125 / 163 162). Sustituye a `eventosEdicion2026()` en `prisma/seed/index.ts` sin cambiar los ids que usan 001 y 002 — *Aditiva: `prisma/seed/operacion.ts` se deriva de `eventosEdicion2026()` y no reemplaza la semilla de 001 y 002. `cifras_historicas` guarda el total de 2025 (el desglose no se publicó).*
- [X] T028 [P] Ampliar `scripts/emitir-evento.ts` con `postulacion-seleccionada`, `seleccion-desistida`, `resultado-publicado`, `postulacion-enviada`, `subsanacion-solicitada` y `aforo-excedido` — *En un script propio, `scripts/emitir-evento-004.ts` (`pnpm events:emit:004 <tipo>`), para no cambiar el de 001 y 002.*

**Checkpoint**: módulos arrancan, migración aplicada, contratos publicados, semilla carga la edición 2026.

---

## Phase 3: User Story 1 - Programar funciones en la grilla (Priority: P1) 🎯 MVP

**Goal**: crear funciones en una grilla por día y sede sin cruces de sede ni de elenco.

**Independent Test**: crear una función, intentar otra que se cruce (409) y ver la válida en la grilla.

### Tests (escribir primero, deben fallar)

- [X] T029 [P] [US1] Prueba de dominio `op/domain/agenda.test.ts`: `US1-AS1` (fin 21:30), `US1-AS2` (21:15 choca con montaje 30, 21:30 no), `US1-AS4` (elenco en dos sedes), actividad continua = un bloque por día, día del festival en `America/Guayaquil`, función que cruza medianoche cuenta para su día de inicio, feriado del 20/11 informativo sin bloquear (RN-001, RN-002)
- [X] T030 [P] [US1] Prueba de integración `apps/api/test/operacion/grilla.int.test.ts`: `US1-AS1`–`US1-AS4` por HTTP, 409 `cruce_sede` / `cruce_elenco` con la función en conflicto, 409 `aforo_supera_sede`, 412 por `If-Match` desactualizado (FR-013); comprueba que se generó el registro de `auditoria` con su `correlacion_id` (Constitución IX)
- [X] T031 [P] [US1] Prueba de concurrencia `apps/api/test/operacion/cruces-concurrentes.int.test.ts`: dos programadores crean a la vez funciones que chocan ⇒ exactamente una (SC-001, ADR-0010)
- [X] T032 [P] [US1] Prueba de integración `apps/api/test/operacion/obras-convocatoria.int.test.ts`: `US1-AS5`, `PostulacionSeleccionada` crea `elenco` y `obra` con `obra.ficha_tecnica` una sola vez aunque llegue dos veces

### Implementation

- [X] T033 [US1] Implementar `op/domain/agenda.ts`: `calcularFin` (RN-002, `funcion.fin` solo se alarga), `bloquesDe(funcion, sede)` con `bloque_ocupacion.rango_sede` = `[inicio, fin + sede.montaje_min)` y `bloque_ocupacion.rango_elenco` = `[inicio, fin)`, y `detectarConflictos`; hace pasar T029
- [X] T034 [P] [US1] Tipos de dominio en `op/domain/tipos.ts` (Funcion, Sede, Obra, Conflicto) reutilizando los enums de `@fiavl/contracts`
- [X] T035 [US1] `op/infrastructure/prisma-operacion.repository.ts`: guardar función y reescribir sus `bloque_ocupacion` en la misma transacción; traducir el error `23P01` a `ConflictoAgenda` y la versión desactualizada a 412 (`funcion.version`, R2)
- [X] T036 [US1] Casos de uso en `op/application/funciones/`: `crear-funcion.ts`, `editar-funcion.ts`, `eliminar-borrador.ts`, `grilla-del-dia.ts`; validan `funcion.aforo_habilitado ≤ sede.aforo` (FR-004) y `obra.estado = disponible`; cada acción escribe `auditoria` (`auditoria.actor_id`, `auditoria.accion`, `auditoria.anterior`, `auditoria.nuevo`, `auditoria.correlacion_id`) en la misma transacción (FR-012) — *Hecho en `funciones/funciones.servicio.ts` (crear, editar, eliminar borrador) y `funciones/grilla-del-dia.ts`. Editar una función ya publicada responde 409 `funcion_publicada` hasta US2/US3.*
- [X] T037 [US1] Controlador `op/interface/funciones.controller.ts` con `GET /grilla?fecha`, `POST/PATCH/DELETE /funciones` (`If-Match`), esquemas zod y `@Requiere('programador')` según [api-operacion](contracts/api-operacion.openapi.yaml); hace pasar T030 y T031
- [X] T038 [US1] Consumidor `op/application/eventos/postulacion-seleccionada.ts` que crea `elenco` (`elenco.origen = convocatoria`, `elenco.postulacion_id`) y `obra` con su ficha técnica (R6), validando `obra.duracion_min` > 0 y `obra.edad_minima` ≥ 0; `montajeMin`/`desmontajeMin` se guardan en `obra.ficha_tecnica` solo como información; hace pasar T032
- [X] T039 [P] [US1] `GET /obras` y `GET /sedes` de solo lectura en `op/interface/obras.controller.ts` y `op/interface/sedes.controller.ts` (búsqueda por título, disciplina y componente)
- [X] T039a [US1] Alta y edición de obras y elencos invitados en `op/application/obras/` y `POST/PATCH /obras` (`@Requiere('programador')`), validando `obra.duracion_min`, `obra.edad_minima` y `obra.estado`; al cambiar `obra.duracion_min` no mueve funciones existentes, recalcula sus conflictos y devuelve la lista de funciones afectadas (caso borde de la spec); cada acción escribe `auditoria` (`auditoria.actor_id`, `auditoria.accion`, `auditoria.anterior`, `auditoria.nuevo`, `auditoria.correlacion_id`) en la misma transacción (FR-012)
- [X] T040 [P] [US1] Cliente HTTP tipado `apps/web/src/lib/operacion/api.ts` — *Más `lib/operacion/formato.ts` (funciones puras con pruebas) y una sesión de demostración propia (`x-roles-dev`) hasta US8.*
- [X] T041 [US1] Página `apps/web/src/app/(panel)/programacion/page.tsx` con la grilla accesible de `apps/web/src/components/operacion/grilla.tsx` (tabla con encabezados de sede y hora, navegable con teclado, conflicto anunciado por texto y no solo por color, [rutas-web](contracts/rutas-web.md)) y el formulario `formulario-funcion.tsx` — *Navegación propia en `(panel)/programacion/layout.tsx`, sin tocar el layout del panel de Boletería. Usa `GET /ediciones` (lectura), adelantado de US6.*
- [X] T042 [P] [US1] Página `apps/web/src/app/(panel)/programacion/obras/page.tsx` con buscador de obras y ficha técnica
- [X] T043 [US1] E2E `apps/web/e2e/operacion-grilla.spec.ts`: crear, ver el conflicto y corregir, con axe sin violaciones A/AA — *Pasa en móvil y escritorio. La API toma un bloqueo consultivo por sede y elenco al guardar para evitar interbloqueos de `EXCLUDE` bajo concurrencia (ADR-0010 actualizado).*

**Checkpoint**: US1 funciona sola (escenarios 1–5 y 12 del quickstart).

---

## Phase 4: User Story 2 - Publicar la programación (Priority: P1)

**Goal**: validar la edición y publicarla, o publicar una función suelta, emitiendo los eventos existentes.

**Independent Test**: publicar 3 funciones válidas y ver `ProgramacionPublicada` y las funciones en `/cartelera`.

### Tests

- [X] T044 [P] [US2] Prueba de dominio `op/domain/publicacion.test.ts`: `US2-AS2`, errores por función sin sede, sin `funcion.tipo_acceso`, obra sin `obra.imagenes` o con cruces (R4)
- [X] T045 [P] [US2] Prueba de integración `apps/api/test/operacion/publicacion.int.test.ts`: `US2-AS1` (estado `programada`, `ProgramacionPublicada` y un `FuncionProgramada` por función, que pasan `EventoCartelera` y `EventoOperacionBoleteria`), `US2-AS3` (publicar una función sola sin republicar la edición); comprueba que se generó el registro de `auditoria` con su `correlacion_id` (Constitución IX)

### Implementation

- [X] T046 [US2] Implementar `op/domain/publicacion.ts` (`validarPublicacion`) (valida `funcion.tipo_acceso`, `obra.imagenes` ≥ 1 y sede asignada) y `op/domain/ciclo-funcion.ts` (transición `borrador → programada`, `funcion.version` +1, `funcion.publicada_en`); hace pasar T044 — *`funcion.tipo_acceso` pasa a ser opcional en borradores (migración `20261121020000_ajustes_publicacion`) para que US2-AS2 sea posible; también corrige el valor por defecto de `obra.ficha_artistica` (lista).*
- [X] T047 [US2] Casos de uso `op/application/publicacion/{validar,publicar-edicion,publicar-funcion}.ts` que cambian estado y publican eventos en la misma transacción; `edicion.estado = publicada`; cada acción escribe `auditoria` (`auditoria.actor_id`, `auditoria.accion`, `auditoria.anterior`, `auditoria.nuevo`, `auditoria.correlacion_id`) en la misma transacción (FR-012) — *Hecho en `publicacion/publicacion.servicio.ts` y `eventos-salida.ts` (eventos con los contratos existentes). La publicación toma un bloqueo consultivo por edición.*
- [X] T048 [US2] Controlador `op/interface/publicacion.controller.ts`: `GET /ediciones/{id}/publicacion/validacion`, `POST /ediciones/{id}/publicacion`, `POST /funciones/{id}/publicacion`; hace pasar T045
- [X] T049 [US2] Página `apps/web/src/app/(panel)/programacion/publicar/page.tsx`: lista de errores enlazada a cada función (resumen enfocable) y botón "Publicar" bloqueado mientras haya errores — *Los errores enlazan a `/programacion?funcion=<id>`, que abre ese día con la función elegida. La grilla ofrece "Publicar esta función" con la edición ya publicada (US2-AS3).*
- [X] T050 [US2] E2E `apps/web/e2e/operacion-publicacion.spec.ts`: corregir errores, publicar y ver la función en `/cartelera` en < 1 min (SC-003), con axe — *Pasa en móvil y escritorio con API, worker y web reales; la ficha pública muestra la función en menos de 1 minuto.*

**Checkpoint**: US1 + US2 sustituyen a la semilla simulada de cartelera (escenarios 6–7).

---

## Phase 5: User Story 3 - Reprogramar o cancelar funciones (Priority: P1)

**Goal**: cambiar horario, sede o cancelar con motivo, con historial y propagación a 001, 002 e Identidad.

**Independent Test**: cancelar una función con entradas y comprobar que Boletería recibe `FuncionCancelada`.

### Tests

- [X] T051 [P] [US3] Prueba de dominio `op/domain/ciclo-funcion.test.ts`: `US3-AS4` (sin motivo ⇒ rechazo), `US3-AS5` (finalizada derivada: `fin < ahora`), RN-005, RN-007 (edición `cerrada` ⇒ sin transiciones)
- [X] T052 [P] [US3] Prueba de integración `apps/api/test/operacion/cambios.int.test.ts`: `US3-AS1` (estado `reprogramada`, `cambio_funcion.anterior` con el horario previo, `FuncionReprogramada`), `US3-AS3` (`FuncionCancelada`, bloques desactivados), `US3-AS2` (409 con `exceso` y luego `confirmarExceso` guarda `cambio_funcion.exceso_confirmado`); comprueba que se generó el registro de `auditoria` con su `correlacion_id` (Constitución IX)
- [X] T053 [P] [US3] Prueba de integración `apps/api/test/operacion/proyeccion-boleteria.int.test.ts`: `EntradasEmitidas` y `PedidoReembolsado` mantienen `pedido_registrado` y `metrica_funcion.entradas_emitidas` / `metrica_funcion.entradas_reembolsadas` de forma idempotente (R5, R7)

### Implementation

- [X] T054 [US3] Ampliar `op/domain/ciclo-funcion.ts` con `reprogramar` y `cancelar`; `cambio_funcion.motivo` obligatorio; hace pasar T051
- [X] T055 [US3] Consumidores `op/application/eventos/{entradas-emitidas,pedido-reembolsado,ingreso-registrado}.ts` para `pedido_registrado`, `metrica_funcion` e `ingreso_registrado` (sin contar dos veces `ingreso_registrado.ingreso_id`); hace pasar T053 — *En `eventos/proyeccion-boleteria.ts`. Un reembolso de un pedido que nunca emitió entradas (pago tardío sin cupo) no resta nada.*
- [X] T056 [US3] Casos de uso `op/application/cambios/{reprogramar,cancelar}.ts`: reescriben o desactivan `bloque_ocupacion.activo`, insertan `cambio_funcion` y publican `FuncionReprogramada` / `FuncionCancelada` / `AforoCambiado` en la misma transacción; exceso = entradas activas − aforo nuevo; cada acción escribe `auditoria` (`auditoria.actor_id`, `auditoria.accion`, `auditoria.anterior`, `auditoria.nuevo`, `auditoria.correlacion_id`) en la misma transacción (FR-012) — *Hecho en `cambios/cambios.servicio.ts`. Con cambio de aforo, `FuncionReprogramada` (n+1) y `AforoCambiado` (n+2) diferido 15 s (research R3.6). También se completa la edición de funciones publicadas (`FuncionActualizada`/`AforoCambiado`) en `funciones.servicio.ts`, y el guardado sin cruces queda en `funciones/agenda-segura.ts`.*
- [X] T057 [US3] Controlador `op/interface/cambios.controller.ts`: `POST /funciones/{id}/reprogramacion`, `POST /funciones/{id}/cancelacion`, `GET /funciones/{id}/cambios`; hace pasar T052
- [X] T058 [US3] Página `apps/web/src/app/(panel)/programacion/funciones/[id]/page.tsx` con historial, formularios de reprogramar y cancelar (motivo obligatorio) y diálogo accesible de confirmación de exceso
- [X] T059 [US3] E2E `apps/web/e2e/operacion-cambios.spec.ts`: reprogramar por lluvia, cancelar y ver el cambio en la cartelera, con axe — *Pasa en móvil y escritorio. La llegada a la cartelera necesita cola y worker: con `NODE_ENV=test` (job de CI) ese paso se omite con una anotación y lo cubre la integración.*

**Checkpoint**: Operación P1 completa (escenarios 1–13 menos los de P2).

---

## Phase 6: User Story 7 - Registro y verificación de correo (Priority: P1)

**Goal**: crear cuenta con política aceptada y verificarla por enlace.

**Independent Test**: registrar, abrir el enlace de Mailpit y ver la cuenta `verificada`.

### Tests

- [X] T060 [P] [US7] Prueba de dominio `id/domain/contrasenas.test.ts`: scrypt N=2^15 r=8 p=3 con formato `credencial.hash_contrasena`, verificación en tiempo constante, `US7-AS4` (< 10 caracteres, contraseña de la lista sin importar mayúsculas) (R10, R11, RN-008)
- [X] T061 [P] [US7] Prueba de dominio `id/domain/tokens.test.ts`: token de 256 bits, guarda solo SHA-256 en `token_cuenta.hash_token`, caducidad de `token_cuenta.expira_en`, un solo uso con `token_cuenta.usado_en`
- [X] T062 [P] [US7] Prueba de integración `apps/api/test/identidad/registro.int.test.ts`: `US7-AS1` (`cuenta.estado = pendiente_verificacion`, correo en el adaptador de memoria), `US7-AS2` (verificada, `CuentaVerificada` publicado), `US7-AS3` (misma respuesta y aviso al dueño; `cuenta.correo` normalizado), `US7-AS5` (sin política ⇒ no se crea), límite de 3 reenvíos por hora

### Implementation

- [X] T063 [P] [US7] Implementar `id/domain/contrasenas.ts` con la lista cargada una vez en memoria desde `contrasenas-filtradas.txt`; escribe `credencial.hash_contrasena` con el formato `scrypt$N$r$p$sal$hash`; hace pasar T060 — *La carga del archivo está en `infrastructure/lista-filtradas.ts`; el dominio recibe la función de consulta.*
- [X] T064 [P] [US7] Implementar `id/domain/tokens.ts`: fija `token_cuenta.expira_en` (24 h verificación, 1 h recuperación) y marca `token_cuenta.usado_en`; hace pasar T061
- [X] T065 [P] [US7] Adaptadores de correo `id/infrastructure/correo-smtp.adapter.ts` (nodemailer con `SMTP_URL`) e `id/infrastructure/correo-memoria.adapter.ts` (pruebas), elegidos por entorno — *En `infrastructure/correo.adapters.ts`: SMTP si hay `SMTP_URL` fuera de pruebas; si no, memoria.*
- [X] T066 [P] [US7] Plantillas `id/domain/plantillas/{verificacion,cuenta-existente}.ts` en texto y HTML accesible, con prueba de que no incluyen tokens en logs — *En `domain/plantillas/plantillas.ts`.*
- [X] T067 [US7] `id/infrastructure/prisma-identidad.repository.ts` (cuentas, credenciales, tokens, consentimientos) y casos de uso `id/application/registro/{registrar,verificar,reenviar}.ts`; el aceptar la política crea `consentimiento` con `documento_legal.version` vigente — *Hecho en `registro/registro.servicio.ts`. shortcut hasta US10: el correo se envía después de confirmar, sin bloquear (RNF-007). Añade `GET /politica`, la página `/privacidad` y la política v1 en `prisma/seed/identidad.ts`. Se adelanta de US10 el consumidor de `ProgramacionPublicada` (`edicion_vigente`), que da el `edicionId` de `CuentaVerificada`.*
- [X] T068 [US7] Controlador `id/interface/registro.controller.ts`: `POST /registro`, `POST /verificacion`, `POST /verificacion/reenvio` según [api-identidad](contracts/api-identidad.openapi.yaml); hace pasar T062
- [X] T069 [US7] Páginas `apps/web/src/app/(publico)/cuenta/registro/page.tsx` y `cuenta/verificar/page.tsx` con requisitos de contraseña visibles, casilla de política enlazada y errores anunciados; cliente `apps/web/src/lib/identidad/api.ts`
- [X] T069a [US7] E2E `apps/web/e2e/identidad-registro.spec.ts`: `US7-AS1`, `US7-AS2` (enlace leído desde la API de Mailpit), `US7-AS4` y `US7-AS5`; registro y verificación en < 2 min (SC-006), con axe sin violaciones A/AA — *Lee el enlace de la API de Mailpit; sin Mailpit (CI) ese paso se omite con una anotación.*

**Checkpoint**: registro y verificación (escenarios 20–22).

---

## Phase 7: User Story 8 - Inicio de sesión y recuperación (Priority: P1)

**Goal**: sesiones opacas en cookie, bloqueo por intentos, recuperación y "Mis sesiones".

**Independent Test**: iniciar sesión, cerrarla, recuperar contraseña y entrar con la nueva.

### Tests

- [X] T070 [P] [US8] Prueba de dominio `id/domain/sesiones.test.ts`: expiración deslizante 30 d / 8 h según `cuenta.es_personal` (`US8-AS1`), `sesion.ultima_actividad_en` escrito como máximo una vez por minuto
- [X] T071 [P] [US8] Prueba de dominio `id/domain/bloqueo.test.ts`: `US8-AS2`, 5 fallos en 15 min ⇒ `cuenta.bloqueada_hasta` = +15 min
- [X] T072 [P] [US8] Prueba de integración `apps/api/test/identidad/sesion.int.test.ts`: `US8-AS1`–`US8-AS4`, cookie `fiavl_sesion` `HttpOnly` y `SameSite=Lax`, rechazo de `Origin` ajeno en métodos que escriben (CSRF), enlace de recuperación usado dos veces, cambio de contraseña revoca las demás sesiones (`sesion.revocada_en`), FR-016: correo inexistente y contraseña errónea dan la misma respuesta

### Implementation

- [X] T073 [P] [US8] Implementar `id/domain/sesiones.ts` (calcula `sesion.expira_en`) y `id/domain/bloqueo.ts` (calcula `cuenta.bloqueada_hasta`); hacen pasar T070 y T071
- [X] T074 [US8] Casos de uso `id/application/sesion/{iniciar,cerrar,recuperar,confirmar-recuperacion,cambiar-contrasena,listar-sesiones,revocar-sesion}.ts`; `intento_acceso` registra cada intento; aviso de bloqueo al titular — *Hecho en `sesion/sesion.servicio.ts` y `mi-cuenta/mi-cuenta.servicio.ts`. Correo inexistente, contraseña errónea, cuenta bloqueada o inactiva dan el mismo 401 y siempre se calcula scrypt. Recuperar con el enlace también verifica una cuenta pendiente (demuestra control del correo).*
- [X] T075 [US8] Implementar `id/infrastructure/identidad-publica.provider.ts` (`resolverSesion`: busca `sesion.hash_token`, lee en ese momento `cuenta.estado` y `rol_asignado` vigentes, falla cerrado) y registrarlo como proveedor global con `IDENTIDAD_PUBLICA`, reemplazando a `IdentidadPublicaDevProvider` fuera de pruebas (ADR-0009) — *En development/test, sin cookie válida, cae a las cabeceras `x-*-dev` (panel de Operación y pruebas hasta US9); en producción solo la cookie. El segundo factor llega con US9: hasta entonces la sesión del personal queda restringida.*
- [X] T076 [US8] Controladores `id/interface/sesion.controller.ts` (`POST/DELETE /sesion`, `POST /recuperacion`, `POST /recuperacion/confirmacion`) y `id/interface/mi-cuenta.controller.ts` (`GET/PATCH /yo`, `POST /yo/contrasena`, `GET /yo/sesiones`, `DELETE /yo/sesiones/{id}`), con el middleware `id/interface/origen.guard.ts`; hace pasar T072 — *La guarda de `Origin` está en `common/identidad/origen.guard.ts` y se aplica a todos los controladores de Identidad. `PUT /yo/contrasena` según el contrato.*
- [X] T077 [US8] Páginas `apps/web/src/app/(publico)/cuenta/{ingresar,recuperar}/page.tsx` y `(publico)/mi-cuenta/{page,sesiones/page}.tsx` — *Más `/cuenta/recuperar/nueva`. El enlace "Ingresar" en el encabezado público (de 001) queda para la integración (fase 9).*
- [X] T078 [US8] E2E `apps/web/e2e/identidad-sesion.spec.ts`: entrar, recuperar contraseña con el enlace de Mailpit y cerrar otra sesión, con axe — *Corrigió una violación de axe real (label-content-name-mismatch) en "Cerrar esta sesión".*

**Checkpoint**: escenarios 23–25.

---

## Phase 8: User Story 9 - Cuentas del personal con roles y alcance (Priority: P1)

**Goal**: el administrador gestiona cuentas del personal; el personal usa segundo factor; los roles se aplican de inmediato.

**Independent Test**: crear un validador del Teatro Bolívar y comprobar que solo valida en esa sede.

### Tests

- [X] T079 [P] [US9] Prueba de dominio `id/domain/totp.test.ts` con los vectores oficiales de RFC 6238 (SHA-1, 30 s, 6 dígitos), ventana ±1 y rechazo del mismo paso dos veces (`credencial.totp_ultimo_paso`)
- [X] T080 [P] [US9] Prueba de integración `apps/api/test/identidad/personal.int.test.ts`: `US9-AS3` (sesión con `sesion.segundo_factor_ok = false` solo puede dar de alta o verificar TOTP), `US9-AS4` (cambio de rol auditado, `RolAsignado` publicado y aplicado en la siguiente petición), `US9-AS5` (desactivar revoca sesiones y conserva historial), alcance obligatorio por rol; auditoría de inicios de sesión del personal, cambios de rol, restablecimientos de segundo factor y desactivaciones (FR-024)
- [X] T081 [P] [US9] Matriz de autorización parametrizada `apps/api/test/operacion/autorizacion.int.test.ts` (rol × operación de Operación e Identidad ⇒ 200/403, incluidos `US9-AS1` y `US9-AS2` del lado de Operación) (SC-007)

### Implementation

- [X] T082 [P] [US9] Implementar `id/domain/totp.ts` con `node:crypto` y `id/infrastructure/cifrador-aes-gcm.ts` para `credencial.totp_secreto_cifrado` con `IDENTIDAD_CLAVE_CIFRADO`; hace pasar T079
- [X] T083 [US9] Casos de uso `id/application/segundo-factor/{alta,verificar,restablecer}.ts` y `id/application/personal/{crear,listar,asignar-rol,revocar-rol,cambiar-estado}.ts`; `cuenta.es_personal` derivado de los roles; auditoría de cada acción (FR-024) — hecho como `segundo-factor/segundo-factor.servicio.ts` y `personal/personal.servicio.ts` (un servicio por área, como US7/US8). Si un correo ya tiene cuenta, se le suman los roles; al pasar a ser personal se cierran sus sesiones del público; el administrador no puede desactivarse ni quitarse su rol; 5 códigos fallidos cierran la sesión y bloquean 15 min. Los pasos TOTP usan siempre la hora real (`RELOJ_TOTP`), aunque `FIAVL_AHORA` fije el reloj de la demo
- [X] T084 [US9] Controladores `id/interface/segundo-factor.controller.ts` y `id/interface/personal.controller.ts` (`/personal`, `/personal/{id}/roles`, `/personal/{id}/estado`, `/personal/{id}/segundo-factor`) con `@Requiere('administrador')`; hace pasar T080 y T081
- [X] T085 [US9] Páginas `apps/web/src/app/(publico)/cuenta/segundo-factor/page.tsx` (QR y clave en texto para lectores de pantalla) y `apps/web/src/app/(panel)/admin/personal/page.tsx`
- [X] T086 [US9] Semilla `prisma/seed/identidad.ts` con las cuentas de prueba del [quickstart](quickstart.md#preparación) (contraseña y secreto TOTP conocidos, solo desarrollo) y `documento_legal` de la política v1
- [X] T087 [US9] E2E `apps/web/e2e/identidad-personal.spec.ts`: crear un validador, primer ingreso con TOTP, 403 fuera de su sede, con axe — el 403 "fuera de su sede" de Boletería llega con la fase 9 (Boletería usará IdentidadPublica); aquí se comprueba el 403 fuera de su rol (US9-AS2) y la matriz T081 cubre el alcance (US9-AS1). Sin Mailpit (CI) se usa el validador de la semilla

**Checkpoint**: Identidad P1 completa (escenarios 26–28).

---

## Phase 9: Integración con 001, 002 y 003 (PR propio)

**Purpose**: los módulos existentes usan `IdentidadPublica` en vez de sus adaptadores de desarrollo. CI en verde; revisión pedida a @By-Alvarez06, @Kevrc y @Carlos2190 (Q4) y `/security-review` (Q8).

- [X] T088 Adaptador `apps/api/src/modules/boleteria/infrastructure/autorizacion-identidad.adapter.ts` que implementa `AutorizacionBoleteriaPort` desde `ContextoIdentidad` (roles, sede, `correoVerificado`, `estudianteAcreditado`); elegido fuera de development/test sin cambiar el puerto ni la spec 002 — con la cookie `fiavl_sesion` manda Identidad (vencida o revocada ⇒ 401, sin puente); sin ella, en development/test sigue el puente `AutorizacionDevAdapter`. Toda cuenta es `asistente`; una sesión del personal sin segundo factor no autoriza
- [X] T089 `apps/api/src/modules/programacion/interface/sesion.guard.ts` pasa a usar `IDENTIDAD_PUBLICA` (Mi agenda) — mismo criterio: con cookie, Identidad; sin cookie, la cabecera `x-cuenta-dev` solo en development
- [X] T090 Cuando 003 esté en `main`: adaptador de Convocatorias que traduce `ContextoIdentidad` a su `ContextoConvocatorias` con la tabla fija de códigos de rol y alcance de [eventos §5.3](contracts/eventos-operacion-identidad.md#53-otros-puntos-de-encaje-con-la-rama-003), y su semilla pasa a usar el `edicionId` de `prisma/seed/ids.ts` — 003 ya está en `main`. Toda cuenta es además `asistente` y `postulante`; los roles del personal van primero
- [X] T091 Sustituir `panel-sesion-dev.tsx` y la cookie `sesion_dev` por el inicio de sesión real en `apps/web`; los E2E de 001 y 002 inician sesión con las cuentas sembradas (`apps/web/e2e/ayuda.ts`) — no se borra el puente: el panel muestra la sesión real si existe y si no ofrece «Ingresar con tu cuenta» y, salvo `NEXT_PUBLIC_SESION_DEV=false`, la sesión de demostración. Los E2E de 001 y 002 siguen con el puente (CI corre la web en modo producción y los usa); la sesión real en Boletería la cubre `e2e/integracion-identidad.spec.ts`. Se añadió «Mi cuenta» a la cabecera y la fusión de Mi agenda al ingresar. IdentidadPublica ya no cae al puente si llega una cookie inválida
- [X] T092 Prueba `apps/api/test/integracion-identidad.int.test.ts`: con sesión real, `US9-AS1` (taquilla del Bolívar no vende para otra sede) y validador fuera de sede ⇒ 403 en Boletería; sin sesión ⇒ 401; cuenta desactivada ⇒ 401 inmediato

**Checkpoint**: todo el sistema funciona con inicio de sesión real.

---

## Phase 10: User Story 10 - Notificaciones (Priority: P2)

**Goal**: Identidad envía los avisos de todos los módulos con deduplicación y reintentos.

**Independent Test**: `EntradasEmitidas` de 3 compradores + `FuncionCancelada` ⇒ 3 correos `enviada`.

### Tests

- [X] T093 [P] [US10] Prueba de dominio `id/domain/notificaciones.test.ts`: `notificacion.clave_dedup` = `tipoEvento:eventoId:destinatario` (RN-011), `notificacion.categoria`, `US10-AS4` (opcional desactivada ⇒ `omitida`; servicio siempre), plazo de 24 h ⇒ `fallida`
- [X] T094 [P] [US10] Prueba de integración `apps/api/test/identidad/notificaciones.int.test.ts`: independent test de US10, `US10-AS1` (< 1 min), `US10-AS2` (proveedor falla y luego responde; tras 24 h `fallida`), `US10-AS3` (evento repetido ⇒ un correo), `tokenQr` borrado de `notificacion.datos` al enviar
- [X] T095 [P] [US10] Prueba de integración `apps/api/test/identidad/avisos-convocatorias.int.test.ts`: `PostulacionEnviada` y `SubsanacionSolicitada` con la forma de la rama 003 (`cuentaPostulanteId`, `numero`, `detalle`, `venceEn`) generan acuse y aviso de subsanación; reenvío tras subsanar ⇒ segundo acuse y `postulacion_en_curso` actualizada (upsert)

### Implementation

- [X] T096 [US10] Implementar `id/domain/notificaciones.ts` y plantillas `id/domain/plantillas/{entradas-emitidas,devolucion,funcion-reprogramada,funcion-cancelada,acuse-postulacion,subsanacion,resultado,bloqueo}.ts`; hace pasar T093 — plantillas de avisos en un solo archivo `plantillas/avisos.ts` (la de bloqueo ya existía en `plantillas.ts`)
- [X] T097 [US10] Caso de uso `id/application/notificaciones/crear.ts` (fila `notificacion` + trabajo `identidad.enviar-notificacion` en la misma transacción) y `enviar.ts` (reintento con espera creciente, `notificacion.intentos`, `notificacion.ultimo_error`) (ADR-0011) — hecho como `notificaciones/notificaciones.servicio.ts` (`crear` y `enviar`). Los correos de cuenta (verificación, recuperación, bloqueo, invitación) siguen enviándose directo porque llevan el token de un solo uso: no se guardan en `notificacion.datos`
- [X] T098 [US10] Consumidores `id/application/eventos/` de `EntradasEmitidas` y `PedidoReembolsado` (`destinatario_funcion.activo`), `FuncionProgramada`/`FuncionActualizada`/`FuncionReprogramada`/`FuncionCancelada` (`funcion_aviso`, avisos a destinatarios activos) y `ProgramacionPublicada` (`edicion_vigente.fecha_fin`); hacen pasar T094
- [X] T099 [US10] Consumidores `id/application/eventos/{postulacion-enviada,subsanacion-solicitada,resultado-publicado}.ts` que leen el contrato de `@fiavl/contracts` (el de 003 cuando esté en `main`; hasta entonces el esquema de prueba con su misma forma) y mantienen `postulacion_en_curso.estado`; hacen pasar T095
- [X] T100 [US10] `GET /yo/notificaciones` y `GET /notificaciones/fallidas` (administrador) en `id/interface/notificaciones.controller.ts`; páginas `apps/web/src/app/(publico)/mi-cuenta/notificaciones/page.tsx` y `(panel)/admin/notificaciones/page.tsx` (`US10-AS5`)
- [X] T101 [US10] Métricas en ambos módulos: notificaciones enviadas/fallidas, inicios de sesión fallidos y bloqueos (Identidad); funciones publicadas, reprogramadas y canceladas (Operación); logs con `correlacionId` propagado desde el evento (Constitución IX); prueba en `apps/api/test/identidad/observabilidad.int.test.ts` — `correlacionId` del evento viaja en el trabajo de envío y en los logs de cada intento

**Checkpoint**: escenarios 10, 29 y 30.

---

## Phase 11: User Story 4 - Incidencias y asistencia en espacios públicos (Priority: P2)

**Goal**: el jefe de sala registra incidencias y conteos; las alertas de Boletería crean incidencias.

**Independent Test**: conteo de 1 200 personas en plaza suma a la asistencia estimada del día.

### Tests

- [ ] T102 [P] [US4] Prueba de integración `apps/api/test/operacion/incidencias.int.test.ts`: `US4-AS1` (`conteo_estimado.cantidad`, vigente el último), `US4-AS2` (`incidencia.afecta_publico` ofrece reprogramar), `US4-AS3` (`AforoExcedido` y `ConflictoDeIngreso` ⇒ `incidencia.origen = automatica` una sola vez por `incidencia.evento_origen_id`), `SeleccionDesistida` ⇒ `obra.estado = desistida` + incidencia `desistimiento` con funciones intactas (FR-007), 403 fuera de su sede (RN-009); comprueba que se generó el registro de `auditoria` con su `correlacion_id` (Constitución IX)

### Implementation

- [ ] T103 [US4] Casos de uso `op/application/incidencias/{registrar-incidencia,registrar-conteo,atender}.ts`; conteo solo en funciones de acceso libre o espacio público; cada acción escribe `auditoria` (`auditoria.actor_id`, `auditoria.accion`, `auditoria.anterior`, `auditoria.nuevo`, `auditoria.correlacion_id`) en la misma transacción (FR-012)
- [ ] T104 [US4] Consumidores `op/application/eventos/{aforo-excedido,conflicto-de-ingreso,seleccion-desistida}.ts`
- [ ] T105 [US4] Controlador `op/interface/incidencias.controller.ts` (`/incidencias`, `/funciones/{id}/conteos`) con `@Requiere('jefe_sala', { alcance: 'sede' })`; hace pasar T102
- [ ] T106 [US4] Página `apps/web/src/app/(panel)/sala/incidencias/page.tsx` (formulario móvil primero, conteo con teclado numérico)

**Checkpoint**: escenarios 13–16.

---

## Phase 12: User Story 5 - Panel de estadísticas e informe de cierre (Priority: P2)

**Goal**: indicadores por dimensión, CSV e informe de cierre comparado con 2025.

**Independent Test**: ocupación = ingresos ÷ aforo y total = validada + estimada.

### Tests

- [ ] T107 [P] [US5] Prueba de dominio `op/domain/indicadores.test.ts`: `US5-AS1` (75 %), `US5-AS2` (50 000 + 113 162 = 163 162), ocupación solo con `funcion.aforo_habilitado`, recaudación en centavos, variación interanual (RN-003, RN-004)
- [ ] T108 [P] [US5] Prueba de integración `apps/api/test/operacion/estadisticas.int.test.ts`: `US5-AS3` (CSV con `;` y BOM UTF-8 con los filtros), `US5-AS4` (cierre por el trabajo `operacion.cerrar-ediciones`, `informe_cierre.datos` congelado, `edicion.estado = cerrada` ⇒ solo lectura, comparación con `cifras_historicas`)

### Implementation

- [ ] T109 [US5] Implementar `op/domain/indicadores.ts`; hace pasar T107
- [ ] T110 [US5] Consultas `op/application/estadisticas/{indicadores,exportar-csv,generar-informe,cerrar-ediciones}.ts` sobre `metrica_funcion`, `conteo_estimado` y `funcion`; cron diario 03:00 en `op/infrastructure/consumidores.pgboss.ts` (R8)
- [ ] T111 [US5] Controlador `op/interface/estadisticas.controller.ts`: `GET /indicadores`, `GET /indicadores.csv`, `GET/POST /ediciones/{id}/informe` con `@Requiere('direccion')`; hace pasar T108
- [ ] T112 [US5] Páginas `apps/web/src/app/(panel)/estadisticas/page.tsx` (filtros y tabla de datos accesible junto a cada gráfico) y `estadisticas/informe/page.tsx`
- [ ] T113 [US5] E2E `apps/web/e2e/operacion-estadisticas.spec.ts` con axe

**Checkpoint**: escenarios 17–18.

---

## Phase 13: User Story 11 - Mis datos personales (LOPDP) (Priority: P2)

**Goal**: descargar, corregir y eliminar datos; aceptar nuevas versiones de la política.

**Independent Test**: eliminar una cuenta sin entradas futuras y comprobar la anonimización.

### Tests

- [ ] T114 [P] [US11] Prueba de integración `apps/api/test/identidad/mis-datos.int.test.ts`: `US11-AS1` (JSON con cuenta, consentimientos, notificaciones y sesiones), `US11-AS2` (anonimización según [data-model §Anonimización](data-model.md#anonimización-rn-010-us11-as2), no puede iniciar sesión, `CuentaEliminada` publicado), `US11-AS3` (aviso por `destinatario_funcion` con `funcion_aviso.inicio` futuro o `postulacion_en_curso`; al confirmar se anonimiza), `US11-AS4` (nueva `documento_legal.version` ⇒ sesión restringida hasta aceptar)

### Implementation

- [ ] T115 [US11] Casos de uso `id/application/mi-cuenta/{descargar-datos,consultar-eliminacion,eliminar-cuenta,aceptar-politica,preferencias}.ts`; `cuenta.preferencias` registra el consentimiento de novedades (FR-022)
- [ ] T116 [US11] Endpoints `GET /yo/datos`, `GET/POST /yo/eliminacion`, `POST /yo/politica` en `id/interface/mi-cuenta.controller.ts`; hace pasar T114
- [ ] T117 [US11] Páginas `apps/web/src/app/(publico)/mi-cuenta/page.tsx` (descarga, eliminación con confirmación explicada) y `(publico)/cuenta/politica/page.tsx`

**Checkpoint**: escenarios 31–32.

---

## Phase 14: User Story 6 - Ediciones, sedes y parámetros (Priority: P3)

**Goal**: el administrador gestiona ediciones y sedes.

**Independent Test**: crear 2027 a partir de 2026 y comprobar que no copia funciones.

### Tests

- [ ] T118 [P] [US6] Prueba de dominio `op/domain/edicion.test.ts`: `US6-AS1` (copia sedes con `sede.sede_origen_id` y parámetros, no funciones), `US6-AS2` (fuera de noviembre ⇒ advertencia, no error)
- [ ] T119 [P] [US6] Prueba de integración `apps/api/test/operacion/ediciones-sedes.int.test.ts`: `US6-AS3` (sede con funciones no se elimina; `sede.activa = false` solo sin funciones futuras), `sede.accesibilidad` obligatoria, `sede.aforo` obligatorio salvo espacio público y recorrido, `sede.recorrido` obligatorio en recorridos, cambio de `edicion.precio_centavos` no afecta pedidos existentes (RN-006)

### Implementation

- [ ] T120 [US6] Implementar `op/domain/edicion.ts`; hace pasar T118
- [ ] T121 [US6] Casos de uso `op/application/ediciones/*` y `op/application/sedes/*` que validan `edicion.max_pagadas_persona`, `edicion.max_reservas_persona`, `edicion.precio_centavos`, `sede.accesibilidad`, `sede.aforo`, `sede.recorrido` y `sede.montaje_min` según [data-model.md](data-model.md); cada acción escribe `auditoria` (`auditoria.actor_id`, `auditoria.accion`, `auditoria.anterior`, `auditoria.nuevo`, `auditoria.correlacion_id`) en la misma transacción (FR-012); controladores `op/interface/ediciones.controller.ts` y ampliación de `sedes.controller.ts` (escritura con `@Requiere('administrador')`); hace pasar T119
- [ ] T122 [US6] Páginas `apps/web/src/app/(panel)/admin/ediciones/page.tsx` y `admin/sedes/page.tsx`

**Checkpoint**: escenario 19.

---

## Phase 15: User Story 12 - Condición de estudiante (Priority: P3)

**Goal**: acreditar estudiantes por dominio institucional hasta el fin de la edición.

**Independent Test**: verificar un correo institucional y reservar una función "solo estudiantes".

### Tests

- [ ] T123 [P] [US12] Prueba de integración `apps/api/test/identidad/estudiantes.int.test.ts`: `US12-AS1` (`acreditacion.vigente_hasta` = `edicion_vigente.fecha_fin`, RN-012), dominio no registrado ⇒ rechazo, `ContextoIdentidad.estudianteAcreditado` verdadero solo mientras esté vigente

### Implementation

- [ ] T124 [US12] Casos de uso `id/application/estudiantes/{solicitar,confirmar,dominios}.ts` con `token_cuenta.tipo = estudiante` y `token_cuenta.dato`; `dominio_institucional` gestionado por el administrador
- [ ] T125 [US12] Endpoints `POST /yo/estudiante`, `POST /estudiante/confirmacion`, `/dominios-institucionales`; hace pasar T123
- [ ] T126 [US12] Página `apps/web/src/app/(publico)/mi-cuenta/estudiante/page.tsx`; E2E `apps/web/e2e/identidad-estudiante.spec.ts` que reserva una función "solo estudiantes" en Boletería

**Checkpoint**: escenario 33.

---

## Phase 16: Polish & Cross-Cutting Concerns

- [ ] T127 [P] Actualizar las vistas 4+1 en `docs/arquitectura/` (lógica: módulos e `IdentidadPublica`; procesos: secuencias de publicación, cancelación → avisos e inicio de sesión con TOTP; física: SMTP y Mailpit) en un PR propio (Constitución §6)
- [ ] T128 [P] Pasar ADR 0009–0011 a "aceptada" tras la revisión
- [ ] T129 [P] Script k6 `tests/carga/operacion.js`: grilla de 60 funciones < 2 s (RNF-001) e inicio de sesión < 1 s p95 (RNF-004)
- [ ] T130 [P] Revisar logs: sin contraseñas, tokens, secretos TOTP ni `tokenQr` (Constitución IX); prueba `apps/api/test/identidad/logs.int.test.ts`
- [ ] T131 Cobertura de dominio ≥ 80 % en `op/domain` e `id/domain` (Q2)
- [ ] T132 `/security-review` de Identidad y de la integración (Q8) y corrección de hallazgos
- [ ] T133 Recorrer los 33 escenarios de [quickstart.md](quickstart.md) y registrar el resultado en `specs/004-gestion-operativa/verificacion-final.md`
- [ ] T133a Revisión manual con lector de pantalla (NVDA + Firefox) y solo teclado de las páginas P1: grilla, publicación, cambio de función, registro, ingreso, segundo factor y personal (Constitución VII); hallazgos y correcciones en `specs/004-gestion-operativa/verificacion-final.md`

---

## Dependencies & Execution Order

### Fases

- **Setup (1)** → **Foundational (2)** → historias.
- **US1 → US2 → US3** (Operación P1): US2 necesita funciones de US1; US3 necesita funciones publicadas.
- **US7 → US8 → US9** (Identidad P1): pueden avanzar **en paralelo** con Operación P1 una vez terminada la fase 2, porque Operación usa `IdentidadPublicaDevProvider` hasta T075.
- **Integración (9)**: después de US9. T090 espera a que 003 llegue a `main`.
- **US10**: después de US3 (eventos de cambio) y US8 (cuentas); T095/T099 usan la forma de 003.
- **US4, US5**: después de US3 (proyección de Boletería en T055). US5 usa los conteos de US4.
- **US11**: después de US10 (`destinatario_funcion`, `postulacion_en_curso`).
- **US6, US12**: independientes; US12 necesita `edicion_vigente` (T098).
- **Polish (16)**: al final.

### Dependencias externas

| Tarea | Necesita | Mientras tanto |
|-------|----------|----------------|
| T016, T038, T099, T104 | Eventos de US4 de 003 (`PostulacionSeleccionada`, `SeleccionDesistida`, `ResultadoPublicado`) | Esquema provisional y `pnpm events:emit` |
| T095, T099 | `PostulacionEnviada` y `SubsanacionSolicitada` de la rama 003 en `main` | Esquema de prueba con su misma forma |
| T088, T089, T091 | Revisión de @By-Alvarez06 y @Kevrc (Q4) | Los adaptadores dev siguen activos |
| T090 | 003 fusionada en `main` y revisión de @Carlos2190 | Su `AutorizacionConvocatoriasDevAdapter` |

### Dentro de cada historia

Prueba (falla) → dominio → repositorio → caso de uso → controlador → web → E2E.

## Parallel Example: User Story 1

```bash
# Pruebas primero, a la vez:
T029 op/domain/agenda.test.ts
T030 apps/api/test/operacion/grilla.int.test.ts
T031 apps/api/test/operacion/cruces-concurrentes.int.test.ts
T032 apps/api/test/operacion/obras-convocatoria.int.test.ts

# Luego, en paralelo con la lógica:
T034 op/domain/tipos.ts
T039 op/interface/{obras,sedes}.controller.ts
T040 apps/web/src/lib/operacion/api.ts
```

## Parallel Example: Operación e Identidad

```bash
# Tras la fase 2, dos líneas independientes:
Línea A: T029 → T043 (US1) → T044 → T050 (US2) → T051 → T059 (US3)
Línea B: T060 → T069 (US7) → T070 → T078 (US8) → T079 → T087 (US9)
```

## Implementation Strategy

### MVP (US1 + US2)

1. Fases 1 y 2.
2. US1 y US2: la programación real reemplaza la semilla simulada y alimenta Cartelera y Boletería.
3. **Parar y validar** con los escenarios 1–7 del quickstart. Es el escenario +1 del video.

### Entrega incremental

1. MVP → US3 (Operación P1 completa).
2. US7 → US8 → US9 → Integración: inicio de sesión real en todo el sistema.
3. US10 → US4 → US5 → US11 (P2).
4. US6 y US12 (P3, recortables: la semilla cubre ediciones y sedes).
5. Polish.

## Notes

- 136 tareas (133 numeradas más T039a, T069a y T133a, añadidas tras `/speckit-analyze`). Las de `[P]` tocan archivos distintos y no dependen de tareas abiertas.
- Archivos compartidos con 003 (`schema.prisma`, `docker-compose.yml`, `prisma/seed/index.ts`,
  `app.module.ts`, `worker.module.ts`, `eventos/index.ts`): cambios solo aditivos; quien fusione
  segundo resuelve el conflicto.
- No modificar specs 001, 002 ni 003 ni los puertos de sus módulos.
