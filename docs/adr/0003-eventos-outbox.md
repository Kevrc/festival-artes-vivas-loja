# ADR-0003: Publicar eventos de dominio con outbox transaccional y cola

- Estado: aceptada
- Fecha: 2026-11-19 · Autor: @Kevrc · Specs: 001–004

## Contexto

Los módulos se avisan cambios (`FuncionCancelada`, `EntradasEmitidas`,
`PostulacionSeleccionada`…; catálogo en `docs/dominio.md`). Si un evento se pierde, un comprador
no se entera de una cancelación o la cartelera muestra un horario viejo. Si se publica sin que la
transacción se confirme, se avisa algo que no ocurrió.

## Decisión

**Patrón outbox**: el módulo guarda el cambio y el evento en la **misma transacción** (tabla
`outbox` de su esquema). Un *relay* en el proceso worker lee los eventos pendientes y los encola
en **BullMQ** (Redis); cada módulo consumidor tiene su cola. Los consumidores son
**idempotentes**: registran el `id` del evento procesado y descartan repetidos.

## Alternativas

| Opción | En contra |
|--------|-----------|
| Llamadas directas entre módulos | Acopla y propaga fallos (si Identidad cae, no se puede cancelar una función) |
| Bus en memoria (EventEmitter) | Si el proceso se reinicia, los eventos se pierden |
| Kafka / RabbitMQ | Infraestructura extra innecesaria para este volumen; Redis ya está por BullMQ |

## Consecuencias

- (+) Entrega al menos una vez y sin eventos fantasma.
- (+) Un consumidor caído no bloquea al publicador; se pone al día al volver.
- (−) Consistencia eventual: la cartelera puede tardar segundos en reflejar un cambio (dentro del
  objetivo de < 1 minuto, RNF de 001 y 004).
- Vistas afectadas: lógica, procesos.
