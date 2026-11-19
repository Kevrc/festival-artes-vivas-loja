# ADR-0002: Usar TypeScript de punta a punta (NestJS, Next.js, PostgreSQL)

- Estado: propuesta (a confirmar por el equipo)
- Fecha: 2026-11-19 · Autor: @Kevrc · Specs: 001–004

## Contexto

El equipo ya construyó un proyecto con NestJS, Next.js, PostgreSQL, Prisma y BullMQ en un
monorepo con pnpm y Turborepo. El plazo es corto y la defensa valora decisiones justificadas
más que tecnología novedosa.

## Decisión

| Capa | Tecnología | Por qué |
|------|------------|---------|
| Servidor | **NestJS** (Node.js, TypeScript) | Módulos nativos que encajan con ADR-0001; inyección de dependencias para puertos y adaptadores |
| Web pública y paneles | **Next.js** (React) | Renderizado en servidor e ISR para la cartelera (ADR-0006); PWA para el validador (ADR-0005) |
| Base de datos | **PostgreSQL** | Transacciones y actualizaciones atómicas para el aforo (ADR-0004); un esquema por módulo |
| Acceso a datos | **Prisma** | Tipado y migraciones; un cliente por esquema |
| Cola y caché | **Redis** + **BullMQ** | Entrega de eventos y trabajos programados (ADR-0003) |
| Archivos | Almacenamiento compatible con S3 (MinIO en local) | Dossiers y documentos de postulantes |
| Monorepo | pnpm + Turborepo | Tipos y contratos compartidos en `packages/contracts` |

## Alternativas

- **Go + Angular** (otro proyecto del equipo): buen rendimiento, pero dos lenguajes y sin
  renderizado en servidor sencillo para la cartelera.
- **Django / Laravel**: productivos, pero nadie del equipo los domina.

## Consecuencias

- (+) Un solo lenguaje; los contratos de eventos y API se comparten como tipos.
- (+) Curva de aprendizaje mínima.
- (−) Node.js usa un solo hilo: las tareas pesadas (informes, CSV) van al proceso *worker*.
- Vistas afectadas: desarrollo, física.
