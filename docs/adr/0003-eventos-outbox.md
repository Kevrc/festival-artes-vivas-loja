# ADR-0003: Publicar eventos de dominio en una cola transaccional sobre PostgreSQL

- Estado: aceptada
- Fecha: 2026-11-19 · Autor: @Kevrc · Specs: 001–004
- Drivers: QA-4, QA-6, QA-10, QA-12, QA-13, C-2 ([drivers](../arquitectura/00-drivers.md))

## Contexto

Los módulos se avisan cambios (`FuncionCancelada`, `EntradasEmitidas`,
`PostulacionSeleccionada`…; catálogo en `docs/dominio.md`).

**Necesidades**

| Necesidad | Driver | Qué pasa si no se cumple |
|-----------|--------|---------------------------|
| Un evento existe **solo si** su cambio de negocio se confirmó | QA-6 | Se avisa una cancelación que no ocurrió |
| Ningún evento se pierde si un proceso se reinicia | QA-6 | Un comprador no se entera de la cancelación |
| Un módulo caído no bloquea a los demás | QA-4 | Si Identidad falla, no se podría cancelar una función |
| Reintentos, diferidos y deduplicación | 004 US10, 002 FR-004 | Avisos duplicados o pedidos que nunca expiran |
| Volumen < 50 eventos/s en el pico | Dimensionamiento | — |
| No añadir infraestructura sin necesidad | Constitución X, C-2 | Más piezas que operar y respaldar |

## Decisión

Cada evento se **encola en PostgreSQL con pg-boss dentro de la misma transacción** que el cambio
de negocio. La tabla de trabajos de pg-boss cumple el papel del *outbox*: si la transacción se
revierte, el evento desaparece con ella. El proceso **worker** consume las colas (una por módulo
consumidor). Los consumidores son **idempotentes**: registran el `id` del evento y descartan repetidos.

```
BEGIN
  UPDATE operacion.funcion SET estado = 'cancelada' …
  INSERT INTO operacion.cambio_funcion …
  pgboss.send('boleteria.funcion-cancelada', evento)      -- misma conexión
  pgboss.send('programacion.funcion-cancelada', evento)
  pgboss.send('identidad.funcion-cancelada', evento)
COMMIT
```

## Alternativas

| Opción | Cubre las necesidades | En contra |
|--------|-----------------------|-----------|
| **Cola transaccional en PostgreSQL** (elegida) | Todas | Más carga en PostgreSQL (irrelevante a < 50/s) |
| Outbox + relay hacia Redis/BullMQ | Todas | Un proceso relay y un Redis más que operar, sin necesidad que lo pida |
| Llamadas directas entre módulos | No cubre QA-4 | Acopla y propaga fallos |
| Bus en memoria (EventEmitter) | No cubre "no perder eventos" | Si el proceso se reinicia, los eventos se pierden |
| RabbitMQ / Kafka | Todas | Infraestructura distribuida desproporcionada para este volumen (C-2) |

## Consecuencias

- (+) Entrega al menos una vez, sin eventos fantasma y sin proceso relay.
- (+) Un solo almacén con estado: un respaldo cubre datos y colas.
- (−) Consistencia eventual: la cartelera puede tardar segundos en reflejar un cambio, dentro del
  objetivo de < 1 minuto (QA-6).
- (−) Si PostgreSQL cae, tampoco hay colas; aceptable porque sin base de datos no hay escrituras
  que publicar.
- Revisión: superar ~500 eventos/s sostenidos.
- Vistas afectadas: lógica, procesos.
