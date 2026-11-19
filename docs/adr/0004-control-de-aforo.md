# ADR-0004: Controlar el aforo con una actualización atómica condicional

- Estado: aceptada
- Fecha: 2026-11-19 · Autor: @Kevrc · Specs: 002

## Contexto

Venta web, taquilla y reservas consumen el mismo inventario. La constitución (V) prohíbe la
sobreventa incluso con operaciones simultáneas; la prueba de aceptación es 500 compras
concurrentes sobre 100 lugares → exactamente 100 entradas.

## Decisión

El inventario de cada función es una fila en `boleteria.inventario_funcion`. Retener lugares es
**una sola sentencia atómica** que solo tiene efecto si hay cupo:

```sql
UPDATE boleteria.inventario_funcion
SET retenidos = retenidos + :n
WHERE funcion_id = :id
  AND aforo_habilitado - emitidos - retenidos >= :n
RETURNING *;
```

Si no devuelve fila, no hay lugares. La retención expira a los 10 minutos con un trabajo
programado que la libera. Cada pedido lleva una **clave de idempotencia** única; un reintento
devuelve el mismo pedido.

## Alternativas

| Opción | En contra |
|--------|-----------|
| Leer disponibilidad y luego escribir | Condición de carrera: dos compras leen "1 libre" y venden 2 |
| Bloqueo `SELECT … FOR UPDATE` | Correcto pero serializa y alarga la transacción |
| Contador en Redis | Rápido, pero dos fuentes de verdad para el dinero |

## Consecuencias

- (+) Correcto bajo concurrencia sin bloqueos largos; fácil de probar.
- (+) Taquilla y web comparten exactamente la misma regla.
- (−) La fila de una función muy demandada es un punto caliente; aceptable para ~800 lugares máximos.
- Vistas afectadas: procesos, escenarios.
