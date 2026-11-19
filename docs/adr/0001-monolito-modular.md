# ADR-0001: Construir un monolito modular con cinco módulos de dominio

- Estado: aceptada
- Fecha: 2026-11-19 · Autor: @Kevrc · Specs: 001–004
- Drivers: QA-3, QA-4, QA-10, QA-13, C-1, C-2 ([drivers](../arquitectura/00-drivers.md))

## Contexto

Cuatro integrantes, un semestre y cuatro specs con cinco contextos acotados (Programación,
Boletería, Convocatorias, Operación, Identidad). La carga es estacional: casi nula diez meses y
pico concentrado en 11 días de noviembre. La constitución exige fronteras explícitas entre
contextos (III) y simplicidad (X).

## Decisión

Un **monolito modular**: una sola aplicación de servidor desplegable, dividida en cinco módulos
que solo se comunican por su API pública interna o por eventos de dominio. Cada módulo tiene su
propio **esquema** en la base de datos y ningún módulo consulta tablas de otro.

## Alternativas

| Opción | A favor | En contra |
|--------|---------|-----------|
| **Monolito modular** (elegida) | Un despliegue, transacciones locales, depuración simple, fronteras igual de claras | Escala como un todo |
| Microservicios (uno por contexto) | Escala y despliegue independientes | 5 despliegues, red, consistencia eventual en todo, demasiada infraestructura para 4 personas |
| Monolito sin módulos | Lo más rápido al inicio | Acoplamiento, los 4 integrantes se pisan, imposible defender fronteras |

## Consecuencias

- (+) Cada integrante es dueño de un módulo y de su esquema; los PR no se cruzan.
- (+) Si un módulo necesita escalar aparte (p. ej. Boletería), su frontera ya existe para extraerlo.
- (−) Un fallo grave del proceso afecta a todos los módulos; se mitiga con réplicas (ADR-0008) y
  con la cartelera servida desde caché (ADR-0006).
- Vistas afectadas: lógica, desarrollo, física.
