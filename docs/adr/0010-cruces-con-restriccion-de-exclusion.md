# ADR-0010: Impedir cruces de agenda con restricciones de exclusión en PostgreSQL

- Estado: propuesta
- Fecha: 2026-11-20 · Autor: @jeimytorresg · Specs: 004 (US1, US3)
- Drivers: QA-6, QA-12 ([drivers](../arquitectura/00-drivers.md))

## Contexto

La programación publicada debe tener **cero cruces** de sede (con su tiempo de montaje) y de
elenco (SC-001, RN-001, FR-002, FR-003), aunque varios programadores trabajen a la vez en la misma
grilla. El programador además necesita ver **con qué función** choca (US1-AS2).

RN-001 (`inicioB < finA + montaje` y `inicioA < finB + montaje`) equivale a que los intervalos
`[inicio, fin + montaje)` de dos funciones de la misma sede se solapen.

## Decisión

Dos capas:

1. **Dominio**: una función pura calcula los intervalos y devuelve los conflictos con sus datos
   para mostrarlos. Se desarrolla probando primero.
2. **Base de datos**: cada función escribe sus bloques en `operacion.bloque_ocupacion`, protegida
   por `EXCLUDE USING gist (sede_id WITH =, rango_sede WITH &&) WHERE (activo)` y la equivalente
   para el elenco (extensión `btree_gist`). Si dos guardados simultáneos esquivan la comprobación
   del dominio, PostgreSQL rechaza el segundo y la API responde el mismo `409`.

## Alternativas

| Opción | A favor | En contra |
|--------|---------|-----------|
| **Dominio + `EXCLUDE`** (elegida) | Garantía imposible de saltar; sin bloqueos explícitos | Restricción escrita a mano en la migración (Prisma no la modela) |
| Solo validar en la aplicación | Simple | Dos programadores pueden crear funciones que chocan al mismo tiempo |
| `SELECT … FOR UPDATE` por sede y día | Correcto | Serializa la grilla; hay que bloquear también por elenco en otra sede |
| Transacciones `SERIALIZABLE` | Correcto | Reintentos frecuentes y difíciles de explicar |

## Consecuencias

- **Positivas**: SC-001 queda garantizado por la base, igual que el aforo en
  [ADR-0004](0004-control-de-aforo.md); la prueba de concurrencia es directa.
- **Negativas**: las actividades continuas generan un bloque por día; las cancelaciones deben
  desactivar sus bloques en la misma transacción.
- **Interbloqueos (hallado al implementar)**: dos inserciones simultáneas que chocan en una
  restricción `EXCLUDE` pueden interbloquearse (PostgreSQL aborta una con `40P01`). Por eso el
  guardado toma antes, en la misma transacción, un bloqueo consultivo por sede y por elenco
  (`pg_advisory_xact_lock`, en orden fijo): solo se ordenan los guardados que compiten por lo mismo,
  no toda la grilla, y la restricción sigue siendo la garantía final.
- **Vistas 4+1**: lógica (entidad `bloque_ocupacion`) y procesos (concurrencia en la grilla).
