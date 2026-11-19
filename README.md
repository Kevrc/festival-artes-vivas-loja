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
| `docs/arquitectura/` | Vistas 4+1 *(tras `/speckit-plan`)* |
| `docs/adr/` | Decisiones arquitectónicas *(tras `/speckit-plan`)* |

## Specs

| Spec | Rama | Contexto | Historias P1 |
|------|------|----------|--------------|
| [001 Cartelera](specs/001-cartelera-programacion/spec.md) | `001-cartelera-programacion` | Programación | Programación del día, filtros y búsqueda |
| [002 Boletería](specs/002-boleteria-entradas/spec.md) | `002-boleteria-entradas` | Boletería | Compra sin sobreventa, validación de ingreso (también sin conexión) |
| [003 Convocatorias](specs/003-convocatorias-curaduria/spec.md) | `003-convocatorias-curaduria` | Convocatorias | Postulación, subsanación, evaluación ponderada |
| [004 Operación e Identidad](specs/004-gestion-operativa/spec.md) | `004-gestion-operativa` | Operación + Identidad | Grilla sin cruces, publicación, reprogramar/cancelar, registro verificado, roles con alcance |

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
