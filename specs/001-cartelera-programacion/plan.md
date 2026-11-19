# Implementation Plan: Cartelera pública de programación

**Branch**: `001-cartelera-programacion` | **Date**: 2026-11-19 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-cartelera-programacion/spec.md`

**Responsable**: @Kevrc · **Revisor**: @jeimytorresg

## Summary

La cartelera publica la programación del FIAVL para visitantes sin cuenta: funciones por día,
filtros combinables y compartibles, búsqueda sin tildes, fichas de obra, elenco y sede, vista
"Ahora" con mapa, agenda personal y programa imprimible.

**Enfoque técnico**: el módulo **Programación** del monolito (NestJS) mantiene una **proyección
de lectura** en su esquema de PostgreSQL, alimentada por eventos de Operación y Boletería que
consume de la cola transaccional (pg-boss). La web (Next.js) genera **una página por día con ISR**
cacheada en la CDN y aplica los filtros en el navegador, de modo que el pico de la inauguración no
llega al servidor. Cada evento de cambio revalida solo las páginas afectadas en < 1 minuto.
Detalle de las decisiones en [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript 5.x sobre Node.js 22 LTS ([ADR-0002](../../docs/adr/0002-stack-por-necesidades.md))

**Primary Dependencies**: NestJS 11 (módulo `programacion`), Next.js 15 (App Router, ISR,
`revalidateTag`), Prisma 6 (`multiSchema`), pg-boss 10 (consumo de eventos), zod 3 (esquemas de
eventos), Leaflet 1.9 (mapa, carga bajo demanda), nestjs-pino y prom-client (observabilidad).
Herramientas de desarrollo: openapi-typescript, commitlint + husky, @vitest/coverage-v8; en CI:
gitleaks. Todas justificadas en [research R12](research.md#r12-dependencias-de-soporte-constitución-x)

**Storage**: PostgreSQL 16, esquema `programacion` con extensiones `unaccent` y `pg_trgm`
([data-model.md](data-model.md)); favoritos anónimos en `localStorage`

**Testing**: Vitest con cobertura ≥ 80 % en `domain/` (puerta Q2), Vitest + Testcontainers (integración con PostgreSQL real),
zod (contrato de eventos), Playwright + @axe-core/playwright (E2E y accesibilidad), Lighthouse CI
(rendimiento en 4G), k6 (carga en staging)

**Target Platform**: Navegadores móviles y de escritorio actuales (desde 320 px); servidor Linux
en contenedores ([ADR-0008](../../docs/adr/0008-despliegue-contenedores.md))

**Project Type**: Aplicación web — módulo de servidor + zona pública de la web en un monorepo

**Performance Goals**: p95 < 1 s en servidor y < 3 s de carga en celular 4G (RNF-001, SC-002);
5 000 visitantes simultáneos (RNF-002, SC-003); cambios visibles en < 1 min (RNF-004, SC-004)

**Constraints**: hora de Ecuador fija (America/Guayaquil) sin depender del dispositivo; la
ubicación del visitante nunca sale del navegador (FR-014); la cartelera sigue si Boletería cae
(RNF-003); WCAG 2.1 AA (FR-013); sin costo de mapas (C-2)

**Scale/Scope**: 1 edición activa; ≤ 450 funciones, ~200 obras, ~40 sedes por edición; ≤ 100
funciones por día; 6 historias de usuario, 14 FR, 6 RN; ~12 pantallas públicas

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio | Cumplimiento en este plan | Estado |
|-----------|---------------------------|:------:|
| I. Especificación primero | Spec aprobada, sin `NEEDS CLARIFICATION`; plan, research, data-model y contratos antes de código | ✅ |
| II. Arquitectura 4+1 | Encaja en las vistas existentes (módulo Programación, ADR-0006); no cambia estructura, no requiere actualizar vistas | ✅ |
| III. Módulos y contratos | Solo usa su esquema `programacion`; depende de 002/004 **por eventos** con contrato dirigido por el consumidor ([eventos-consumidos.md](contracts/eventos-consumidos.md)); API pública en OpenAPI ([api-cartelera.openapi.yaml](contracts/api-cartelera.openapi.yaml)) | ✅ |
| IV. Pruebas como aceptación | Cada escenario US-AS tiene prueba nombrada; reglas RN como funciones puras probadas primero; integración con PostgreSQL real ([research R11](research.md#r11-pruebas-y-verificación-de-los-criterios-de-éxito)) | ✅ |
| V. Integridad del aforo | No vende ni reserva; solo **muestra** disponibilidad recibida de Boletería | ✅ (no aplica) |
| VI. Seguridad y privacidad | Lectura pública sin datos personales; favoritos con sesión de Identidad; ubicación solo en el navegador (FR-014); `/api/revalidar` protegido por secreto | ✅ |
| VII. Acceso público e inclusivo | Sin cuenta, móvil primero, WCAG 2.1 AA verificado con axe en la CI, accesibilidad de sedes visible ([rutas-web.md](contracts/rutas-web.md)) | ✅ |
| VIII. Resiliencia ante picos | Página por día en CDN + ISR; disponibilidad aparte con caché de 15 s; degradación a "Consultar disponibilidad" | ✅ |
| IX. Observabilidad | Logs estructurados con id de correlación y `/metrics` (peticiones, errores, latencia) desde la fase de Setup; consumidores registran `correlacionId`; métrica de retraso entre `ocurridoEn` y revalidación (SC-004) | ✅ |
| X. Simplicidad | Sin motor de búsqueda, sin WebSockets, sin generador de PDF; **todas** las dependencias nuevas justificadas en research (R10, R7, R11, R12) | ✅ |

**Puertas de calidad aplicables**: Q1–Q8; Q7 (accesibilidad) es crítica en esta spec.

**Re-evaluación tras la fase 1**: el diseño no introduce componentes nuevos de infraestructura ni
acceso a datos de otros módulos. **Sin violaciones.**

## Project Structure

### Documentation (this feature)

```text
specs/001-cartelera-programacion/
├── spec.md
├── plan.md                         # este archivo
├── research.md                     # fase 0: R1–R11
├── data-model.md                   # fase 1: esquema `programacion`
├── quickstart.md                   # fase 1: guía de validación
├── contracts/
│   ├── api-cartelera.openapi.yaml  # API pública (OpenAPI 3.1, validado con Redocly)
│   ├── eventos-consumidos.md       # contrato dirigido por el consumidor (002, 004)
│   └── rutas-web.md                # rutas públicas, caché y filtros
├── checklists/requirements.md
└── tasks.md                        # fase 2: /speckit-tasks (no lo crea este comando)
```

### Source Code (repository root)

```text
apps/api/src/modules/programacion/
├── domain/
│   ├── funcion-cartelera.ts        # entidad de lectura y estados
│   ├── dia-festival.ts (+ .test)   # diaFestival, incluidaEnDia (R3, continuas)
│   ├── reglas-dia.ts (+ .test)     # ordenarDia, nivelDisponibilidad (RN-002, RN-006)
│   ├── en-curso.ts (+ .test)       # enCurso (RN-003)
│   └── calendario.ts (+ .test)     # generador .ics
├── application/
│   ├── consultas/                  # listarDia, buscar, ahora, fichas, disponibilidad
│   ├── proyeccion/                 # aplicar eventos a la proyección (idempotente, por versión)
│   ├── favoritos/                  # marcar, quitar, fusionar
│   └── puertos.ts                  # RepositorioCartelera, Revalidador
├── infrastructure/
│   ├── prisma-cartelera.repository.ts
│   ├── revalidador-next.ts         # llama a /api/revalidar
│   └── consumidores.pgboss.ts      # colas programacion.*
├── interface/
│   ├── cartelera.controller.ts     # US1: edición, día, disponibilidad
│   ├── busqueda.controller.ts      # US2
│   ├── fichas.controller.ts        # US3: obras, elencos, sedes
│   ├── ahora.controller.ts         # US4
│   ├── calendario.controller.ts    # US6
│   └── favoritos.controller.ts     # US5
└── programacion.module.ts

apps/api/test/programacion/         # integración (Testcontainers)
apps/api/src/common/observabilidad/ # logger y métricas compartidos por todos los módulos

apps/web/src/app/(publico)/
├── cartelera/[fecha]/page.tsx      # ISR por día
├── buscar/  ahora/  mapa/  mi-agenda/  programa/
├── obras/[id]/  elencos/[id]/  sedes/[id]/
└── api/revalidar/route.ts

apps/web/src/lib/cartelera/
├── filtros.ts  agenda.ts  distancia.ts  calendario.ts   # funciones puras + pruebas
apps/web/e2e/cartelera.spec.ts      # Playwright + axe

packages/contracts/
├── api/cartelera.ts                # tipos derivados del OpenAPI
└── eventos/                        # esquemas zod de los eventos consumidos

prisma/programacion.prisma          # esquema `programacion`
tests/carga/cartelera.js            # k6
```

**Structure Decision**: monorepo de la [vista de desarrollo](../../docs/arquitectura/02-vista-desarrollo.md):
el módulo `programacion` del API sigue la estructura hexagonal (domain → application →
infrastructure / interface) y la zona `(publico)` de la web. Esta spec es la **primera en
implementarse**, así que sus tareas de preparación crean también el esqueleto común del monorepo
(pnpm, Turborepo, Docker Compose con PostgreSQL, CI) que reutilizan 002–004.

## Dependencias con otras specs

| Necesita | De | Mientras no exista |
|----------|----|--------------------|
| Eventos de funciones y edición | 004 Operación | Semilla + comando `events:emit` que publica eventos de prueba válidos según el contrato |
| `DisponibilidadCambiada` | 002 Boletería | Semilla con niveles fijos; degradación a "Consultar disponibilidad" |
| Sesión de usuario para favoritos | 004 Identidad | Favoritos solo en el dispositivo (US5-AS3 sigue cumpliéndose) |
| Ruta para obtener entradas | 002 Boletería | Botón enlaza a `/entradas/{funcionId}` (contrato de ruta acordado) |

## Riesgos

| Riesgo | Mitigación |
|--------|------------|
| El plan gratuito de teselas no alcanza en el pico | Mapa bajo demanda; la lista no depende del mapa (research R7) |
| Operación publica eventos con forma distinta | Contrato dirigido por el consumidor + pruebas de contrato en 004 |
| Revalidación lenta en la CDN | Medir el retraso (SC-004) en staging; caducidad de 60 s como red de seguridad |

## Complexity Tracking

Sin violaciones de la constitución: no aplica.
