# ADR-0011: Enviar notificaciones desde una cola con deduplicación y reintentos

- Estado: propuesta
- Fecha: 2026-11-20 · Autor: @jeimytorresg · Specs: 004 (US10), 002, 003
- Drivers: QA-4, QA-6 ([drivers](../arquitectura/00-drivers.md))

## Contexto

Identidad envía por correo los avisos de todos los módulos (FR-021):

| Necesidad | Origen |
|-----------|--------|
| Entradas por correo en < 1 min (95 %) | US10-AS1, RNF-005, SC-008 |
| Reintentos con espera creciente hasta 24 h; luego "fallida" | US10-AS2 |
| Un evento repetido envía un solo correo | US10-AS3, RN-011 |
| Un fallo del correo no bloquea compras ni postulaciones | RNF-007 |
| Proveedor de correo intercambiable | Constitución X, ADR-0007 (mismo patrón que pagos) |

## Decisión

Al consumir un evento, Identidad crea una fila en `identidad.notificacion` con una **clave de
deduplicación única** (`tipoEvento:eventoId:destinatario`) y, en la misma transacción, encola el
trabajo `identidad.enviar-notificacion` en pg-boss ([ADR-0003](0003-eventos-outbox.md)). El
trabajo llama al puerto `ProveedorCorreo` (adaptador SMTP con nodemailer: Mailpit en desarrollo,
proveedor SMTP en producción) y reintenta con espera creciente; pasadas 24 h desde la creación,
marca la notificación como `fallida` para revisión.

## Alternativas

| Opción | A favor | En contra |
|--------|---------|-----------|
| **Fila + trabajo pg-boss** (elegida) | Reutiliza la cola existente; deduplicación por restricción única; historial gratis para "Mis notificaciones" | Más filas en PostgreSQL (volumen bajo) |
| Enviar el correo dentro de la transacción del negocio | Simple | Un correo lento o caído bloquea compras (viola RNF-007) |
| Cola dedicada (Redis/BullMQ) | Herramientas de colas maduras | Infraestructura nueva sin necesidad (C-2) |
| API HTTP propietaria de un proveedor | Plantillas en su panel | Acopla a un proveedor; SMTP sirve con cualquiera |

## Consecuencias

- **Positivas**: los módulos solo publican eventos; el historial de avisos queda auditado.
- **Negativas**: los datos de entradas (token QR) se guardan hasta el envío; se borran de la fila
  al enviarse.
- **Vistas 4+1**: procesos (secuencia de cancelación → avisos) y física (servidor SMTP externo,
  Mailpit en desarrollo).
