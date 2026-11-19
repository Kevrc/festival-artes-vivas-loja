# Plataforma del Festival Internacional de Artes Vivas de Loja (FIAVL)

Proyecto de Arquitectura de Software sobre el caso real del FIAVL (Loja, Ecuador: 11 días cada
noviembre, más de 300 actividades y 160 000 asistencias por edición). Se desarrolla con
**Specification-Driven Development** ([spec-kit](https://github.com/github/spec-kit)), trabajo
colaborativo por ramas y arquitectura documentada con el **modelo 4+1** en Mermaid.

## Documentos base

| Documento | Contenido |
|-----------|-----------|
| [Constitución](.specify/memory/constitution.md) | Principios I–X, puertas de calidad, flujo por ramas, entregables |
| [Investigación del caso](docs/investigacion-festival.md) | Historia, ediciones, sedes, boletería, cifras y fuentes |
| [Modelo del dominio](docs/dominio.md) | Ciclo anual, mapa de contextos, glosario, catálogo de eventos |
| [Arquitectura 4+1](docs/arquitectura/README.md) | Vistas lógica, desarrollo, procesos, física y escenarios (Mermaid) |
| [ADR](docs/adr/) | 8 decisiones arquitectónicas con alternativas y consecuencias |

## Specs

| Spec | Rama | Contexto | Historias P1 |
|------|------|----------|--------------|
| [001 Cartelera](specs/001-cartelera-programacion/spec.md) | `001-cartelera-programacion` | Programación | Programación del día, filtros y búsqueda |
| [002 Boletería](specs/002-boleteria-entradas/spec.md) | `002-boleteria-entradas` | Boletería | Compra sin sobreventa, validación de ingreso (también sin conexión) |
| [003 Convocatorias](specs/003-convocatorias-curaduria/spec.md) | `003-convocatorias-curaduria` | Convocatorias | Postulación, subsanación, evaluación ponderada |
| [004 Operación e Identidad](specs/004-gestion-operativa/spec.md) | `004-gestion-operativa` | Operación + Identidad | Grilla sin cruces, publicación, reprogramar/cancelar, registro verificado, roles con alcance |

## Cómo ejecutar

Requisitos: Node.js 22+, pnpm 11 y Docker.

```bash
cp .env.example .env
```

```bash
pnpm install
```

```bash
pnpm db:up && pnpm db:migrate && pnpm db:seed
```

```bash
pnpm dev
```

Web en http://localhost:3100 (cartelera), API en http://localhost:4000 y métricas del worker en
http://localhost:9464/metrics. La semilla carga la edición XI (2026) con obras y sedes reales; con
`FIAVL_AHORA=2026-11-14T12:00:00-05:00` en `.env` la demo se ve como un día del festival.

| Comando | Qué verifica |
|---------|--------------|
| `pnpm lint && pnpm typecheck` | Estilo, tipos y fronteras entre módulos |
| `pnpm test` | Unitarias y contratos de eventos, cobertura ≥ 80 % del dominio |
| `pnpm --filter @fiavl/api test:int` | Integración contra PostgreSQL real (Testcontainers) |
| `pnpm --filter @fiavl/web test:e2e` | Historias de punta a punta y accesibilidad (requiere la app en marcha) |
| `pnpm events:emit funcion-cancelada --id <funcionId>` | Simula un evento de Operación (ver quickstart de la 001) |

## Flujo de trabajo

1. Cada integrante toma una spec y trabaja en su rama `NNN-nombre`.
2. En su rama: `/speckit-clarify` → `/speckit-plan` → `/speckit-tasks` → `/speckit-analyze` →
   `/speckit-implement`.
3. PR a `main` con las puertas de calidad Q1–Q8 de la constitución y revisión de otro integrante.
4. Cambios de arquitectura (`docs/arquitectura/`, ADR, contratos compartidos) en ramas `docs/...`.
5. Commits en español: `tipo(ámbito): resumen`, por ejemplo `feat(boleteria): retener lugares durante el pago`.

## Entregables

- **Repositorio**: este, con historial de ramas y PRs de todo el equipo.
- **Arquitectura 4+1**: `docs/arquitectura/` + `docs/adr/`.
- **Video de defensa (5 min)**: todo el equipo, guion en la §9 de la constitución.
