# Implementation Plan: Boletería y control de acceso

**Branch**: `002-boleteria-entradas` | **Date**: 2026-11-19 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/002-boleteria-entradas/spec.md`

**Responsable**: @By-Alvarez06 · **Revisor suplente**: @Kevrc

## Summary

El módulo de **Boletería** gestiona la venta de entradas pagadas (USD 5 en 2026, precio por
edición), reservas gratuitas con aforo, taquilla física con apertura/cierre de caja, validación de
ingreso en puerta (en línea y sin conexión), cancelaciones/devoluciones/cambios y ocupación en vivo
para las salas del FIAVL.

**Enfoque técnico**: dentro del monolito modular NestJS ([ADR-0001](../../docs/adr/0001-monolito-modular.md)),
el módulo `boleteria` es dueño exclusivo de su esquema PostgreSQL `boleteria` y controla el aforo
compartido entre web, taquilla y reservas mediante una actualización atómica condicional sobre
`inventario_funcion` ([ADR-0004](../../docs/adr/0004-control-de-aforo.md)), con retención de
10 minutos y claves de idempotencia obligatorias. El cobro externo se aísla detrás del puerto
`ProveedorPagos` ([ADR-0007](../../docs/adr/0007-pagos-capa-anticorrupcion.md), adaptador PayPhone
para staging/producción y simulador determinista para local/CI). Las entradas llevan un token
firmado con **Ed25519** y un código corto legible de 8 caracteres para que el validador **PWA** en
Next.js (Service Worker + IndexedDB + Web Crypto) opere al menos 4 horas sin internet y sincronice
conflictos al reconectar ([ADR-0005](../../docs/adr/0005-qr-firmado-validador-offline.md)). Los
eventos de dominio (`DisponibilidadCambiada`, `EntradasEmitidas`, `IngresoRegistrado`,
`PedidoReembolsado`, `ConflictoDeIngreso`, `AforoExcedido`) y trabajos periódicos se ejecutan con
`pg-boss` en PostgreSQL ([ADR-0003](../../docs/adr/0003-eventos-outbox.md)). Ver decisiones de
investigación en [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript 5.x sobre Node.js 22 LTS ([ADR-0002](../../docs/adr/0002-stack-por-necesidades.md))

**Primary Dependencies**: NestJS 11 (módulo `boleteria`), Next.js 15.5 (App Router + PWA `/validador`),
Prisma 6.19 (`multiSchema`), pg-boss 10 (colas de eventos y trabajos programados), zod 3
(validación de contratos y DTOs), `node:crypto` + Web Crypto API (Ed25519 nativo), `qrcode`
(renderizado local SVG de QR, justificada en [research R11](research.md#r11-pruebas-verificación-de-sc-001sc-006-y-justificación-de-dependencias)),
nestjs-pino y prom-client (observabilidad ya presente desde spec 001).

**Storage**: PostgreSQL 16, esquema exclusivo `boleteria` ([data-model.md](data-model.md));
IndexedDB (`fiavl-validador`) y Service Worker Cache Storage en la PWA del validador.

**Testing**: Vitest con cobertura ≥ 80 % en `domain/` (puerta Q2), Vitest + Testcontainers contra
PostgreSQL real (concurrencia 500 compras / 100 lugares de SC-001, idempotencia, arqueo),
contratos Zod, Playwright + `@axe-core/playwright` (E2E web, taquilla, simulación `offline` del
validador y WCAG 2.1 AA), y `k6` para picos de compra/validación.

**Target Platform**: Navegadores móviles y de escritorio actuales desde 320 px (PWA en celulares del
personal para puerta, panel web para taquilla y público); servidor Linux en contenedores Docker
([ADR-0008](../../docs/adr/0008-despliegue-contenedores.md)).

**Project Type**: Monorepo existente (`apps/api`, `apps/worker`, `apps/web`, `packages/contracts`).

**Performance Goals**: Confirmación de compra o reserva < 2 s (p95, sin contar proveedor externo,
RNF-002); validación en puerta < 2 s con o sin conexión (RNF-003); 500 compras concurrentes sobre
100 lugares con exactamente 100 entradas emitidas (RNF-001, SC-001).

**Constraints**: Cero sobreventa y cero cobros duplicados (Constitución V); importes siempre en
centavos enteros de USD; nunca almacenar datos de tarjeta ni exponer llave privada Ed25519 en el
navegador; operación offline ≥ 4 horas (RNF-005); autorización por rol y alcance de sede comprobada
en servidor (Constitución VI); hora oficial de Ecuador (`America/Guayaquil`).

**Scale/Scope**: ≤ 22 400 entradas pagadas y ≤ 50 000 reservas por edición; ráfagas de apertura
de ~25 escrituras/s y 1 500 intentos en el primer minuto ([00-drivers.md](../../docs/arquitectura/00-drivers.md));
6 historias de usuario, 16 FR, 7 RN, 5 RNF y 6 SC.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio | Cumplimiento en este plan | Estado |
|-----------|---------------------------|:------:|
| I. Especificación primero | `spec.md` sin `[NEEDS CLARIFICATION]` y checklist completo; `research.md`, `data-model.md`, `contracts/` y `quickstart.md` generados antes de tareas y código | ✅ |
| II. Arquitectura 4+1 | Implementa fielmente el módulo `boleteria`, la vista de procesos (secuencias de compra y validador offline), ADR-0004, ADR-0005 y ADR-0007 | ✅ |
| III. Módulos y contratos | Esquema PostgreSQL propio `boleteria`; integración exclusiva por eventos en `@fiavl/contracts` (`DisponibilidadCambiada`, `EntradasEmitidas`, etc.) y puerto `AutorizacionBoleteriaPort`; OpenAPI contract-first en [api-boleteria.openapi.yaml](contracts/api-boleteria.openapi.yaml) | ✅ |
| IV. Pruebas como aceptación | Cada `US-AS` tendrá prueba automatizada; reglas RN-001..RN-007 y control de aforo con pruebas primero (rojo → verde → refactor); concurrencia real en Testcontainers | ✅ |
| V. Integridad del aforo y dinero | `UPDATE` atómico condicional en `inventario_funcion`, `Idempotency-Key` único, webhook idempotente, importes en centavos enteros, tabla inmutable `movimiento_pago` y proveedor alojado | ✅ |
| VI. Seguridad y privacidad | Autorización por rol/alcance de sede en servidor, paquete offline sin datos personales, secretos Ed25519/pagos fuera del repo, validación Zod en bordes; `/security-review` obligatorio antes de fusionar (puerta Q8) | ✅ |
| VII. Acceso público e inclusivo | Móvil primero desde 320 px, español, WCAG 2.1 AA con `axe`, semáforo de validador con texto e icono además de color | ✅ |
| VIII. Resiliencia ante picos | Validador PWA con IndexedDB + Service Worker (≥ 4 h offline); taquilla en efectivo opera si cae el proveedor de pagos; `DisponibilidadCambiada` agrupada para no saturar cola | ✅ |
| IX. Observabilidad y trazabilidad | Logs `nestjs-pino` con `correlacionId` propagado a eventos, métricas Prometheus (compras, retenciones expiradas, validaciones, errores) y bitácora inmutable `auditoria_boleteria` | ✅ |
| X. Simplicidad | Sin Redis ni servicios externos adicionales; reutiliza PostgreSQL + `pg-boss` + monorepo existente; única dependencia nueva (`qrcode`) justificada en [research R11](research.md#r11-pruebas-verificación-de-sc-001sc-006-y-justificación-de-dependencias) | ✅ |

**Puertas de calidad aplicables**: Q1–Q8. Por §4 y §11 de la constitución, **Q4** exige solicitar
revisión explícita al revisor suplente (`@Kevrc`) y **Q8** exige `/security-review` al tocar Boletería.

**Re-evaluación tras la fase 1**: el diseño del esquema `boleteria`, la API OpenAPI 3.1, los
eventos de dominio y las rutas web no introducen componentes con estado nuevos ni cruzan fronteras
de módulos. **Sin violaciones.**

## Project Structure

### Documentation (this feature)

```text
specs/002-boleteria-entradas/
├── spec.md
├── plan.md                                 # este archivo
├── research.md                             # fase 0: R1–R11
├── data-model.md                           # fase 1: esquema `boleteria`
├── quickstart.md                           # fase 1: guía de validación
├── contracts/
│   ├── api-boleteria.openapi.yaml          # API HTTP (OpenAPI 3.1, validado con Redocly)
│   ├── eventos-boleteria.md                # eventos consumidos y publicados
│   └── rutas-web.md                        # rutas web públicas, taquilla, sala y validador PWA
├── checklists/requirements.md
└── tasks.md                                # fase 2: /speckit-tasks (no lo crea este comando)
```

### Source Code (repository root)

```text
apps/api/src/modules/boleteria/
├── domain/
│   ├── tipos.ts                            # tipos de dominio, estados, enums
│   ├── reglas-aforo.ts (+ .test)           # RN-001, RN-002, límites, excedentes
│   ├── reglas-acceso.ts (+ .test)          # RN-003, RN-004, RN-005, RN-006, RN-007
│   ├── firma-qr.ts (+ .test)               # firma/verificación Ed25519 y código corto
│   ├── arqueo-caja.ts (+ .test)            # cálculo esperado/diferencia en centavos (SC-006)
│   └── evaluador-ingreso.ts (+ .test)      # lógica verde/ámbar/rojo y conflictos offline
├── application/
│   ├── puertos.ts                          # RepositorioBoleteria, ProveedorPagos, PublicadorEventos, AutorizacionBoleteriaPort
│   ├── compras/                            # crearPedido, procesarWebhook, conciliarPagos, expirarRetenciones, reenviarCorreo
│   ├── reservas/                           # crearReserva, cancelarReserva, liberarReservasNoValidadas
│   ├── taquilla/                           # abrirCaja, obtenerCajaActual, venderTaquilla, devolverTaquilla, cerrarCaja
│   ├── validador/                          # obtenerPaquete, validarEnLinea, sincronizarIngresos
│   ├── cancelaciones/                      # aplicarCancelacion, aplicarReprogramacion, elegirResolucion, devolucionesVencidas
│   ├── consultas/                          # disponibilidadFuncion, misEntradas, obtenerPedido, ocupacionEnVivo
│   └── eventos/                            # aplicarEventoOperacion (consumidor idempotente)
├── infrastructure/
│   ├── prisma-boleteria.repository.ts
│   ├── pagos-simulador.adapter.ts          # adaptador determinista local/CI
│   ├── pagos-payphone.adapter.ts           # adaptador PayPhone detrás de ProveedorPagos
│   ├── publicador.pgboss.ts                # colas de salida + singletonKey DisponibilidadCambiada
│   ├── consumidores.pgboss.ts              # colas boleteria.* + cron jobs del worker
│   └── autorizacion-dev.adapter.ts         # puente temporal fail-closed hasta spec 004
├── interface/
│   ├── pedidos.controller.ts               # US1, US3, US5 (pedidos, reservas, mis-entradas, cancelaciones)
│   ├── pagos-webhook.controller.ts         # US1 webhook firmado
│   ├── taquilla.controller.ts              # US4, US5 taquilla y cajas
│   ├── validador.controller.ts             # US2 paquete, validar, sincronizar
│   ├── disponibilidad.controller.ts        # disponibilidad y US6 ocupación en vivo
│   ├── boleteria.guard.ts                  # guardas de sesión, verificación, rol y sede
│   └── esquemas.ts                         # DTOs Zod de entrada/salida
└── boleteria.module.ts

apps/api/test/boleteria/                    # integración y concurrencia real (Testcontainers)

apps/web/src/app/
├── (publico)/
│   ├── entradas/[funcionId]/page.tsx       # compra / reserva desde cartelera
│   ├── pedidos/[id]/retorno/page.tsx       # retorno de pasarela de pago
│   └── mis-entradas/page.tsx               # QR, reenvío, cancelar reserva, devolución/cambio
├── (panel)/
│   ├── taquilla/page.tsx                   # caja, venta presencial, impresión, arqueo
│   └── sala/[funcionId]/page.tsx           # ocupación en vivo (US6)
└── validador/
    ├── page.tsx                            # selector de función y descarga offline
    ├── [funcionId]/page.tsx                # escáner QR + código corto + semáforo
    └── sw.js/route.ts                        # Service Worker offline (/validador/sw.js)

apps/web/src/lib/boleteria/
├── validador-offline.ts (+ .test)          # IndexedDB + Web Crypto Ed25519 + cola offline
└── api-boleteria.ts                        # cliente HTTP tipado desde contratos

apps/web/e2e/boleteria.spec.ts              # Playwright + axe (online y offline)

packages/contracts/src/
├── api/boleteria.ts                        # tipos generados desde OpenAPI 3.1
└── eventos/
    ├── boleteria.ts                        # DisponibilidadCambiada + EntradasEmitidas, IngresoRegistrado, PedidoReembolsado, ConflictoDeIngreso, AforoExcedido
    └── operacion.ts                        # añadir AforoCambiado

prisma/schema/boleteria.prisma              # esquema PostgreSQL `boleteria`
tests/carga/boleteria.js                    # script k6 para picos de compra/validación
```

**Structure Decision**: se sigue exactamente la estructura del monorepo de la
[vista de desarrollo](../../docs/arquitectura/02-vista-desarrollo.md) y el patrón hexagonal de la
spec 001 (`domain → application → infrastructure / interface`), manteniendo un único esquema Prisma
por módulo (`prisma/schema/boleteria.prisma`) y los contratos compartidos en `packages/contracts`.

## Dependencias con otras specs

| Necesita | De | Mientras no exista 004 / 003 |
|----------|----|------------------------------|
| Eventos `ProgramacionPublicada`, `FuncionProgramada`, `FuncionReprogramada`, `FuncionCancelada`, `AforoCambiado` | 004 Operación | Semilla 2026 compartida + extensión de `pnpm events:emit` para disparar `funcion-cancelada`, `funcion-reprogramada` y `aforo-cambiado` contra colas `boleteria.*` |
| Sesión verificada, rol (`taquilla`, `validador`, `jefe_sala`), alcance por sede y condición de estudiante | 004 Identidad | Puerto `AutorizacionBoleteriaPort` con adaptador temporal `development`/`test` fail-closed (mismo patrón de `SesionGuard` en 001) |
| Envío de correos por eventos `EntradasEmitidas` y `PedidoReembolsado` | 004 Identidad | Boletería encola los eventos válidos en `pg-boss`; al integrarse 004 los consume sin cambios en Boletería |
| Actualización de disponibilidad en cartelera | 001 Cartelera | Ya implementada en `main`; Boletería publica `DisponibilidadCambiada` conforme al contrato existente |

## Riesgos

| Riesgo | Mitigación |
|--------|------------|
| Contención o sobreventa en la fila de `inventario_funcion` durante ráfagas (1 500 intentos/min) | `UPDATE` condicional atómico sin transacciones largas; llamadas externas a PayPhone y correos ocurren fuera o después del bloqueo de inventario; prueba de 500 hilos reales en Testcontainers |
| Reloj desajustado en celular del validador (RN-003 o conflicto offline) | El paquete incluye `horaServidor` para calcular `desfaseMs` en el navegador y el servidor valida ventana/prioridad con marca temporal corregida |
| Webhook de pago perdido o tardío tras expiración de 10 min | Trabajo `conciliar-pagos` cada 2 min + recuperación o reembolso automático idempotente en US1-AS6 |
| Dos validadores sin red escanean la misma entrada | Riesgo acotado aceptado (ADR-0005); al reconectar gana el primer ingreso cronológico y se emite `ConflictoDeIngreso` hacia Operación |
| Proveedor de pagos externo caído durante el festival | Retención se libera al fallar `iniciarCobro`, web informa indisponibilidad temporal y la taquilla física sigue vendiendo en efectivo |

## Complexity Tracking

Sin violaciones de la constitución: no aplica.
