# ADR-0007: Integrar el proveedor de pagos detrás de una capa anticorrupción

- Estado: propuesta (proveedor a confirmar)
- Fecha: 2026-11-19 · Autor: @Kevrc · Specs: 002
- Drivers: QA-1, QA-9, QA-12, C-3 ([drivers](../arquitectura/00-drivers.md))

## Contexto

La plataforma no almacena tarjetas (Constitución V). En Ecuador hay proveedores con modo de prueba
(p. ej. PayPhone). Las confirmaciones llegan de forma asíncrona y pueden repetirse o llegar tarde.

## Decisión

- Boletería define un **puerto** `ProveedorPagos` (iniciar cobro, consultar, devolver) y un
  **adaptador** por proveedor; en desarrollo y pruebas se usa un adaptador simulado.
- El asistente paga en la página del proveedor; la confirmación llega por **webhook** firmado y
  se procesa de forma idempotente (por referencia del proveedor).
- Si el webhook no llega, un trabajo **concilia** cada 2 minutos los pedidos pendientes
  consultando al proveedor.
- Importes en centavos enteros; cada movimiento se registra de forma inmutable.

## Criterios para elegir el proveedor

El adaptador se escribe para el proveedor que cumpla **todas** las necesidades obligatorias; el
equipo verifica cada una en la documentación oficial antes de pasar esta ADR a "aceptada".

| Necesidad | Driver | Obligatoria |
|-----------|--------|:-----------:|
| Cobro en USD a tarjetas emitidas en Ecuador | C-3 | sí |
| Modo de prueba (sandbox) con tarjetas de prueba | C-3, constitución IV | sí |
| Confirmación asíncrona por webhook firmado o consulta de estado | QA-9 | sí |
| API de devolución total por transacción | 002 US5, FR-012 | sí |
| Página de pago alojada por el proveedor (la plataforma no toca la tarjeta) | Constitución V | sí |
| Referencia propia (nuestro id de pedido) en la transacción, para idempotencia | QA-1, QA-9 | sí |
| Comisión por transacción baja frente a USD 5 por entrada | C-2 | deseable |

Candidatos a evaluar: PayPhone, Kushki, Datafast (u otro que cumpla la tabla).

## Alternativas

- Llamar al SDK del proveedor desde el dominio: ata Boletería a un proveedor y complica las pruebas.
- Seguir usando cultura.ec como en 2026: no permite demostrar la arquitectura de la boletería.

## Consecuencias

- (+) Cambiar de proveedor es escribir otro adaptador.
- (+) Pruebas de concurrencia e idempotencia sin dinero real.
- (−) Un pago confirmado tarde sobre un pedido expirado exige devolución automática
  (spec 002, US1-AS6).
- Vistas afectadas: lógica, procesos, física.
